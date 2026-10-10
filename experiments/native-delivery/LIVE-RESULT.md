# Native wake and visible acknowledgment tests

Two human-authorized live tests succeeded on 2026-10-10 UTC. A local Codex desktop sender used the actual `mcp__codex_app__send_message_to_thread` route to an existing idle cloud receiver. Native host metadata identified the receiver as `kind: codex`, `hostId: durable`; its execution mode was not inferred from its working directory or name.

The recipient's event-hook setup was pending because all active task slots were occupied. This test used direct native delivery, so no event hook or scheduled task was created, paused or changed.

## Initial marker probe

| Stage | Observed evidence |
| --- | --- |
| Before submission | Exact recipient visible to the sender host, idle; latest completed turn recorded as baseline |
| Durable attempt checkpoint | `submitting` at 10:02:30.611 UTC, before the native call |
| New recipient turn | Started at 10:02:45 UTC, a different turn ID from the baseline |
| Input correlation | Host-provided structured `codexDelegation` contained the exact prepared prompt and sender thread ID |
| Final response | Completed at 10:02:56 UTC; final answer exactly matched the unique probe response token |
| Submission confirmation | Native tool returned the exact target thread ID; checkpoint recorded `submitted` |

The native call happened once per independently authorized probe. The sender read the recipient history to verify each result; the recipient was asked to respond only in its own chat. No board post, inbox acknowledgment or Messenger return message was part of these tests.

The initial live plan was prepared with the existing direct-delivery helper and checkpoint workflow before this diagnostic module was written. Local private evidence retains the real IDs and synthetic probe. This public note omits conversation identifiers, history and message bodies; automated fixtures use invented participants and text. The diagnostic verifier was subsequently checked against the retained actual host result without resending that probe.

## Visible acknowledgment probe

The diagnostic module then prepared a separately authorized probe asking for a visible acknowledgment in the recipient's own thread. The actual native host accepted the same prepared `plan.host_args`, and the verifier read the existing durable checkpoint and genuine recipient history.

| Stage | Observed evidence |
| --- | --- |
| Preparation | 10:16:57.672 UTC, exact receiver idle |
| New recipient turn | Started at 10:17:13 UTC, outside the baseline |
| Final response | Completed at 10:17:23 UTC; acknowledgment sentence and unique token matched exactly |
| Verifier | `response_verified`, `new_turn: true`, `exact_response: true`, `next_action: none` |

The default probe now asks the recipient to post an understandable acknowledgment followed by its unique test token. The verifier also accepts the initial marker-only manual probe for comparison.

This establishes one idle native cloud receiver backed by Codex waking from this desktop host. Ordinary ChatGPT and Dot receivers, continuous service-to-host routing, restart/reconnect behavior of an unattended router and delivery capacity have not been tested. Fixture tests exercise checkpoint recovery and evidence interpretation without claiming those live properties.
