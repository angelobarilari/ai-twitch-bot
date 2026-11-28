# Security and credential operations

## Trust boundaries

Twitch metadata is trusted only when it comes from the authenticated TLS IRC connection. Never build command contexts from viewer-provided JSON. Moderator actions require a valid username, numeric user ID, `mod: true`, and a matching moderator badge. Broadcaster actions require a broadcaster badge and a username matching the current channel. Missing or inconsistent metadata fails closed.

Gemini receives questions in user content and fixed rules in `systemInstruction`. Shorter-answer retries reuse the original question and a trusted request option; generated drafts are never promoted into instructions. The bot exposes no model tools or state-changing model callbacks. AI output cannot execute `!ai`, `!language`, or queue operations.

Before processing questions and before sending generated answers, the bot normalizes Unicode with NFKC, rejects malformed surrogate pairs and invisible controls, and checks for common instruction overrides, administrative command text, dangerous requests, links, credential patterns, email addresses, CPF-like numbers, and long payment-card-like numbers. Runtime Gemini and Twitch credentials are also blocked by exact value. Question and answer limits count Unicode code points rather than bytes or UTF-16 code units.

These filters are conservative heuristics, not a guarantee that all prompt injection or personal information can be recognized. They can reject legitimate questions, including quoted malicious instructions or domain-like text. Review focused tests when adjusting rules; broad keyword bans are avoided so educational questions about prevention remain possible. Keep human moderation in place.

## Abuse limits

`!question` retains global and per-user cooldowns and its bounded queue. A separate per-user fixed window counts all question attempts, including invalid requests. Unsafe questions and user cooldown violations add strikes. Penalties double from `ABUSE_PENALTY_MS`, capped at `ABUSE_BAN_MS`; reaching `ABUSE_MAX_STRIKES` applies the temporary ban. Requests during a penalty do not prolong it. Attempts and strikes expire after the window ends and any active penalty expires. These limits are in memory and reset on restart.

The router silently drops excess command attempts to avoid flooding chat with rejection replies. Ordinary commands allow 5 attempts per viewer per 10 seconds and 20 dispatched commands globally per 10 seconds. Authorized `!ai` and `!queue` commands have separate budgets of 10 per moderator and 20 globally per 10 seconds. A viewer cannot consume the administrative budget. Each limiter tracks at most 10,000 active identities and rejects additional identities until entries expire; active bans are not evicted by new users.

`QUESTION_ACCESS` can be `everyone` (default), `known`, `subscriber`, `moderator`, or `broadcaster`. `known` means Twitch supplied a valid username and numeric user ID, not a minimum account age or follower duration. Subscriber access requires the subscriber flag and badge; moderators and the broadcaster also qualify. Viewer language changes remain channel-wide and available to everyone, subject to ordinary command limits and input validation.

## Minimal Twitch authorization

This bot uses IRC through `tmi.js`. Provision a user access token for the dedicated bot account with only `chat:read` and `chat:edit`, as specified by [Twitch's IRC authentication documentation](https://dev.twitch.tv/docs/chat/irc/) and [scope reference](https://dev.twitch.tv/docs/authentication/scopes/). Additional moderation, account-management, or EventSub scopes are not needed by this implementation. The bot does not issue tokens or alter existing token grants; choose these scopes when authorizing the bot account.

## Rotate credentials

1. Stop the bot and identify whether the affected credential is Twitch OAuth, the Gemini key, or both.
2. Revoke a compromised Twitch token through Twitch's authorization management or [token revocation API](https://dev.twitch.tv/docs/authentication/revoke-tokens/). Authorize a replacement for the same dedicated bot account with the two IRC scopes above. Revoke compromised Gemini keys in the provider console and create a replacement.
3. Update only the local `.env` or your deployment's secret store. Keep the `oauth:` prefix for `TWITCH_OAUTH_TOKEN`. Never paste tokens into chat, issues, PRs, or command examples committed to Git.
4. Restart the bot so it loads the replacement values. Verify the connection and a harmless question without printing the environment or credentials.
5. Confirm that the old credentials are revoked. If exposure occurred in Git or logs, restrict access to those artifacts and coordinate history cleanup after revocation; deleting the latest copy does not remove earlier exposure.

`.env`, default state files, and `.data/` are ignored by Git. Add custom state paths to local ignore rules before using them. Never commit backups containing credentials.

## Logs and automated checks

The application logs Gemini outcome, duration, attempt count, and HTTP status without request or response contents. It drops raw provider and Twitch errors from runtime logs, suppresses the library's raw chat logger, and omits JSON-parser causes that could echo corrupt state contents. Administrative changes emit `admin.ai.changed` and `admin.queue.cleared`; viewer language changes emit `settings.language.changed`. These events contain no chat text, selected language, usernames, or credentials.

The Security workflow runs `npm audit --audit-level=high` and checksum-verified Gitleaks 8.30.1 against all fetched Git history. High and critical dependency advisories fail the audit; secret findings fail the scan. Scanner output uses `--redact`, and no scan report is uploaded. CI still runs formatting, tests, and build independently.

For local review, run the standard validation commands and `npm audit --audit-level=high`. With the same Gitleaks version installed, run:

```bash
gitleaks git --redact --no-banner --log-opts="--all" .
```

History scanning covers committed content. Inspect staged changes before every commit; local ignored files are deliberately outside that history scan.

## Phase 5 trust boundaries

All AI commands share the original queue, access policy, cooldowns, safety filters, and response limits. New task, mode, and persona instructions are fixed server-side selections. Conversation history and channel facts are untrusted data; neither is promoted to a system instruction. Context is private to one viewer and channel, bounded, volatile, and expiring.

Channel memory is disabled by default and requires explicit moderator/broadcaster opt-in. Only consistent server-supplied identities can change modes or register/edit/delete facts. Facts are public channel reference data with mandatory TTLs, finite capacity, content checks, and atomic local persistence. Numeric actor IDs are retained for administrative attribution; audit events exclude fact text, fact keys, usernames, credentials, questions, and answers. Mode changes and memory changes use the separate administrative command budget.

Editing, deleting, or disabling channel memory invalidates existing context snapshots. Reference-based turns cannot extend the lifetime of an expired fact. A prompt already sent to an external provider cannot be recalled. Personality files accept only a fixed profile selector, never arbitrary safety or system instructions. See [FEATURES.md](./FEATURES.md) for limits, commands, persistence behavior, and privacy details.
