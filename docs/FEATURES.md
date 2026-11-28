# Phase 5 features

## Short conversation context

`!question` keeps only successfully delivered, validated exchanges in memory. Context is isolated by channel and authenticated viewer ID (or a valid IRC username when no numeric ID is present). Unidentified viewers do not share a fallback conversation.

Limits per bot instance: 1,000 sessions, three exchanges per session, 4,000 Unicode characters per session, and a five-minute TTL per exchange. Sessions expire after five minutes without a successful exchange. At capacity, new viewers still receive answers without retaining context. Expired entries are discarded on access; all context is cleared on shutdown and lost on restart.

`!clearcontext` takes no arguments and clears only the caller's current-channel context. An in-flight or already queued session cannot restore deleted history after this command. A request already sent to the provider cannot be recalled. Conversation content is never written to disk or logged and is passed as untrusted user/model history, separate from system instructions.

The shared question queue, access policy, abuse limits, input/output filters, deadlines, and response limits still apply.

## Response modes and startup personality

`!mode` reports the current mode. Only moderators or the broadcaster with consistent Twitch identity tags can use `!mode concise`, `!mode detailed`, or `!mode educational`. Changes are in memory and reset to `AI_RESPONSE_MODE` on restart (default: `concise`). All modes share the same queue, access policy, cooldowns, and safety checks. Mode budgets are 210, 840, and 630 Unicode characters respectively, always capped by `MAX_ANSWER_LENGTH`; an oversized result receives at most one concise retry.

`BOT_PERSONA` selects `assistant` (default), `tutor`, `commentator`, or `technical` at startup. An optional `BOT_PERSONA_FILE` overrides that selector using a JSON object containing exactly `{"profile":"tutor"}` (or another supported profile). Files are limited to 4 KiB, validated before connecting, and may not contain free-form instructions or additional fields. There is no chat command to change personality. Profiles add trusted style instructions while preserving the provider's safety instructions; chat and history remain untrusted input.
