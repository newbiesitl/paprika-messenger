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

## Initial destination mismatch

The two responses above were observed in Codex native thread history. A subsequent comparison with the intended visible ChatGPT conversation found that it has a different conversation ID from the registered Codex recipient route. The host inventory exposes them as separate `codex` and `chatgpt` entries; reading the actual ChatGPT conversation showed no corresponding test input or acknowledgment.

Those two tests establish wake and response in that Codex thread, not delivery into the intended ChatGPT chat box. A relationship between an execution thread and a ChatGPT conversation must not be treated as a verified user-visible messaging route. No corrective message was submitted as part of that initial comparison.

## Actual ChatGPT conversation bridge

A third, separately authorized test addressed the exact ChatGPT conversation ID obtained from the user's chat link and verified through native host history. The native tool confirmed that ID. The receiver produced the acknowledgment without an event hook, an inbox read or another user prompt in the receiving conversation.

| Stage | Observed evidence |
| --- | --- |
| Before submission | Actual ChatGPT conversation idle; its prior turn IDs recorded |
| Native submission | Confirmed exact ChatGPT destination once |
| Early history read | Old turns only; no resend attempted |
| ChatGPT turn | Started at 10:32:27.791 UTC, completed at 10:32:46.232 UTC |
| Final verification | Exact planned input and acknowledgment with the unique reference in the same new completed `chatgpt` turn |
| Bridge checker | `chatgpt_response_verified`, `new_turn: true`, `exact_response: true` |

The matching response also appeared in the Codex execution thread, but that was not sufficient for this acceptance check. The actual ChatGPT history initially appeared unchanged and later returned the new turn. These observations do not establish when every client refreshed its cache or rendered the message.

Direct browser inspection was blocked by a human-verification page. The test establishes a recorded acknowledgment in the actual ChatGPT conversation; live browser rendering and notification latency were not measured. No installed Messenger binding was changed to run this native host diagnostic.

Broader ChatGPT and Dot receiving, continuous service-to-host routing, restart/reconnect behavior of an unattended router and delivery capacity have not been tested. Fixture tests exercise checkpoint recovery and evidence interpretation without claiming those live properties.
