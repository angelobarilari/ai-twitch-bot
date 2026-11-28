export type LogLevel = "debug" | "info" | "warn" | "error";
export type HealthState = "unknown" | "ready" | "degraded" | "stopped";
export type Metadata = {
  outcome?: string;
  command?: string;
  durationMs?: number;
  status?: number;
  attempts?: number;
  queueWaiting?: number;
  count?: number;
  enabled?: boolean;
  maxPendingQuestions?: number;
  questionTimeoutMs?: number;
  questionQueueTimeoutMs?: number;
  geminiTimeoutMs?: number;
  maxRetries?: number;
  maxQuestionLength?: number;
  maxAnswerLength?: number;
  category?: "operational" | "bug";
};

const commands = new Set([
  "ai",
  "about",
  "help",
  "language",
  "ping",
  "queue",
  "question",
  "clearcontext",
  "status",
]);

const outcomes = new Set([
  "success",
  "error",
  "timeout",
  "cancelled",
  "rejected",
  "cooldown",
  "full",
  "expired",
  "cleared",
  "empty_response",
  "http_error",
  "invalid_response",
  "max_tokens",
  "network_error",
  "unsafe",
  "too_long",
]);

const events = new Set([
  "gemini.request",
  "question.completed",
  "question.queued",
  "question.rejected",
  "queue.expired",
  "queue.cleared",
  "queue.notification.failed",
  "command.completed",
  "twitch.state",
  "process.health",
  "process.startup",
  "process.shutdown",
  "persistence.write",
  "admin.ai.changed",
  "settings.language.changed",
]);

/**
 * Creates bounded, content-free operational telemetry.
 * @param sink Optional destination for serialized JSON records.
 * @returns Logging, counters, aggregate timings, and independent component health.
 */
