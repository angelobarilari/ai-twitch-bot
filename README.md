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
- Built-in cooldowns, unsafe-content filters, and response length safeguards
- Runtime validation for environment variables and numeric settings
- TypeScript codebase with automated validation tests

## Current Implementation Status

The bot supports a complete Twitch chat flow: viewers can ask questions, check whether AI responses are enabled, and set the channel-wide response language; moderators can control the AI and inspect or clear the queue. Failed Gemini requests and Twitch replies are logged and handled so subsequent queued questions can continue. Gemini request logs include outcome, duration, and HTTP status without exposing sensitive request content.

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
│   │   ├── index.ts
│   │   ├── index.test.ts
│   │   ├── help.ts
│   │   ├── help.test.ts
│   │   ├── about.ts
│   │   ├── about.test.ts
│   │   ├── ai.ts
│   │   ├── ai.test.ts
│   │   ├── ai-state.ts
│   │   ├── permissions.ts
│   │   ├── queue.ts
│   │   ├── ping.ts
│   │   ├── question.ts
│   │   ├── status.ts
│   │   └── language.ts
│   ├── types/
│   │   └── commands.ts
│   ├── services/
│   │   ├── gemini.ts
│   │   ├── gemini.test.ts
│   │   └── response-language.ts
│   ├── utils/
│   │   ├── chat.ts
│   │   └── chat.test.ts
│   ├── config.ts
│   ├── config.test.ts
│   └── index.ts
├── .env.example
├── .gitignore
├── README.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── .github/
└── .vscode/
```

## Requirements

- Twitch bot account
- Twitch OAuth token
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
AI_STATE_FILE=.ai-state.json
AI_LANGUAGE_FILE=.ai-language.json
COMMAND_COOLDOWN_SECONDS=15
USER_COOLDOWN_SECONDS=30
MAX_QUESTION_LENGTH=300
MAX_ANSWER_LENGTH=420
MAX_PENDING_QUESTIONS=5
```

Notes:

- `TWITCH_CHANNEL` can be passed as `#channel` or `channel`.
- `GEMINI_LANGUAGE` defaults to `auto`, so answers use the language of the question unless the viewer explicitly requests another language. It is the initial response language when there is no saved `!language` preference.
- `AI_LANGUAGE_FILE` stores the channel-wide response language selected with `!language`; it defaults to `.ai-language.json` in the working directory and is git-ignored.
- Any viewer can change this channel-wide preference with `!language`, and the latest selection applies to all viewers. The command accepts `auto` or a language name up to 40 characters.
- If the saved language file is unreadable or invalid, startup reports an error instead of silently resetting the preference. A failed save is reported in chat and leaves the previous language active.
- `AI_STATE_FILE` stores whether AI responses are enabled; it defaults to `.ai-state.json` in the working directory, which is git-ignored. If it does not exist, the AI defaults to enabled. If you choose a custom path, keep that file out of version control.
- If the state file is unreadable or contains invalid data, startup reports an error instead of silently resetting the moderator-selected state.
- Numeric values must be positive finite numbers. `MAX_PENDING_QUESTIONS` must be a positive safe integer.
- `MAX_PENDING_QUESTIONS` limits the total number of accepted questions being processed or waiting in the queue; its default is `5`.
- Keep `.env` out of version control and never commit real secrets.

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

The bot trims each incoming message and treats its first whitespace-separated token as a command when it begins with `!`. Command names are matched without regard to case; the remaining text is passed to the command as its arguments. Messages that are not commands, contain only the `!` prefix, use an unknown command name, or were authored by the bot itself are ignored without a reply.

## Safety and Usage Notes

- Local safety checks and Gemini safety settings are used, but they are not a substitute for human moderation.
- For public channels, keep cooldowns strict and consider role-based access controls.
- Gemini quota is external and may be limited or interrupted depending on provider limits.
- Do not treat the free tier as unlimited access.

## Testing

Run the project tests with:

```bash
npm test
```

The current automated suite covers AI-state persistence across store instances, default state, invalid state files, and write failures; configuration validation (including the pending-question limit and whitespace-only numeric values); command parsing and dispatch; queue behavior; Gemini request handling; and chat-message splitting. Command tests cover argument extraction, non-command and nameless-prefix rejection, routing `!help`, `!about`, public `!status`, and viewer-accessible channel-wide `!language`, ignoring malformed, unknown, and self-authored commands, and the message-to-Gemini-to-chat response flow using fakes. Gemini tests verify dynamic response-language selection and fixed-language overrides. Failure-path tests cover unavailable Gemini requests, Twitch reply failures, and continued queue processing. Other tests validate cooldown behavior, whitespace normalization, word-boundary splitting, invalid chunk limits, queue rejection when full, and sanitized logging without leaking request content or credentials.

Gemini requests emit structured logs with the outcome, duration in milliseconds, and HTTP status when available. These logs intentionally exclude question/answer contents and API credentials.

Moderators and the broadcaster can use `!ai on` / `!ai off` to control new questions and `!queue` / `!queue clear` to inspect or remove waiting questions. Clearing the queue does not interrupt an answer already in progress. The bot automatically reconnects to Twitch and handles `SIGINT` / `SIGTERM` by disconnecting cleanly.

## Formatting and Git Hooks

Run Prettier across the project with:

```bash
npm run format
```

`npm install` enables the Husky pre-commit hook. Before each commit, lint-staged formats supported staged files. GitHub Actions runs `npm run format:check` on pushes and pull requests.

## Git Workflow

This project uses a lightweight Git workflow to keep changes organized and easy to review.

### Recommended branch structure

- `main`: stable branch for tested code
- `feature/...`: new features or larger enhancements
- `fix/...`: bug fixes and small corrections
- `hotfix/...`: urgent runtime fixes

### Typical flow

```bash
# start from main
git checkout main
git pull --ff-only

# create a new branch
git checkout -b feature/my-feature

# work and commit
git add .
git commit -m "feat: add my feature"

# push the branch
git push -u origin feature/my-feature
```

### Before merging

- run the test suite
- review the diff
- make sure no secrets are committed
- open a pull request if collaborating with others

### Useful maintenance commands

```bash
git status
git branch
git pull --ff-only
git checkout main
```

## License

This project is intended for personal and experimental use. If you plan to distribute or commercialize it, update the license accordingly.
