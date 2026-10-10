# Native delivery wake probe

An inbox write alone does not demonstrate that an idle chat starts a turn. This experiment prepares one synthetic direct message, reuses Messenger's durable native-delivery checkpoint, and checks actual recipient history for the exact input and final response in a new turn. It does not consume an event-hook or scheduled-task slot.

The executing host must expose `mcp__codex_app__send_message_to_thread` and `mcp__codex_app__read_thread`. A remote Messenger service cannot invoke those desktop tools by itself. This is a test harness for a user-authorized, selected recipient, not an autonomous background router. The [live results](LIVE-RESULT.md) verify one idle cloud receiver backed by Codex.

## Run the fixture tests

From the repository root, with Node.js 24 or newer:

```sh
node --test experiments/native-delivery/probe.test.mjs
```

CI runs these tests on Windows and macOS. Fixtures use invented routes and no model calls. They cover real-history correlation, misleading copied markers, old turns, wrong destinations, submission uncertainty, duplicate turns and response mismatch. Passing fixtures does not establish a live host's delivery capability.

## Prepare one live probe

Get the human's authorization to send a short test to the exact selected recipient. Resolve sender and recipient through Messenger on the same board. Use the current host's `CODEX_THREAD_ID`, the verified service origin for `deployment`, and the exact native recipient route from host discovery. Never infer the thread or host from a title or directory.

Read the recipient immediately before preparing. The helper currently accepts only parsed schema-v1 `read_thread` results with `thread.kind === 'codex'`, an idle status, and matching thread/host IDs. Busy recipients must wait for a fresh idle read; the probe must not interrupt them. Other native history shapes require a separately verified adapter.

```js
import { prepareNativeProbe, evaluateNativeProbe } from './experiments/native-delivery/probe.mjs';
import { NotificationState } from './skills/paprika-messenger/scripts/notification-state.mjs';

// route comes from actual Messenger resolution and native host discovery.
// history is the parsed actual read_thread result, not a summary or tool wrapper.
const probe = prepareNativeProbe({ ...route, history });
const state = new NotificationState();
const attempt = await state.begin(probe.plan, { available: nativeSendAvailable });
```

`route` has the same shape as the existing [direct-delivery helper](../../skills/paprika-messenger/scripts/prepare-delivery.mjs):

```js
{
  deployment: 'https://messenger.example.test',
  board: 'main',
  sender: { board: 'main', id: 'sender', thread_id: 'current-chat' },
  recipient: { board: 'main', id: 'receiver', thread_id: 'recipient-chat' },
  destination: { source: 'read_thread', thread_id: 'recipient-chat', host_id: 'verified-host' }
}
```

These are placeholders. `nativeSendAvailable` must reflect actual tool availability on the executing host. The returned probe includes a UUID v4 request ID, a synthetic prompt in `plan.host_args`, the expected response token, and only the baseline turn IDs. Retain that same probe in memory for verification and recovery; regenerating it creates a different request.

## Submit through the native host

Only `attempt.action === 'send'` permits a native call. Invoke the actual `mcp__codex_app__send_message_to_thread` once with **exactly `probe.plan.host_args`**. Keep the recipient's model and reasoning settings. The synthetic message asks for one visible acknowledgment inside the recipient chat, beginning with `Received your Paprika Messenger native-delivery test message.` and followed by the unique response token. It does not request a Messenger reply or send back to the caller.

Classify the actual tool result and use `state.record(probe.plan, ...)` with the current `attempt_id`:

| Result | Checkpoint outcome |
| --- | --- |
| Explicit submission confirmation for the exact thread | `state: 'submitted'`, `confirmation: { thread_id: probe.plan.recipient_thread_id }` |
| Explicit rejection proving no submission | `state: 'failed'` |
| Timeout, interrupted call or ambiguous result | `state: 'unknown'` |

Do not treat every thrown error as rejection. `skip`, `reconcile`, `failed` and `unavailable` are not permission to send. In particular, an existing `submitting` or `unknown` checkpoint suppresses another send even after a process restart. Checkpoints under the ignored `.paprika/direct` directory store routing and submission metadata, not prompts or recipient history.

This diagnostic uses direct delivery. It neither posts to the board nor creates or modifies receiving tasks/subscriptions, so an existing event subscription cannot duplicate this probe. A future stored-message router must still use [the existing transport selection rule](../../skills/paprika-messenger/scripts/prepare-delivery.mjs) and preserve active event receivers.

## Verify wake and response

Read the exact destination again using the native host. If still running, wait briefly or use `wait_threads`, then read a fresh result. Do not poll indefinitely or resend because a receipt is missing.

```js
const report = await evaluateNativeProbe({ probe, history: after }, { state });
// Persist only this metadata report, if needed, under ignored .paprika/native-probes/.
```

The verifier requires a turn ID outside the idle baseline, a native start time at or after preparation (to native timestamp precision), and the exact full probe input. It supports exact plain user text or the host's structured `codexDelegation` input with the correct sender ID. It does not parse quoted XML as delegation. The last `agentMessage` with `phase: 'final_answer'` in that same completed turn must equal the expected token, apart from surrounding whitespace.

| Report status | Evidence |
| --- | --- |
| `not_started`, `unavailable`, `rejected` | No confirmed native submission |
| `submission_uncertain` | Submission needs history reconciliation; never automatically retry |
| `awaiting_turn` | Submission confirmed, matching new turn not yet visible |
| `turn_observed`, `turn_failed` | Exact input in a new turn; final response incomplete or turn failed |
| `response_mismatch` | Matching completed turn without the exact final token |
| `response_verified` | Exact input and final token in the same new completed turn |
| `duplicate_turns`, `inconsistent_evidence` | Investigate conflicting evidence |

Verification is read-only. An exact response can prove delivery even if the call result was uncertain; its report still says `next_action: 'reconcile'`. Use the existing `NotificationState.reconcile` with this exact thread, `plan.reference`, `outcome: 'found'` and the observed `turn_id` as `evidence_id`. Missing history on one page is inconclusive and never permits a resend. Review older pages if needed.

The CLI exposes the same helpers as `node experiments/native-delivery/probe.mjs prepare|verify`, taking JSON on stdin. `prepare` accepts the resolved route plus parsed `history` and optional stable `request_id`. `verify` accepts `{ probe, history, state_root? }` and reads the checkpoint from `.paprika` by default. The CLI never calls a host tool. Keep raw history in memory; do not save it or credentials to fixtures. Reports include recipient routing metadata and belong in ignored local evidence; redact those IDs before sharing publicly.

## Scope of this result

An observed native turn proves this host can wake that particular native receiver at that time. It does not establish continuous monitoring, an unattended remote bridge, arbitrary ChatGPT/Dot support or unlimited native-delivery capacity. A central router still needs a supported way to stay running and invoke the receiver's native route. Event-hook limits are avoided for this direct probe, while normal model and host usage limits still apply.

The helper validates the consistency of caller-supplied data, not its authenticity. Obtain evidence from the real host and Messenger service. See [Codex app-server](https://learn.chatgpt.com/docs/app-server) for separately owned sessions and [MCP events](https://developers.openai.com/plugins/build/mcp-events) for subscribed event delivery.
