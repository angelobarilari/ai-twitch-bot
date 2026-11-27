import type { Observability } from "../observability/index.js";

export type QuestionOutcome = "success" | "error" | "timeout" | "cancelled" | "unsafe" | "too_long";
export type QueueStatus = { active: boolean; waiting: number };
export type QueueWork = {
  run: (signal: AbortSignal) => Promise<QuestionOutcome>;
  expired: () => Promise<unknown>;
  removed: (reason: "moderator" | "shutdown") => Promise<unknown>;
  timedOut: () => Promise<unknown>;
};
export type QueueTicket = { completion: Promise<void>; position: number | null };
export type QuestionQueue = {
  enqueue: (work: QueueWork) => QueueTicket | null;
  dequeue: () => void;
  clear: () => Promise<number>;
  status: () => QueueStatus;
  isAccepting: () => boolean;
  stopAccepting: () => void;
  waitForIdle: () => Promise<void>;
};
type Pending = {
  work: QueueWork;
  enqueuedAt: number;
  timer?: NodeJS.Timeout;
  resolve: () => void;
  reject: (error: unknown) => void;
};

/**
 * Creates a bounded serial queue with separate waiting and active deadlines.
 * @param options Capacity, deadlines, monotonic clock, and content-free telemetry.
 * @returns Queue operations independent of Twitch, providers, and persistence.
 * @throws If capacity or deadlines are invalid.
 */
export const createQuestionQueue = (options: {
  capacity: number;
  activeTimeoutMs: number;
  waitingTimeoutMs: number;
  now?: () => number;
  telemetry: Observability;
}): QuestionQueue => {
  for (const value of [options.capacity, options.activeTimeoutMs, options.waitingTimeoutMs]) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647)
      throw new RangeError("Queue limits must be positive supported integers.");
  }
  const { telemetry } = options;
  const now = options.now ?? performance.now.bind(performance);
  const pending: Pending[] = [];
  let active = false;
  let accepting = true;
  let idleWaiters: Array<() => void> = [];

  /**
   * Resolves drain waiters only after all accepted work is settled.
   * @returns Nothing.
   */
  const settleIdle = (): void => {
    if (active || pending.length) return;
    for (const resolve of idleWaiters) resolve();
    idleWaiters = [];
  };
  /**
   * Observes notification failures without delaying queue progress.
   * @param notify Notification callback without any serialized payload.
   * @returns Nothing.
   */
  const notifyDetached = (notify: () => Promise<unknown>): void => {
    void Promise.resolve()
      .then(notify)
      .catch(() =>
        telemetry.error("queue.notification.failed", { outcome: "error", category: "operational" }),
      );
  };
  /**
   * Processes one item with a deadline that always releases queue capacity.
   * @param item Accepted waiting item.
   * @returns Completion of the timed operation.
   */
  const execute = async (item: Pending): Promise<void> => {
    const startedAt = performance.now();
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    let outcome: QuestionOutcome = "error";
    try {
      outcome = await Promise.race([
        Promise.resolve().then(() => item.work.run(controller.signal)),
        new Promise<QuestionOutcome>((resolve) => {
          timer = setTimeout(() => {
            controller.abort();
            resolve("timeout");
          }, options.activeTimeoutMs);
        }),
      ]);
      if (outcome === "timeout") notifyDetached(item.work.timedOut);
    } finally {
      if (timer) clearTimeout(timer);
      telemetry.increment(`questions.${outcome}`);
      telemetry.observe("questions.durationMs", performance.now() - startedAt);
      telemetry.log(
        outcome === "success" ? "info" : outcome === "error" ? "error" : "warn",
        "question.completed",
        {
          outcome,
          category: "operational",
          durationMs: performance.now() - startedAt,
          queueWaiting: pending.length,
        },
      );
    }
  };
  /**
   * Dequeues the oldest waiting item only when the worker is idle.
   * @returns Nothing; completion belongs to the ticket returned by enqueue.
   */
  const dequeue = (): void => {
    if (active) return;
    const item = pending.shift();
    if (!item) {
      settleIdle();
      return;
    }
    if (item.timer) clearTimeout(item.timer);
    telemetry.observe("queue.waitMs", Math.max(0, now() - item.enqueuedAt));
    active = true;
    void execute(item).then(
      () => {
        active = false;
        item.resolve();
        dequeue();
      },
      (error: unknown) => {
        active = false;
        item.reject(error);
        dequeue();
      },
    );
  };
  /**
   * Accepts one unit of work or rejects it without allocating a timer.
   * @param work Provider and transport callbacks supplied by the caller.
   * @returns A completion ticket and waiting position, or null if stopped/full.
   */
  const enqueue = (work: QueueWork): QueueTicket | null => {
    if (!accepting || pending.length + Number(active) >= options.capacity) return null;
    const position = active ? pending.length + 1 : null;
    const completion = new Promise<void>((resolve, reject) => {
      const item: Pending = { work, enqueuedAt: now(), resolve, reject };
      item.timer = setTimeout(() => {
        const index = pending.indexOf(item);
        if (index < 0) return;
        pending.splice(index, 1);
        telemetry.increment("queue.expired");
        telemetry.observe("queue.waitMs", Math.max(0, now() - item.enqueuedAt));
        telemetry.warn("queue.expired", { outcome: "expired" });
        item.resolve();
        notifyDetached(item.work.expired);
        settleIdle();
      }, options.waitingTimeoutMs);
      pending.push(item);
      telemetry.increment("questions.accepted");
      telemetry.debug("question.queued", { queueWaiting: pending.length });
      dequeue();
    });
    return { completion, position };
  };
  /**
   * Removes waiting work while preserving the active request.
   * @returns Removed items whose deadlines and completion promises are settled.
   */
  const removeWaiting = (): Pending[] => {
    const removed = pending.splice(0);
    for (const item of removed) {
      if (item.timer) clearTimeout(item.timer);
      item.resolve();
    }
    telemetry.info("queue.cleared", { outcome: "cleared", count: removed.length });
    settleIdle();
    return removed;
  };
  return {
    enqueue,
    dequeue,
    clear: async () => {
      const removed = removeWaiting();
      await Promise.all(removed.map((item) => item.work.removed("moderator")));
      return removed.length;
    },
    status: () => ({ active, waiting: pending.length }),
    isAccepting: () => accepting,
    stopAccepting: () => {
      accepting = false;
      for (const item of removeWaiting()) notifyDetached(() => item.work.removed("shutdown"));
    },
    waitForIdle: () =>
      active || pending.length
        ? new Promise((resolve) => idleWaiters.push(resolve))
        : Promise.resolve(),
  };
};
