# AI Twitch Bot

A small, modular Twitch chat bot that answers questions in chat using the Gemini API. The project keeps Twitch client setup, command handling, config validation, and AI integration separated so it can grow without becoming a monolithic entry point.

## Overview

This project connects to Twitch chat, listens for commands such as `!ping` and `!question`, and forwards user questions to Gemini for response generation. It is designed for local experimentation, private channel use, and iterative feature development.

## Application composition

Importing `src/app.ts` or the domain factories does not load dotenv, read state files, connect to Twitch, or call the provider. `createApp` accepts validated configuration, a `TwitchClient`, an AI-switch `StateStore<boolean>`, and a language `StateStore<string>`. It can also receive an `AiProvider`, `QuestionQueue`, clock, and isolated telemetry instance. Calling `start()` connects once and starts health reporting; `shutdown()` stops admission, clears waiting work, drains the active item, stops reporting, and disconnects once. Connection and shutdown failures reject their promises; only the process entrypoint sets the exit code.

The default Gemini provider is created from configuration and the injected language store. Replace it with any object implementing `ask(question, options)` to change the provider without editing commands. Answer safety, character limits, concise retries, and Twitch chunking remain in the provider-independent answer handler. Provider HTTP retries and deadlines remain in `ai/gemini`. Replace a store with synchronous `get/set` operations to change persistence; failed writes must throw before changing the stored value. The file adapters retain atomic replacement, legacy-file migration, size limits, and last-known in-memory values.

`QuestionQueue` owns capacity (active plus waiting), FIFO scheduling, waiting expiry, the active deadline, clear, and shutdown draining. `enqueue` returns a completion ticket and queue position or null when admission fails; `dequeue` starts the next item only while idle. Commands supply execution and notification callbacks. An expired or cleared item settles without invoking the provider; a timeout aborts its signal and frees capacity even if the provider ignores cancellation. Providers must honor cancellation to terminate their underlying work.

`RateLimiter` exposes `consume` and progressive `penalize` operations. `Logger` exposes `debug/info/warn/error(event, metadata)`; `createObservability(sink)` routes sanitized operational records and periodic health through the same injected sink. Each application has its own command registry, cooldowns, queue, provider, stores, and telemetry. Compatibility exports in `services/`, command `index.ts` files, and former utility paths preserve existing callers; new composition imports the injected factories directly.

Shared fakes in `src/test-support/fakes.ts` provide in-memory stores with write-failure controls, a provider with concurrency counters, deferred promises, a Twitch transport with connection/reply controls, and explicit validated test configuration. Integration tests exercise two independent applications, provider/store replacement, serial work, reply failures, shutdown draining, and startup failures without real network calls or local credentials.

## Features

- Twitch chat connection using `tmi.js`
- Modular command architecture for commands and queue logic
- Gemini API integration for chat responses with sanitized, structured request logging
- Automatic AI response language matching the question, with an optional fixed-language override
- `!help`, `!about`, `!ping`, `!status`, `!question`, `!ai`, and `!queue` commands
- Viewer-configurable, channel-wide response language with `!language`
- Moderator-only AI controls and queue inspection/clearing
- Bounded pending-question queue with limit validation via `MAX_PENDING_QUESTIONS`
- Automatic Twitch reconnection and graceful shutdown on termination signals
- Privacy-conscious logs that hide the actual question, response, and API key
- Unicode normalization, injection and sensitive-content filters, and response length safeguards
- Per-user attempt windows, progressive abuse penalties, temporary bans, and optional question access policies
- Separate ordinary and administrative command budgets; dependency and secret scanning in CI
- Runtime validation for environment variables and numeric settings
- TypeScript codebase with automated validation tests

## Current Implementation Status

The bot supports a complete Twitch chat flow: viewers can ask questions, check whether AI responses are enabled, and set the channel-wide response language; moderators can control the AI and inspect or clear the queue. Failed Gemini requests and Twitch replies are logged and handled so subsequent queued questions can continue. Gemini request logs include outcome, duration, and HTTP status without exposing sensitive request content.