export const createObservability = (sink?: (level: LogLevel, line: string) => void) => {
  const counters: Record<string, number> = {};
  const aggregates: Record<string, { count: number; total: number; max: number }> = {};
  let connectedOnce = false;
  const health: Record<"twitch" | "gemini" | "aiState" | "language", HealthState> = {
    twitch: "unknown",
    gemini: "unknown",
    aiState: "unknown",
    language: "unknown",
  };
  /**
   * Writes an already sanitized operational record through the configured sink.
   * @param level Record severity.
   * @param record Content-free structured record.
   * @returns Nothing.
   */
  const emit = (level: LogLevel, record: object): void => {
    const line = JSON.stringify({ timestamp: new Date().toISOString(), level, ...record });
    if (sink) sink(level, line);
    else console[level](line);
  };
  /**
   * Emits only allowlisted metadata; arbitrary strings and error objects are discarded.
   * @param level Record severity.
   * @param event Stable event identifier.
   * @param metadata Numeric or enumerated operational details.
   * @returns Nothing.
   */
  const log = (level: LogLevel, event: string, metadata: Metadata = {}): void => {
    if (!events.has(event)) return;
    const safe: Record<string, string | number | boolean> = {};
    for (const key of [
      "durationMs",
      "status",
      "attempts",
      "queueWaiting",
      "count",
      "maxPendingQuestions",
      "questionTimeoutMs",
      "questionQueueTimeoutMs",
      "geminiTimeoutMs",
      "maxRetries",
      "maxQuestionLength",
      "maxAnswerLength",
    ] as const) {
      const value = metadata[key];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) safe[key] = value;
    }
    if (metadata.outcome && outcomes.has(metadata.outcome)) safe.outcome = metadata.outcome;
    if (metadata.command && commands.has(metadata.command)) safe.command = metadata.command;
    if (typeof metadata.enabled === "boolean") safe.enabled = metadata.enabled;
    if (metadata.category === "bug" || metadata.category === "operational")
      safe.category = metadata.category;
    emit(level, { event, ...safe });
  };
  /**
   * Increments a fixed operational counter.
   * @param name Internal metric identifier; never user input.
   * @returns Nothing.
   */

  const increment = (name: string): void => {
    counters[name] = (counters[name] ?? 0) + 1;
  };

  /**
   * Adds one numeric observation without retaining individual samples.
   * @param name Internal aggregate identifier.
   * @param value Nonnegative measurement.
   * @returns Nothing.
   */

  const observe = (name: string, value: number): void => {
    if (!Number.isFinite(value) || value < 0) return;
    const entry = aggregates[name] ?? { count: 0, total: 0, max: 0 };
    entry.count += 1;
    entry.total += value;
    entry.max = Math.max(entry.max, value);
    aggregates[name] = entry;
  };

  /**
   * Changes a component's observed health and suppresses duplicate Twitch transitions.
   * @param component Component being updated.
   * @param state Last observed state, not a live external probe.
   * @returns Nothing.
   */
  const setHealth = (component: keyof typeof health, state: HealthState): void => {
    if (health[component] === state) return;
    health[component] = state;
    if (component === "twitch") {
      if (state === "degraded" && connectedOnce) increment("reconnections");
      if (state === "ready") connectedOnce = true;
      log(state === "degraded" ? "warn" : "info", "twitch.state", {
        outcome: state === "ready" ? "success" : state === "degraded" ? "error" : "cancelled",
      });
    }
  };

  /**
   * Copies metrics and health for local inspection without exposing mutable state.
   * @returns Process-local counters, aggregates including means, and observed health.
   */
  const snapshot = () => ({
    counters: { ...counters },
    aggregates: Object.fromEntries(
      Object.entries(aggregates).map(([key, value]) => [
        key,
        { ...value, mean: value.total / value.count },
      ]),
    ),
    health: { ...health },
    questionRates: {
      success:
        (counters["questions.success"] ?? 0) / (aggregates["questions.durationMs"]?.count || 1),
      timeout:
        (counters["questions.timeout"] ?? 0) / (aggregates["questions.durationMs"]?.count || 1),
      error:
        ((aggregates["questions.durationMs"]?.count ?? 0) -
          (counters["questions.success"] ?? 0) -
          (counters["questions.timeout"] ?? 0)) /
        (aggregates["questions.durationMs"]?.count || 1),
    },
  });

  /**
   * Emits a snapshot without routing around the injected log sink.
   * @param queue Current bounded queue activity and waiting count.
   * @param enabled Current AI switch.
   * @returns Nothing.
   */
  const reportHealth = (queue: { active: boolean; waiting: number }, enabled: boolean): void => {
    emit("info", {
      event: "process.health",
      ...snapshot(),
      queue: { active: queue.active, waiting: queue.waiting },
      enabled,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  };
  return {
    log,
    increment,
    observe,
    setHealth,
    snapshot,
    reportHealth,
    debug: (event: string, metadata?: Metadata): void => log("debug", event, metadata),
    info: (event: string, metadata?: Metadata): void => log("info", event, metadata),
    warn: (event: string, metadata?: Metadata): void => log("warn", event, metadata),
    error: (event: string, metadata?: Metadata): void => log("error", event, metadata),
  };
};

export type Observability = ReturnType<typeof createObservability>;
export type Logger = Pick<Observability, "debug" | "info" | "warn" | "error">;
export const observability = createObservability();

/**
 * Starts an unreferenced periodic health and metrics record.
 * @param queue Callback supplying current queue activity.
 * @param enabled Callback supplying the current AI switch.
 * @param intervalMs Reporting interval in milliseconds.
 * @param telemetry Isolated telemetry instance for this application.
 * @returns Cleanup callback to stop reporting.
 */
export const startHealthReporting = (
  queue: () => { active: boolean; waiting: number },
  enabled: () => boolean,
  intervalMs = 60_000,
  telemetry: Observability = observability,
): (() => void) => {
  const timer = setInterval(() => {
    telemetry.reportHealth(queue(), enabled());
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
};
