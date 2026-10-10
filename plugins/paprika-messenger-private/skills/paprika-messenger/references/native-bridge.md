# Codex native bridge and ChatGPT destination mapping

Use this route when the human requests native/bridge delivery from Codex to an existing ChatGPT or Codex conversation. The executing host must expose `mcp__codex_app__send_message_to_thread` and `read_thread`. These are host tools, not tools the remote Messenger service can call. A cloud sender without them cannot use this route. Dot and cloud-to-cloud relaying are not implemented by this mapping.

## Address the selected conversation

1. Resolve the selected recipient's canonical board and participant ID. A dropdown selection identifies that recipient; re-read `get_recipient` immediately before preparation. Never reuse another selection's route or choose by title alone.
2. `recipient.thread_id` remains the registered execution/runtime address. `recipient.chatgpt_destination.conversation_id`, when present, is the distinct actual ChatGPT conversation. Use the latter for ChatGPT delivery and navigation. Never rewrite the registered thread to make these IDs agree.
3. If that association is missing, first use the selected recipient's existing verified `conversation_url` when available. Otherwise obtain the actual ChatGPT ID from native host metadata that explicitly associates it with this recipient, or the user's original `https://chatgpt.com/.../c/<ID>` link. Verify the exact target with native `read_thread`/`list_threads`, requiring `kind: chatgpt`. A name match, shared-link ID, `CODEX_THREAD_ID`, or an execution-thread response cannot establish that association. Request the original link only if no supported metadata supplies it; no browser is needed to save or verify a known ID. An explicit delivery mapping takes priority over cached navigation metadata; ordinary title/URL refresh cannot silently redirect a bridge send.
4. Call `set_recipient_conversation` with board, participant ID, unchanged `registered_thread_id`, the original link/ID, `host_observation: {id, kind: 'chatgpt'}` from the actual host result, and `expected_revision: 0`. To explicitly correct an existing association, re-read and supply its current revision. Conflict means stop and inspect, never overwrite a different mapping silently. The server checks consistency of declared observations; it does not independently authenticate host metadata. Mapping sends nothing and changes no subscriptions.
5. Re-read the exact mapped conversation with the native host. For a Codex recipient, read its registered thread and preserve its verified `hostId`. Codex-to-Codex needs no ChatGPT mapping. A confirmed ChatGPT conversation registered directly with its actual ID also works without a separate mapping. Wait for idle rather than interrupting a running chat.

## Prepare and submit once

Run `node <skill>/scripts/prepare-bridge.mjs` with JSON on stdin:

```json
{
  "deployment": "https://messenger.example.test",
  "board": "main",
  "receiver_id": "selected-recipient",
  "target_kind": "chatgpt",
  "sender": {"board":"main","id":"sender","thread_id":"current-codex-thread"},
  "recipient_record": {"board":"main","recipient":"ACTUAL get_recipient recipient object"},
  "history": "ACTUAL parsed schema-v1 read_thread result",
  "mode": "direct",
  "request_id": "one-stable-request-id",
  "body": "The exact human-requested message"
}
```

The example strings for `recipient_record.recipient` and `history` must be replaced by real objects. The helper checks the current sender against `CODEX_THREAD_ID`, the selected board/recipient, mapping, native kind, idle state and Codex host. It returns a plan with the resolved `host_args` and conversation link. It never sends a message itself. For an in-thread acknowledgment, include that explicit request in `body`; don't silently ask the receiver to send a second outbound message.

Use `notification-state.mjs begin` on that plan with actual tool availability. Only `action: send` permits calling `mcp__codex_app__send_message_to_thread` once with exactly `plan.host_args`. No model/thinking override is added. ChatGPT receives `{threadId: conversation_id, prompt}`; Codex receives its native thread ID and verified host ID. Record explicit confirmation as submitted, explicit non-submission as failed, and an ambiguous/interrupted call as unknown, using the current attempt ID. Keep the same plan/key. Mapping corrections do not permit resending an existing uncertain request.

Direct mode carries the full message in the native prompt, creates no board message and consumes no event-hook task. It does not disable an existing receiver hook. For stored-message notification, use `mode: board`, the server-confirmed `message` and actual `subscriptions`; the existing one-transport rule still applies. An active event subscription (even paused) selects events alone, so do not call the native tool on that plan. Re-check subscription state before native submission. Never turn an uncertain board delivery into a direct send.

Report submission separately from receipt. Verify an acknowledgment in the actual selected conversation, not its runtime. Native history may return a ChatGPT content reference instead of the response text; that alone is inconclusive, so inspect supported conversation content/UI if needed. Do not resend because the text is delayed or absent. The experimental verifiers under `experiments/native-delivery` provide stricter synthetic acknowledgment checks. This workflow establishes no background monitoring and does not bypass ordinary model or host usage limits.