Phases 1, 2, and 3 were merged in [PR #11](https://github.com/angelobarilari/ai-twitch-bot/pull/11), [PR #13](https://github.com/angelobarilari/ai-twitch-bot/pull/13), and [PR #14](https://github.com/angelobarilari/ai-twitch-bot/pull/14). Phase 4 architecture work is implemented and validated locally on this branch; review and integration are pending. See [ROADMAP.md](./docs/ROADMAP.md) for delivery status and [SECURITY.md](./docs/SECURITY.md) for trust boundaries, abuse limits, and credential operations.

## Tech Stack

- Node.js 20+
- TypeScript
- `tmi.js`
- Gemini API via Google AI Studio
- `tsx` for local development

## Project Structure

```text
src/
  index.ts                 # Process boundary: dotenv/config, real stores and transport, signals
  app.ts                   # Isolated application composition and lifecycle
  config.ts                # Existing runtime configuration adapter
  config/validate.ts       # Pure validator accepting explicit environment values
  ai/
    types.ts               # AiProvider and AskOptions
    answer.ts              # Provider-independent answer validation and chat delivery
    gemini/
      index.ts             # HTTP transport, deadlines, bounded retries, telemetry
      prompt.ts            # Trusted system instructions and untrusted user message
      response.ts          # Validation of unknown provider payloads
  commands/
    <command>/
      handler.ts           # Dependency-injected factory for commands that need state/config
      index.ts             # Existing default handler and compatibility exports
      <command>.test.ts
    shared/                # Compatibility accessors and permission exports
    router.ts              # Existing default-registry adapter
  twitch/
    types.ts               # Narrow transport contract
    client.ts              # tmi.js adapter
    client-options.ts      # Credentials and bounded reconnect settings
    connection.ts          # Event wiring, connection state, disconnect handling
    message-handler.ts     # Parsing, command dispatch, command rate limits
    shutdown.ts            # Signal registration and compatibility shutdown adapter
  queue/question-queue.ts  # Bounded serial scheduling, expiry, timeout, clear, drain
  stores/                  # StateStore<T>, atomic AI-state and language stores
  observability/           # JSON logger, metrics, health snapshots
  safety/                  # Normalization, content checks, permissions, rate limiter
  services/                # Compatibility adapters for previous import paths
  utils/                   # Small reusable text and filesystem helpers
  test-support/            # Shared Twitch/provider/store fakes and environment helpers
scripts/run-tests.mjs      # Cross-platform test discovery, watch, and JUnit reports
docs/                      # Maintained roadmap, conventions, security, quality
reports/                   # Generated test and coverage reports (gitignored)
```

The command folders are `about`, `ai`, `help`, `language`, `ping`, `question`, `queue`, and `status`. Each exposes its handler through `index.ts` and keeps focused tests beside it. Utilities follow the same pattern in individual kebab-case directories. `commands/index.ts` re-exports public handlers and command types; `commands/router.ts` handles parsing and dispatch, and shared command state and permission helpers live in `commands/shared/`.

## Requirements

- Twitch bot account
- Twitch user OAuth token for the bot account with only `chat:read` and `chat:edit` IRC scopes
- Gemini API key from Google AI Studio
- Node.js 20 or newer

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in your Twitch and Gemini values.
3. Install dependencies:

```bash
npm install
```

4. Run the app locally:

```bash
npm run dev
```

5. Or build and run the compiled version:

```bash
npm run build
npm start
```

## Environment Variables

The project expects the following variables in `.env`:

```env
TWITCH_BOT_USERNAME=your_bot_account_name
TWITCH_OAUTH_TOKEN=oauth:your_twitch_token
TWITCH_CHANNEL=your_channel_name
GEMINI_API_KEY=your_google_ai_studio_key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_LANGUAGE=auto
GEMINI_TIMEOUT_MS=10000
GEMINI_MAX_RETRIES=1
GEMINI_RETRY_BASE_DELAY_MS=250
QUESTION_TIMEOUT_MS=45000
QUESTION_QUEUE_TIMEOUT_MS=120000
AI_STATE_FILE=.data/ai-state.json
AI_LANGUAGE_FILE=.data/ai-language.json
COMMAND_COOLDOWN_SECONDS=15
USER_COOLDOWN_SECONDS=30
MAX_QUESTION_LENGTH=300
MAX_ANSWER_LENGTH=420
MAX_PENDING_QUESTIONS=5
QUESTION_ACCESS=everyone
QUESTION_WINDOW_MS=60000
MAX_QUESTIONS_PER_WINDOW=5
ABUSE_PENALTY_MS=1000
ABUSE_BAN_MS=300000
ABUSE_MAX_STRIKES=3
```

Notes:

- `TWITCH_CHANNEL` can be passed as `#channel` or `channel`.
- `GEMINI_LANGUAGE` defaults to `auto`, so answers use the language of the question unless the viewer explicitly requests another language. It is the initial response language when there is no saved `!language` preference.
- `AI_LANGUAGE_FILE` stores the channel-wide response language selected with `!language`; the default `.data/ai-language.json` path is git-ignored. When using that path, the bot migrates a valid legacy `.ai-language.json` file.
- Any viewer can change this channel-wide preference with `!language`, and the latest selection applies to all viewers. The command accepts `auto` or a language name up to 40 characters.
- If the saved language file is unreadable or invalid, startup reports an error instead of silently resetting the preference. A failed save is reported in chat and leaves the previous language active.
- `AI_STATE_FILE` stores whether AI responses are enabled; the default `.data/ai-state.json` path is git-ignored. If it does not exist, the AI defaults to enabled. When using the default path, the bot migrates a valid legacy `.ai-state.json` file. If you choose a custom path, keep that file out of version control.
- If the state file is unreadable or contains invalid data, startup reports an error instead of silently resetting the moderator-selected state.
- `GEMINI_TIMEOUT_MS` is the timeout for each provider request. `GEMINI_MAX_RETRIES` allows a bounded number of retries for network errors, timeouts, rate limits, and server failures; authentication and other client errors are not retried.
- `GEMINI_RETRY_BASE_DELAY_MS` controls exponential retry backoff. `QUESTION_TIMEOUT_MS` bounds active processing and must allow two Gemini requests with the configured retry policy. `QUESTION_QUEUE_TIMEOUT_MS` limits how long an accepted question may wait before processing.
- Persisted JSON state files are limited to 4 KiB and written through an atomic temporary-file replacement.
- Twitch usernames and OAuth tokens, Gemini model names, and response languages are validated before the client starts.
- Cooldowns must convert to positive safe millisecond durations. Message lengths, queue limits, and timeout values must be positive safe integers. `GEMINI_MAX_RETRIES` accepts 0 through 5, and `GEMINI_RETRY_BASE_DELAY_MS` accepts 0 through 60000.
- `MAX_QUESTION_LENGTH` is limited to 500 characters, `MAX_ANSWER_LENGTH` to 2,000 characters, and `MAX_PENDING_QUESTIONS` to 100 accepted questions (active and waiting); defaults are `300`, `420`, and `5`, respectively.
- `QUESTION_ACCESS` accepts `everyone`, `known`, `subscriber`, `moderator`, or `broadcaster`. The default preserves viewer access; `known` requires a Twitch username and numeric user ID.
- `QUESTION_WINDOW_MS` and `MAX_QUESTIONS_PER_WINDOW` default to 5 question attempts per user per 60 seconds, including rejected requests. Unsafe questions and user cooldown violations trigger progressive penalties from `ABUSE_PENALTY_MS`, with a temporary `ABUSE_BAN_MS` ban at `ABUSE_MAX_STRIKES`.
- New duration settings must be positive safe integers no greater than 2,147,483,647 ms; the per-window attempt limit is at most 100 and the strike threshold at most 20. See [abuse limits](./docs/SECURITY.md#abuse-limits) for expiration and command budgets.
- Keep `.env` out of version control and never commit real secrets. See [credential rotation](./docs/SECURITY.md#rotate-credentials) for replacement steps.

## Commands

### `!ping`

Checks that the bot is online and responding.

### `!status`

Shows whether AI question responses are currently enabled. This command is available to all viewers and does not expose queue details or moderator controls.

### `!language <language>` / `!language auto`

Sets the response language for the entire channel. Any viewer can use this command, so the latest selection applies to everyone. Use `!language auto` to answer in the language of each question unless the viewer asks for another language. The setting is saved in `AI_LANGUAGE_FILE` and survives restarts.

Examples:

```text
!language
!language Portuguese (Brazil)
!language auto
```

Calling `!language` without an argument shows the current setting. Command confirmations and usage errors are sent in English, regardless of the selected response language.

All built-in bot messages, including command replies, help text, and error messages, are in English. Generated AI answers follow the selected response language; with `auto`, they match each question's language.

### `!help`

Lists the available commands in English, including moderator-only controls and the configured question, cooldown, and queue limits.

### `!about`

Explains what the bot does and points viewers to `!help`.

### `!ai on` / `!ai off`

Enables or disables AI questions. Only moderators and the broadcaster can use this command. The enabled state is persisted in `AI_STATE_FILE` across restarts.

### `!queue` / `!queue clear`

Shows the active and waiting question counts, or clears waiting questions. Only moderators and the broadcaster can use these commands; an active request is not canceled. When a question waits behind an active request, the bot reports its current position.

### `!question <your question>`

Sends the question to Gemini and replies in chat.

Example:

```text
!question what is the capital of Brazil?
```

## Command Parsing and Dispatch

The bot normalizes incoming Unicode with NFKC, rejects malformed Unicode and hidden controls, trims whitespace, and treats the first whitespace-separated token as a command when it begins with `!`. Command names are matched without regard to case; the remaining text is passed to the command as its arguments. Messages that are not commands, contain only the `!` prefix, use an unknown command name, or were authored by the bot itself are ignored without a reply. Excess commands are silently dropped according to the separate ordinary and administrative budgets documented in [SECURITY.md](./docs/SECURITY.md#abuse-limits).

## Safety and Usage Notes

- Local safety checks and Gemini safety settings are used, but they are not a substitute for human moderation. Questions and generated answers are checked for common injection patterns, administrative commands, unexpected links, and sensitive data. Heuristic filters can miss attacks or reject legitimate text; see [security details](./docs/SECURITY.md).
- For public channels, keep cooldowns strict and consider role-based access controls.
- Gemini quota is external and may be limited or interrupted depending on provider limits.
- Do not treat the free tier as unlimited access.

## Operating and Troubleshooting

Run the bot from the project directory so relative state paths resolve consistently. Preserve the configured state and language files across restarts. The question queue is in memory and is not restored after a restart.

- **Invalid startup configuration:** compare the validation error with `.env.example`. Increasing Gemini retries may require increasing `QUESTION_TIMEOUT_MS` to accommodate the retry policy.
- **State or language cannot be loaded:** stop the bot and check the configured path, permissions, JSON validity, and 4 KiB size limit. Restore a known-good backup when available. Deliberately removing a file resets that setting to its documented startup default; preserve a copy before recovery.
- **A setting cannot be saved:** check directory write permissions and available disk space. The previous setting stays active in memory; resolve the storage error before retrying the command.
- **Questions time out or expire:** distinguish the Gemini request timeout, active-question timeout, and queue waiting timeout. Inspect sanitized Gemini outcome, duration, and HTTP status logs. Authentication and other non-retryable client failures require correcting the underlying problem rather than increasing retries.
- **Twitch disconnects:** check connection and reconnection messages. Automatic reconnection uses capped exponential backoff.

For a normal shutdown, send `SIGINT` (Ctrl+C where supported) or `SIGTERM`. The bot stops accepting questions, removes waiting questions, waits for active processing within its timeout, and disconnects from Twitch. Let shutdown finish before restarting or backing up state files.

## Structured logs, metrics, and health

Every operational record is a JSON line with `timestamp`, `level` (`debug`, `info`, `warn`, `error`), and a stable `event`. Only allowlisted numeric and enumerated metadata is emitted: chat text, usernames, channel names, provider payloads, exception messages, paths, and credentials are excluded. Collect stdout and stderr together to retain every severity.

Stable events include `process.startup`, `process.health`, `process.shutdown`, `twitch.state`, `command.completed`, `question.queued`, `question.completed`, `question.rejected`, `queue.expired`, `queue.cleared`, `queue.notification.failed`, `gemini.request`, `persistence.write`, `admin.ai.changed`, and `settings.language.changed`. A successful command completion means the handler returned; inspect `question.completed` for the answer delivery outcome. Errors carry an operational category where known; router `TypeError` and `ReferenceError` failures are classified as bugs. No raw exception is serialized.

`process.startup` reports safe queue, timeout, retry, and text limits. Every 60 seconds, `process.health` reports uptime, the AI switch, independent Twitch/Gemini/AI-state/language health, live queue activity and waiting count, counters, aggregate count/total/max/mean measurements, and question success/timeout/error fractions (zero before observations). Metrics stay in memory and reset on restart; there are no per-user labels or retained samples. Counters cover incoming non-self messages, commands by known type and outcome, command/question cooldowns, accepted and completed questions, queue expirations, Gemini outcomes, and reconnection cycles after an established connection. Aggregates cover queue wait, question and Gemini duration, and Unicode answer length after successful delivery. Non-success/non-timeout completions are included in the error fraction.

`!status` reports the AI switch, Twitch, Gemini, both persistence components, and current queue state. `unknown` means no observation yet; `ready` means the most recent observed operation succeeded; `degraded` means the last operation failed; `stopped` means shutdown finished. These are observations, not live API probes: Gemini stays unknown until the first request and persistence reflects successful startup reads or the most recent write. Queue state is read live. This bot is a CLI chat process, so no HTTP healthcheck listener is opened; add a loopback-only endpoint if it is deployed as a service.

For a timeout, compare `gemini.request` (`outcome`, `attempts`, `status`, `durationMs`) with `question.completed` and `queue.expired`: provider failure, active deadline, and queue waiting deadline are different paths. HTTP 401/403 requires credential/configuration correction; HTTP 429 and 5xx may use bounded retries. `twitch.state` only records transitions, suppressing repeated disconnected/reconnect notifications within one outage. Check the Twitch health and reconnection counter to distinguish an outage from a slow provider. `persistence.write` errors mark only the affected store degraded; check storage permissions, free space, and the configured state path, then retry the setting change to verify recovery. The previous in-memory setting remains active after a failed write.

## Testing

Coverage and generated test reports are part of Phase 4 testability work. Global coverage must always be at least 90% for each of lines, statements, functions, and branches. `npm run test:coverage` and CI fail below any of these thresholds. Run `npm run test:coverage` for the terminal summary, HTML, JSON, LCOV, and JUnit; open `reports/coverage/index.html` for file-by-file inspection. Run `npm run test:report` for JUnit without coverage. Reports stay in the ignored `reports/` directory; maintained documentation is indexed in [docs/README.md](./docs/README.md). See [quality and coverage](./docs/QUALITY.md) for scope, limitations, and CI artifacts.

Run the project tests with:

```bash
npm test
```

`npm test` discovers every `src/**/*.test.ts` recursively with Node APIs, avoiding shell glob differences on Windows and Linux. It ignores symlinks, `dist/`, and `node_modules/`. Each test file runs in its own Node test process with TypeScript support; any failure produces a nonzero exit status. CI runs the same suite on Windows and Linux.

```bash
npm test -- src/services/gemini.test.ts
npm run test:watch
npm run test:watch -- src/services/gemini.test.ts
```

Watch mode rediscovers tests after source changes, including newly created nested tests. With explicit files, it keeps that selection. Stop with Ctrl+C.

The automated suite covers startup configuration validation, including operational maxima; AI-state and language persistence, legacy-file migration, atomic replacement and interrupted writes; command-specific behavior and router dispatch; queue limits, timeouts, late Twitch reply failures and shutdown; Gemini retries, cancellation and malformed responses; and utility edge cases. Tests use fakes rather than real Twitch or Gemini network requests. Direct tests exist for every command, including viewer and moderator paths where applicable.

Gemini requests emit structured logs with the outcome, duration in milliseconds, and HTTP status when available. These logs intentionally exclude question/answer contents and API credentials.

Moderators and the broadcaster can use `!ai on` / `!ai off` to control new questions and `!queue` / `!queue clear` to inspect or remove waiting questions. Clearing the queue does not interrupt an answer already in progress. The bot uses tmi.js automatic reconnection with capped exponential backoff. On `SIGINT` / `SIGTERM`, it stops accepting questions, drops waiting questions, drains the active request up to its configured timeout, and disconnects cleanly.

## Formatting and Git Hooks

Run Prettier across the project with:

```bash
npm run format
```

`npm install` enables the Husky pre-commit hook. Before each commit, lint-staged formats supported staged files. GitHub Actions runs `npm run format:check` on pushes and pull requests.

## Git Workflow

Branches, commits, and pull requests must follow [`PROJECT_CONVENTIONS.md`](./docs/PROJECT_CONVENTIONS.md). Work on a focused branch created from an up-to-date `main`; use the required branch prefix and English kebab-case description. Commit messages and PR titles/descriptions must be in English and follow the documented Conventional Commits and PR formats.

Typical flow:

```bash
git checkout main
git pull --ff-only
git checkout -b feature/my-feature
git add path/to/changed-file
git commit -m "feat: add my feature"
git push -u origin feature/my-feature
```

Before opening a PR, rebase on `origin/main`, run formatting, tests, and build, and inspect the diff for secrets or local state files. PRs target `main` and use the `## Summary` and `## Validation` headings.

## License

This project is intended for personal and experimental use. If you plan to distribute or commercialize it, update the license accordingly.
