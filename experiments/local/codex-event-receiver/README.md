# Local Codex receiving pilot

This is an isolated prototype, not part of the published plugin. The unchanged baseline is private plugin **1.3.4**, bundled service **0.5.4**, source commit `da7acf7911cacbd45d56b87630149f99ce5f5b83`.

## What was actually tested

The installed Codex 0.160.0 runtime, using its existing sign-in, created a fresh ephemeral session with a read-only sandbox. An in-memory database used the production BoardService and EventService to store a fixture message, verify a signed callback, and dispatch a signed `message.created` event to a loopback receiver. The receiver started one turn in the idle session. Codex fetched the message through an authenticated, receiver-restricted MCP read tool and produced a report containing the exact message ID, body and random marker.

Successful run, 2026-10-07 UTC:

| Stage | Observed time |
| --- | --- |
| Fixture message stored | 14:28:00.433 |
| Signed event accepted locally | 14:28:00.441 |
| Runtime turn started | 14:28:00.597 |
| Authenticated message fetch | 14:28:16.551 |
| Final report verified in app-server output | 14:28:22.236 |

Message: `65c89384-0cf1-49ee-9055-8504e9954b69`.

The repeated signed event returned duplicate success and caused no second turn. Three automated tests cover invalid signatures, stale timestamps, wrong subscriptions and receivers, concurrent duplicates, the one-turn budget, restricted reads and disable behavior. No acknowledgment, reply, scheduler or production subscription was created.

The first attempt also completed the runtime wake, fetch and report. Its final replay check accidentally reused an expired HTTP timeout. That harness error is preserved in `evidence/pilot-attempt-1.json`; the corrected complete run is in `evidence/pilot-result.json`. That core experiment used two bounded model turns, one in each independent ephemeral session.

A subsequent receiving initialization experiment also passed. Its draft skill read current-host facts, correctly identified the companion-owned session as `codex_local`, verified exact inbox/session/subscription routing, and reported `pilot_ready` rather than production readiness. Reconnect reused the same subscription. This experiment used one additional model turn; its evidence is in `evidence/initialization-pilot-result.json`. The [verification plan](TEST-PLAN.md) separates the real local result from simulated mode contracts and pending live host tests.

## What this does not establish

- The event producer and database were fixtures. The transport mapped one logical callback URL to loopback inside the test harness. It did not contact that logical URL, use a real ChatGPT callback, or change the production callback allowlist.
- The session belonged to the pilot app-server. The report appeared in its output, not as an automatic update to an existing Codex desktop conversation.
- Live Sites-to-local delivery, persistent replay/recovery, desktop session integration, startup after login and multi-device routing remain unimplemented.
- The loopback receiver has an in-memory queue and one-turn budget. HTTP acceptance means this running prototype queued an event; it is not a durable production delivery guarantee.
- No conclusion about network or iPhone display latency follows from this local experiment.

## Rollback completed

All pilot app-server processes exited normally. Their loopback listeners stopped. The in-memory databases closed and ephemeral sessions were not retained as ongoing receivers. The published archive still has SHA-256 `81aa613efb63750448d0deb9b109cc6f49bda510576788230ceec1b17a475776`. The current desktop chat's inbox heartbeat remains paused, and its receiver remains disabled. The working ChatGPT receiver remains active and notification-ready.

During development, only an ignored local pilot folder was added. This repository exports its code and sanitized fixture evidence under `experiments/local/codex-event-receiver`. No plugin publication, production deployment, installation, auth change, receiver migration or permanent Codex config edit occurred.

## Reproduce the bounded experiment

From the repository root, with Node.js 24 or newer:

```powershell
node --test 'experiments/local/codex-event-receiver/receiver.test.mjs' 'experiments/local/codex-event-receiver/session-context.test.mjs'
node 'experiments/local/codex-event-receiver/pilot.mjs' '<installed codex.exe path>' '<existing Codex home path>'
```

The second command now runs the expanded initialization experiment, making at most one model-turn request per run using the existing runtime sign-in. It writes a new ignored result to `initialization-pilot-result.json` next to the script and stops its own processes. It requires the runtime's normal filesystem and network access. It does not copy credentials or modify permanent configuration.

## Architecture decision

One companion per signed-in user on each computer can manage multiple dedicated receiving sessions. A local event transport and app-server ownership are separate requirements. Starting an app-server does not confer control of conversations owned by a different runtime.

For production, first choose a supported authenticated route from the private Sites service to the computer, preferably an outbound connection so no home-network port needs exposure. Do not widen the existing trusted HTTPS callback allowlist to arbitrary destinations. Verify owner identity, exact board/receiver binding, cancellation, durable progress, reconnect/replay, duplicate handling and bounded wake budgets before claiming ready.

Waking normal desktop chats still needs a supported bridge into their owning runtime. The current desktop chat previously rejected `thread/resume` from a fresh server because it had an active writer. The pilot deliberately did not bypass that lock or use private desktop IPC.

ChatGPT Work cloud and Dot should keep their existing verified MCP-event routes. A user-controlled persistent cloud VM could run a companion and its own app-server sessions. Starting another app-server inside a managed Codex Cloud task does not demonstrate a supported wake route into that original task or a persistent service lifecycle.

## Proposed connection initialization

1. Inspect the actual current host capability, current conversation ID, existing binding and authenticated inbox. Do not infer capability from a name, path or ID format.
2. Reuse a verified receiving route when present. Preserve its controls, cadence and receipts.
3. On a supported ChatGPT Work cloud or Dot host, establish the exact `message.created` host task and verified callback subscription, then require notification-ready before declaring incoming delivery enabled.
4. On local Codex, check whether a supported companion owns the intended session. Keep ordinary desktop connections pending while that link is absent. Never redirect this chat's receiver to an unrelated app-server session.
5. Offer a clear opt-in experimental choice: **Set up a dedicated Messenger receiver on this computer**. Explain that it creates a separate receiving session, that the computer must be awake, and where incoming messages will appear. This can be a step within Paprika Messenger initialization rather than a separate installation hunt.
6. Perform local companion setup only after that choice. Verify its signed-in runtime, authenticated live event transport, exact session and inbox binding, idle wake, fetch and user-visible report. Installation alone is not readiness.
7. Confirm the actual destination and route in the response. Until the live route and display work, say **Receiver setup is pending**, with the missing step. Do not send an established-connection handshake or silently create polling.
8. Show how to disable receiving. Stopping a pilot or companion must not disable unrelated ChatGPT/Dot subscriptions.

Suggested successful production response, only after all live checks pass:

> Incoming messages are enabled for **[verified receiving session]** on **[board]**. A local Messenger companion waits for new messages and wakes that session when one arrives. It fetches and shows each message once. No periodic inbox task was created. Your computer must be awake and the companion running. Select **Disable incoming messages** to stop this receiver. Automatic replies and acknowledgments are off.

For an ordinary desktop chat today:

> Your Messenger address is registered. Incoming setup is pending because this chat has no supported local wake bridge. The experimental companion can receive in a separate session; it cannot yet wake this desktop chat.

References: [Codex app-server](https://learn.chatgpt.com/docs/app-server), [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp), [MCP events](https://developers.openai.com/plugins/build/mcp-events), [Codex Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments).
