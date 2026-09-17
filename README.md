# AI-Powered Twitch Question Bot

A simple bot that answers `!question ...` in Twitch chat using the Gemini API.

## Free Tier

Google AI Studio usually offers a free quota for the Gemini API, but it is limited, may change, and may require account verification. Do not treat it as unlimited access: the quota can run out or access can be suspended after abuse.

## Setup

1. Create an API key in [Google AI Studio](https://aistudio.google.com/apikey). Never publish this key.
2. Create a separate bot account and generate a Twitch OAuth token. The [Twitch Token Generator](https://twitchapps.com/tmi/) is convenient for testing.
3. Copy `.env.example` to `.env` and fill in the values.
4. Install dependencies and build:

```bash
npm install
npm run build
npm test
npm start
```

Use `npm run dev` during development.

## Project Structure

The entry point in `src/index.ts` only creates the Twitch client, registers the message dispatcher, and connects to the channel. Command behavior is kept under `src/commands/` so the bot can grow without turning the entry point into a monolith.

- `src/commands/index.ts`: command registry and message dispatcher.
- `src/commands/ping.ts`: the `!ping` status command.
- `src/commands/question.ts`: the `!question` command.
- `src/commands/types.ts`: shared command types and context.
- `src/services/gemini.ts`: Gemini API integration.
- `src/config.ts`: environment validation and runtime configuration.
- `src/utils/chat.ts`: shared chat safety and message formatting helpers.

To add a command, create a handler in `src/commands/`, then register it in the `commands` map in `src/commands/index.ts`. Keep Twitch message parsing in the dispatcher and command-specific behavior in the command module.

## Usage

In chat:

```text
!ping
!question what is the capital of Brazil?
```

The `!ping` command confirms that the bot is connected and responding. It does not measure end-to-end Twitch network latency.

The default configuration applies a 15-second global cooldown, a 30-second per-user cooldown, a 300-character question limit, and a 420-character answer limit. All numeric values in `.env` must be positive finite numbers. The bot accepts `TWITCH_CHANNEL` as `#channel` or `channel` and normalizes it to lowercase without the leading `#`.

The bot also uses Gemini safety settings, blocks some input categories, and does not publish answers matching the local filter. This filter is an additional layer; it does not replace human moderation, AutoMod, or community rules.

## Security

- `.env` is already in `.gitignore`; never send tokens to GitHub.
- Keep the Gemini API key out of logs and avoid placing it in request URLs.
- Use a separate Twitch account for the bot and grant only the required permissions.
- For a public channel, keep the global cooldown and consider allowing the command only for subscribers, VIPs, or moderators.
- Monitor API quota and errors before leaving the bot running for long periods.
