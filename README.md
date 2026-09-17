# AI Twitch Bot

A small, modular Twitch chat bot that answers questions in chat using the Gemini API. The project keeps Twitch client setup, command handling, config validation, and AI integration separated so it can grow without becoming a monolithic entry point.

## Overview

This project connects to Twitch chat, listens for commands such as `!ping` and `!question`, and forwards user questions to Gemini for response generation. It is designed for local experimentation, private channel use, and iterative feature development.

## Features

- Twitch chat connection using `tmi.js`
- Modular command architecture
- Gemini API integration for chat responses
- Built-in cooldowns and safety checks
- Runtime validation for environment variables and numeric settings
- TypeScript codebase with automated validation tests

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
│   │   ├── ping.ts
│   │   ├── question.ts
│   │   └── types.ts
│   ├── services/
│   │   ├── gemini.ts
│   │   └── gemini.test.ts
│   ├── utils/
│   │   └── chat.ts
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
COMMAND_COOLDOWN_SECONDS=15
USER_COOLDOWN_SECONDS=30
MAX_QUESTION_LENGTH=300
MAX_ANSWER_LENGTH=420
```

Notes:
- `TWITCH_CHANNEL` can be passed as `#channel` or `channel`.
- Numeric values must be positive finite numbers.
- Keep `.env` out of version control and never commit real secrets.

## Commands

### `!ping`

Checks that the bot is online and responding.

### `!question <your question>`

Sends the question to Gemini and replies in chat.

Example:

```text
!question what is the capital of Brazil?
```

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

The current test suite covers the main configuration checks, command parsing, and Gemini request behavior.

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
