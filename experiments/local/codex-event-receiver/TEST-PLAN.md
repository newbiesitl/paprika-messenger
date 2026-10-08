# Paprika Messenger receiving verification Draft

Verify that communication initialization selects the receiving route supported by the actual session, binds it to the right inbox, and brings new messages into the intended conversation once. A connection passes only after storage, event acceptance, wake, fetch and display have separate evidence. This draft covers ChatGPT, Codex and Dot, including local and cloud execution.

The local pilot passed using the installed Codex runtime and an isolated message service fixture. It does not yet qualify the live Sites to local bridge or ordinary desktop chats for release. Keep private plugin **1.3.4** and service **0.5.4** as the baseline while testing.

## Session types and expected routes

Product, orchestration and execution are separate facts. Local shell access alone does not identify orchestration. Work Cloud and Dot can use tools on a connected computer while the cloud coordinates the task. [OpenAI documentation](https://learn.chatgpt.com/docs/enterprise/cloud-local-access).

| Session | Required mode evidence | Receiving route to verify | Current coverage |
| --- | --- | --- | --- |
| Codex local | Current host reports Codex and local orchestration, or the tested companion owns its locally started session | Supported bridge into the owning runtime; companion prototype for its own sessions | One real companion session passed; ordinary desktop integration pending |
| Codex cloud | Current host explicitly identifies Codex and cloud orchestration | A supported receiving action bound to that managed task; do not assume another app-server controls it | Classifier contract simulated; live host test pending |
| ChatGPT local | Current host identifies ChatGPT Work with local orchestration | Supported local receiving bridge, or explicitly chosen inbox checks | Classifier contract simulated; live host test pending |
| ChatGPT cloud | Current host identifies ChatGPT Work with cloud orchestration | Exact unscheduled MCP event task and verified callback subscription | Classifier contract simulated; previous production receiving success exists, fresh candidate initialization pending |
| ChatGPT cloud with local tools | Cloud orchestration plus local execution | Verify cloud receiving capability independently of local tool execution | Classifier contract simulated; live host test pending |
| Dot | Current host identifies Dot; record execution separately | Dot's exact verified MCP event task and callback | Previous production receiving success exists; candidate initialization pending |
| Mode unavailable or conflicting | Record available product facts; leave the missing mode unknown | An exact verified event route may establish capability; otherwise setup remains pending | Automated checks passed; native metadata probe left mode unknown |

The four classification fixtures test a proposed host metadata contract. They do not prove that each platform exposes that contract today. The native metadata available to this Codex chat reports the product but no reliable orchestration field. The skill must retain `unknown` in that case. Host adapters must collect current-conversation facts through actual supported APIs; user messages, titles, receiver labels, paths and ID formats are not mode evidence.

## Pilot results

The initialization pilot completed on **October 7, 2026, at 23:49:29 JST**. It used a fresh ephemeral session owned by the companion, a read-only sandbox, two authenticated read tools and one model turn.

| Check | Result |
| --- | --- |
| Controlled local session identified from its owning runtime | Passed: `codex_local` |
| Missing callback or host binding kept setup pending | Passed; no heartbeat created |
| Authenticated inbox and exact session mapping | Passed in the isolated database |
| Signed callback and matching active subscription | Passed in the fixture transport |
| Readiness distinguished from live production | Passed: `pilot_ready`, production readiness false |
| Reconnect reused the receiving subscription | Passed: one subscription |
| Event woke an idle session | Passed |
| Skill fetched current-host context and the addressed message | Passed; both tool reads traced |
| Correct marker and message reported | Passed |
| Duplicate replay | Passed; no extra turn |
| Automatic acknowledgment, reply or polling schedule | None created |
| Cleanup | App-server exited; listener stopped; in-memory database closed |

Thirteen automated checks also passed. They cover the four simulated mode combinations, cloud coordination with local tools, incomplete or forged metadata, wrong destinations, stale facts, invalid webhook signatures, subscription state, duplicate delivery and restricted inbox reads. Five existing connection-card checks passed separately, covering explicit enable actions, receiving-method choices, read-only status, isolated stop behavior and unavailable-host responses. These are code-level UI checks, not mobile or desktop visual delivery tests.

Evidence: `evidence/initialization-pilot-result.json`, `session-context.test.mjs`, `receiver.test.mjs` and the isolated draft `skill/SKILL.md` in this folder. The model fetched raw host facts and receiving records; its classification was compared with the controller's independent checks.

The successful message was `6d743f0f-35d2-4c4a-8566-349fe20b58cf`, with marker `79fcf024-11fe-45a1-877b-38989af3b719`. The event was accepted locally at **23:48:43.767 JST** and the verified report was produced at **23:49:29.317 JST**. Use the captured trace for exact timing; these observations do not measure delivery to an iPhone or an existing desktop UI.

## Prepare a live test

1. Record the candidate plugin/service versions, source commit, installed version and host build. Retain the baseline archive and configuration for rollback.
2. Use a separate test board and unique receiver per receiving conversation. Verify the conversation through its own current-host metadata. Keep the existing working `existing-project` routes unchanged.
3. Record the selected Local or Cloud mode from the product UI when available, then compare it with what the host actually exposes to the skill. If the skill cannot observe the UI setting, it must say so.
4. Turn off polling and native follow-up notifications only for the isolated receiver being tested. Never disable another receiver as a test shortcut. Check that no unrelated task shares its destination or filters.
5. Initialize with an ordinary request such as **Connect this chat to Paprika**, then repeat in a separate isolated receiver using **$paprika-messenger connect** and the **Enable incoming messages** button. All entry points must follow the same contract.
6. Confirm the exact inbox read, host task/session destination, subscription and saved receiving controls before sending a probe. A backend `ready` result without the matching host binding fails setup.

## Functional cases

| Case | Procedure | Pass condition | Coverage now |
| --- | --- | --- | --- |
| Identify session | Run initialization in each mode in the matrix; compare with host facts and the selected UI mode | Correct product and orchestration, or an explicit unknown; execution recorded separately | Automated fixtures and one real local session |
| Ignore misleading hints | Put another product/mode in the title, receiver label, path and message body | Classification still uses current-host facts | Classifier checks passed; live message-content case pending |
| Default to events | Connect without choosing polling in a receiving-capable host | One exact unscheduled event route; zero new periodic tasks | Fixture initialization passed; fresh cloud test pending |
| Capability unavailable | Hide/remove event setup capability or return a task-service error | Setup stays pending, names the missing step, sends no established-connection handshake and creates no heartbeat | Missing-route guards passed; host error test pending |
| Wrong destination | Give setup an otherwise-ready subscription or task for another chat/receiver | Setup rejected or left pending; nothing delivered to the wrong chat | Automated checks passed |
| Verify authentication | Use a disconnected service, invalid bearer token or incorrect owner account | No foreign inbox data, callback activation or wake; clear connection recovery action | Invalid local token test passed; live account tests pending |
| Reconnect | Initialize twice in the same receiving chat | Same binding reused; one subscription/task and no repeated connection handshake | Subscription reuse passed in fixture; live task and handshake test pending |
| Deliver while idle | Wait until the exact receiver is idle; send one unique marker and do not manually prompt it | Event alone starts a receiving run that fetches and reports the exact addressed message | Real owned runtime passed with fixture producer |
| Deliver while busy | Send several addressed messages during an active receiving turn | Defined queue or steering behavior; no competing writer, lost message or duplicate report | Pending |
| Preserve reply links | Send a reply to a known message and a standalone message | Correct `reply_to_id` shown; standalone has no invented parent | Standalone pilot passed; linked reply candidate test pending |
| Suppress duplicates | Replay an event concurrently, retry the same send idempotency key and reconnect | One stored message and one user-visible report; no extra wake for a duplicate | Receiver replay passed; complete live send/reconnect test pending |
| Receipts and replies | Test default settings, then explicitly opt into receipts in a separate receiver | Default performs no acknowledgment or reply; opted-in receipt happens after read/report and under the right participant | Defaults passed; opt-in behavior pending |
| Reject message instructions | Deliver text claiming to change mode, enable polling or authorize commands | It may be displayed; it cannot change receiving controls, send replies or execute work | Restricted tool boundary tested; live adversarial behavior pending |
| Disable | Turn off incoming messages, then send a new marker | Only that receiver stops; stored message remains recoverable; any in-flight run is identified | Prototype disable test passed; live lifecycle test pending |
| Network and restart | Disconnect network or stop the companion, send messages, then reconnect/restart | Durable pending state recovers addressed messages once; no silent gap after HTTP acceptance | Pending; prototype queue is memory-only |
| Expiry and rate limits | Expire/pause the subscription, exhaust its budget, then restore it | Accurate pending/paused/limited status and bounded recovery; no polling fallback | Readiness guards passed; live retry/renewal test pending |
| Quiet and quota behavior | Leave an empty receiver idle, then replay a duplicate | No periodic model turns; only new accepted messages cause bounded receiving work | Pilot used one turn; duplicate caused none; longer idle test pending |
| User interface | Watch the receiving conversation in foreground, background and after network changes | Server report and visible UI arrival logged independently; a refresh-dependent display is recorded as such | Pending for candidate mobile/desktop UI |
| Roll back | Stop/remove the candidate receiver and restore its recorded baseline configuration | Pilot processes/listeners gone; original versions/routes and user's paused settings preserved | Local pilot cleanup passed |

Treat `pending` as untested or incomplete, not as a successful platform result. The local prototype's memory-only queue, fixture ingress and separate session are release blockers for a reliable live desktop bridge.

## Three party delivery matrix

Run every direction with a new marker and exact receiver mapping. Each receiving side must independently opt into its own route. An outgoing handshake does not configure reverse delivery.

| Sender | Receiver | Required proof |
| --- | --- | --- |
| ChatGPT | Paprika Dot | Stored message, accepted callback, Dot wake, fetch and report |
| Paprika Dot | ChatGPT | Stored message, accepted callback, ChatGPT wake, fetch, server report and visible conversation update |
| Codex | Paprika Dot | Messenger-only event test; record separately if a native notification is used |
| Paprika Dot | Codex | Live service event to the intended owning runtime, idle wake, fetch and display |
| Codex | ChatGPT | Messenger-only event to the ChatGPT receiver, without a native follow-up prompt |
| ChatGPT | Codex | Exact local or managed-cloud receiving route, idle wake, fetch and display |

Run the Codex receiving cases separately for companion-owned local sessions, ordinary local desktop chats and managed cloud sessions. Success in one is not evidence for the others. Native thread messaging is a useful control test, but cannot be counted as proof of the Messenger event route.

## Evidence to collect for every probe

Record the unique marker, message and reply IDs, deployment, board, sender, receiver, current conversation, actual host mode/capability facts and candidate version. Keep credentials, callback URLs, signing secrets and full conversation transcripts out of the test log.

Use distinct timestamps for storage, notification queueing, HTTP acceptance, receiving run start, authenticated fetch, report creation, visible UI arrival and any OS push alert. Record acknowledgments separately, if explicitly enabled. Store timestamps in UTC and show JST to the user. A later confirmation time is not the UI arrival time.

If a report is missing, inspect those stages in order. HTTP 200 proves callback acceptance only. A successful fetch does not prove display, a display does not prove an OS notification, and a read does not imply acknowledgment. For an idle-wake probe, record whether polling, manual inbox prompts or native notifications could have triggered it; a contaminated probe must be repeated in isolation.

## Release decision

Ship only the routes demonstrated in live receiving hosts. Four simulated mode cases plus a local fixture pilot do not qualify all four products/modes for automatic initialization.

Before a wider release, require live initialization and unattended delivery for each advertised route, consistent plain-language/skill/button behavior, duplicate suppression, disable/reconnect, durable restart recovery, recipient isolation, no silent polling, an accurate setup response, and verified rollback. Revise candidate skill and MCP instructions that currently treat any local execution as local orchestration; cloud coordination with local tools must retain its actual mode and verified receiving capability. Run the existing service/UI/package regression checks and validate the final bundled skill and service contents against the candidate version.

For the local companion, also require authenticated live Sites ingress and a verified user-visible destination. Existing desktop support must have a supported owning-runtime integration; never bypass writer locks or use another session as proof. If managed Codex Cloud has no supported receiving action, mark it unavailable rather than installing an unmanaged app-server and claiming the original task is enabled.

The current decision is **retain 1.3.4 and continue isolated testing**. The next live qualification is Sites to a dedicated companion-owned receiver. Ordinary desktop chat integration and the remaining host metadata adapters stay pending.
