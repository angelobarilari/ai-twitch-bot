# AI Twitch Bot

A small, modular Twitch chat bot that answers questions in chat using the Gemini API. The project keeps Twitch client setup, command handling, config validation, and AI integration separated so it can grow without becoming a monolithic entry point.

## Overview

This project connects to Twitch chat, listens for commands such as `!ping` and `!question`, and forwards user questions to Gemini for response generation. It is designed for local experimentation, private channel use, and iterative feature development.

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

Phase 1 stability work was merged in [PR #11](https://github.com/angelobarilari/ai-twitch-bot/pull/11). Phase 2 input and resource protection is implemented on this branch and awaits review and integration. See [ROADMAP.md](./ROADMAP.md) for delivery status and [SECURITY.md](./SECURITY.md) for trust boundaries, abuse limits, and credential operations.

## Tech Stack

- Node.js 20+
- TypeScript
- `tmi.js`
- Gemini API via Google AI Studio
- `tsx` for local development

## Project Structure

```text
.
├── src/
│   ├── commands/
│   │   ├── <command>/
│   │   │   ├── index.ts
│   │   │   └── <command>.test.ts
│   │   ├── shared/
│   │   │   ├── ai-state.ts
│   │   │   └── permissions.ts
│   │   ├── index.ts
│   │   ├── router.ts
│   │   └── router.test.ts
│   ├── types/
│   │   └── commands.ts
│   ├── services/
│   │   ├── abuse-limiter.ts
│   │   ├── abuse-limiter.test.ts
│   │   ├── gemini.ts
│   │   ├── gemini.test.ts
│   │   ├── response-language.ts
│   │   ├── response-language.test.ts
│   │   ├── shutdown.ts
│   │   ├── shutdown.test.ts
│   │   ├── twitch-client-options.ts
│   │   └── twitch-client-options.test.ts
│   ├── test-support/
│   │   └── with-test-environment.ts
│   ├── utils/
│   │   └── <utility-name>/
│   │       ├── index.ts
│   │       └── <utility-name>.test.ts
│   ├── config.ts
│   ├── config.test.ts
│   └── index.ts
├── .env.example
├── .gitignore
├── README.md
├── ROADMAP.md
├── SECURITY.md
├── PROJECT_CONVENTIONS.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── .github/
└── .husky/
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
- New duration settings must be positive safe integers no greater than 2,147,483,647 ms; the per-window attempt limit is at most 100 and the strike threshold at most 20. See [abuse limits](./SECURITY.md#abuse-limits) for expiration and command budgets.
- Keep `.env` out of version control and never commit real secrets. See [credential rotation](./SECURITY.md#rotate-credentials) for replacement steps.

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

The bot normalizes incoming Unicode with NFKC, rejects malformed Unicode and hidden controls, trims whitespace, and treats the first whitespace-separated token as a command when it begins with `!`. Command names are matched without regard to case; the remaining text is passed to the command as its arguments. Messages that are not commands, contain only the `!` prefix, use an unknown command name, or were authored by the bot itself are ignored without a reply. Excess commands are silently dropped according to the separate ordinary and administrative budgets documented in [SECURITY.md](./SECURITY.md#abuse-limits).

## Safety and Usage Notes

- Local safety checks and Gemini safety settings are used, but they are not a substitute for human moderation. Questions and generated answers are checked for common injection patterns, administrative commands, unexpected links, and sensitive data. Heuristic filters can miss attacks or reject legitimate text; see [security details](./SECURITY.md).
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

## Testing

Run the project tests with:

```bash
npm test
```

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

Branches, commits, and pull requests must follow [`PROJECT_CONVENTIONS.md`](./PROJECT_CONVENTIONS.md). Work on a focused branch created from an up-to-date `main`; use the required branch prefix and English kebab-case description. Commit messages and PR titles/descriptions must be in English and follow the documented Conventional Commits and PR formats.

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
