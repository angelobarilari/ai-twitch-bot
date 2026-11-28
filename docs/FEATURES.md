# Phase 5 features

## Short conversation context

`!question` keeps only successfully delivered, validated exchanges in memory. Context is isolated by channel and authenticated viewer ID (or a valid IRC username when no numeric ID is present). Unidentified viewers do not share a fallback conversation.

Limits per bot instance: 1,000 sessions, three exchanges per session, 4,000 Unicode characters per session, and a five-minute TTL per exchange. Sessions expire after five minutes without a successful exchange. At capacity, new viewers still receive answers without retaining context. Expired entries are discarded on access; all context is cleared on shutdown and lost on restart.

`!clearcontext` takes no arguments and clears only the caller's current-channel context. An in-flight or already queued session cannot restore deleted history after this command. A request already sent to the provider cannot be recalled. Conversation content is never written to disk or logged and is passed as untrusted user/model history, separate from system instructions.

The shared question queue, access policy, abuse limits, input/output filters, deadlines, and response limits still apply.

## Response modes and startup personality

`!mode` reports the current mode. Only moderators or the broadcaster with consistent Twitch identity tags can use `!mode concise`, `!mode detailed`, or `!mode educational`. Changes are in memory and reset to `AI_RESPONSE_MODE` on restart (default: `concise`). All modes share the same queue, access policy, cooldowns, and safety checks. Mode budgets are 210, 840, and 630 Unicode characters respectively, always capped by `MAX_ANSWER_LENGTH`; an oversized result receives at most one concise retry.

`BOT_PERSONA` selects `assistant` (default), `tutor`, `commentator`, or `technical` at startup. An optional `BOT_PERSONA_FILE` overrides that selector using a JSON object containing exactly `{"profile":"tutor"}` (or another supported profile). Files are limited to 4 KiB, validated before connecting, and may not contain free-form instructions or additional fields. There is no chat command to change personality. Profiles add trusted style instructions while preserving the provider's safety instructions; chat and history remain untrusted input.

## Educational commands

- `!explain <term>` explains a supplied term with a short example.
- `!quiz` requests one general-knowledge question with its answer.
- `!dailyfact` requests one timeless educational fact on demand; it is not a live news lookup or a scheduled broadcast.
- `!summarize [text]` summarizes supplied text, or only the caller's current-channel recent conversation when no text is supplied. Without history, it returns a short notice without calling the provider.

All four commands delegate to the same question handler, sharing its global and per-user cooldowns, abuse budget, role policy, capacity, cancellation, safety filters, and response-mode limits. Task instructions are fixed system-side selections; viewer text stays in the untrusted user role. Generated educational answers are not externally fact-checked. No command reads arbitrary channel chat or another viewer's context.

## Opt-in channel reference memory

Memory starts disabled. Only moderators and the broadcaster with consistent numeric Twitch identities may change it:

```text
!memory on
!memory add schedule 1440 Stream starts Monday
!memory edit schedule 60 Stream starts Tuesday
!memory remove schedule
!memory off
!memory list [page]
```

`on` explicitly opts the configured channel in. `off` disables memory and removes all facts. `list` is public, showing at most two nonexpired facts per page; register only public channel information. Keys use 1-24 lowercase letters, digits, underscores, or hyphens. Fact text is normalized, filtered for injection, links, credentials, and personal data, and limited to 200 Unicode characters. Each channel has at most 20 facts. Every fact requires a TTL of 1-43,200 minutes (at most 30 days).

The process entrypoint persists this explicit channel consent and facts atomically to `CHANNEL_MEMORY_FILE` (default `.data/channel-memory.json`, ignored by Git). The file is limited to 32 KiB and validated before connecting, including the configured channel identity. Expired facts are excluded on every read and removed on the next successful mutation; disabling memory immediately saves an empty snapshot. A failed write preserves live state. Stop the bot before changing files manually, preserve a backup, and fix invalid files rather than expecting silent recovery.

Facts preserve the original creator ID and last editor ID. Successful changes, including enable/disable and deletion, emit `memory.changed` with the numeric actor ID and fixed action name; logs exclude fact text, keys, usernames, and credentials. Errors emit only sanitized operational metadata. Protect administrative audit logs and the local memory file accordingly.

Reference facts are supplied as explicitly untrusted user data, never system instructions. Every successful memory change invalidates current conversation snapshots so deleted or edited facts cannot be restored by late answers. Exchanges generated with reference facts expire no later than the earliest referenced fact, even if the usual conversation TTL is longer. A request already sent to the provider uses the snapshot valid when it started and cannot be recalled. This memory never reads unrelated channel chat and cannot cross configured channels.
