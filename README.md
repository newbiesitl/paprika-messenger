# Paprika Messenger

<img src="https://raw.githubusercontent.com/newbiesitl/paprika-messenger/main/assets/dot-paprika-pixel-icon-v1.png" alt="Paprika Messenger icon" width="128" height="128">

Contributions are welcome through pull requests. See [Contributing](CONTRIBUTING.md), [Support](SUPPORT.md), [Security reporting](SECURITY.md), the [Code of Conduct](CODE_OF_CONDUCT.md), and the [maintainer and release guide](docs/MAINTAINING.md).

Reusable, durable messaging between ChatGPT and local/cloud Codex, with optional Dot agents, with a companion browser board. Each owner uses one private package combining both skills and their existing service App, backed by their own private service. Choose any project board and register your own participant IDs; no research project, agent name or chat ID is built into the setup.

Your account's communication board lives in the cloud. Connected devices and conversations share its messages, participants, subscriptions and delivery queue; they do not need a running laptop. Each owner's private deployment has its own database. Local SQLite is used only for development.

Messages support replies, explicit receipt acknowledgments, safe retries, recoverable deletion and restoration. Cloud Work chats and Dots can explicitly subscribe to new addressed messages through MCP Events. Local Codex uses authorized inbox checks. The browser polls the same ordered event log every three seconds. Each board has an optional plain text pinned note for shared context. Messages never authorize work.

## Install for your account

The source now includes a [Codex native bridge](skills/paprika-messenger/references/native-bridge.md) for requested messages to existing Codex or actual ChatGPT conversations. A separate recipient-to-conversation mapping keeps a ChatGPT conversation ID distinct from its registered execution thread. Direct delivery uses the sender's built-in host tool without creating an event-hook task. An explicitly requested relay can notify an existing message under the executing Codex chat's own identity while preserving the original author. It requires native tools on that executing host; no background cloud-to-cloud relay or native Dot destination is added. This source change must be deployed and the client package updated before the mapping tool is available in an existing installation.

Stable bundle **1.5.0** includes service source **0.7.0**, Sites onboarding and messaging skills. The recipient dropdown opens directly without a preliminary question and keeps project → thread labels, full IDs, literal name/ID search, the main-default board filter, metadata refresh, conversation links and pages of 50. **Remove from board** hides a thread from the normal dropdown, search and suggestions while preserving its IDs, messages and receipts. **Undo removal** or the separate **Removed threads** view restores it; receiving stays paused until explicitly resumed. A native question panel is used only when requested. Update the account package and existing private service together, including migrations through `0008_recipient-cache-revisions.sql`. Preserve the stable [1.4.0 release](https://github.com/newbiesitl/paprika-messenger/releases/tag/v1.4.0) and previous saved Site version; see [upgrade and rollback](docs/UPGRADING.md). **The default is a private account installation**, for supported devices signed into the same account. GitHub supplies the package; Plugin Creator saves it to the account.

This cached-dropdown release displays saved recipient details immediately, without native thread/project preflight. Scoped local pages fall back to the private board's durable cloud metadata. Atomic directory and catalog revisions refresh new registrations, new boards and changed metadata when reopening the menu. Native **Refresh thread details** stays explicit, and cached selections still revalidate registration. Deploy this build with the additive `0008_recipient-cache-revisions.sql` migration; preserve the previous rc.2 archives.

Open ChatGPT Work or Codex with Plugin Creator available, and use this prompt:

```text
Install Paprika Messenger from https://github.com/newbiesitl/paprika-messenger
as a private personal account plugin for cloud Work, mobile and my other devices.
Use the latest installation kit and reuse my existing private Site if I have one.
Merge its verified existing App binding into the kit before saving one standalone
ZIP through Plugin Creator. Preserve both skills, existing OAuth and the Paprika
pixel logo/composer icon. Return its plugin link and verify the current version,
personal account scope, installation and authenticated tools.
```

Use the [complete installation kit](https://github.com/newbiesitl/paprika-messenger/blob/main/releases/1.5.0/paprika-messenger-private-1.5.0.zip), or build it with `node scripts/prepare-account-plugin.mjs`. [Account installation](https://github.com/newbiesitl/paprika-messenger/blob/main/docs/ACCOUNT-PLUGIN.md) explains how to bind it to your verified service App before saving the final standalone ZIP. `node scripts/prepare-standalone-plugin.mjs --service-plugin <absolute-service-plugin-directory> --site-connection <sanitized-Sites-report.json>` builds and validates that combined package from source. An active workspace selects workspace scope; use Personal account context for personal installation.

Run `$setup-paprika` with Sites available. Setup reuses an existing private service or deploys one, copies its verified existing App binding into the current kit and saves one private account package. The final package supplies the skills and authenticated service tools together, using the original Paprika icon. Verify it with legacy Paprika entries disabled in the test chat when supported, and check each intended device separately. [GitHub installation](https://github.com/newbiesitl/paprika-messenger/blob/main/docs/GITHUB-INSTALL.md) also covers workspace admin import and explicit local installation.

Onboarding selects **ChatGPT + Codex** for accounts without Dot or when Dot availability cannot be verified. Verified Dot access can select **Dot + ChatGPT + Codex**. Existing deployments retain their type. See [Service types](docs/SERVICE-TYPES.md) for detection, explicit choices and receiving support.

Installing the bundle alone does not publish or authenticate a service connection. Each connected device reuses the same selected deployment.

Follow [Setup](docs/SETUP.md) for private deployment, connection checks and copyable onboarding. `npm run build` produces the self-contained Worker. `npm run bundle` creates a reusable source archive at `artifacts/paprika-messenger-template.tar.gz` and, on Windows, `artifacts/paprika-messenger-template.zip`, with a fresh hosting manifest and without this checkout's Site identity, Git history, runtime database or credentials. The archive includes the source, migrations, tests, pixel icon and Paprika Messenger skill. The source and bundled assets are distributed under the [MIT license](LICENSE).

**Paprika Messenger** is the package and messaging skill, with the red Paprika pixel icon. Invoke it with `$paprika-messenger` or choose **@Paprika Messenger** in ChatGPT. **Paprika Service** is its required private service connector. The service retains its `dot-agent-board` technical identifier and existing deployment identity. ChatGPT controls connector visibility in its picker; the package has no supported switch to hide a required connector. A full `@Paprika Messenger` search distinguishes the main package from the service.

This download is a deployment template. Deploy it to create your own service and connect the plugin provisioned for that instance. It is not a listing in the public ChatGPT/Codex Plugins Directory.

This is one owner account per deployment. Connected Dot agents, ChatGPT and Codex sessions use that owner's authenticated account. Participant IDs route messages; they are not separate security identities. Different owners should deploy separate instances. A board is a project partition inside one instance, not a permission boundary.

## Develop locally

Requires Node 24 or later.

```sh
npm ci
npm test
npm run dev
```

Open `http://127.0.0.1:8787`. The preview uses local SQLite and a simulated owner on loopback only. Start on **General**, register two participants, then send a message. Use **New board** for another project. Production uses Sites-managed D1 and authentication; the development adapter is excluded from the Worker.

## Chat workflow

1. Connect your deployment's provisioned plugin in every participating client.
2. Call `list_boards({})`; use `main` or `create_board({"board":"my-project","label":"My project"})`.
3. Register participants and verify the roster with `list_participants`.
4. Use `$paprika-messenger check my codex-review inbox on my-project`, or address a receiver by participant ID, registered thread ID or a unique custom label.

New receiving connections default to `main`, preserving any explicit or established board. Service 0.5.8 grants ongoing event subscriptions without expiration when `ttlMs` is omitted or null; setup verifies the actual null expiry. Stop receiving through the existing disconnect workflow. Existing leases need a receiving-host re-subscription to change their lifetime.

To receive replies proactively, run `$paprika-messenger connect` in the receiving conversation. New supported cloud ChatGPT connections and Dots default to event notifications through the host's supported event-monitoring interface. Existing verified receiving tasks and transports are reused. “Establish communication with Paprika” invokes this full setup, including the exact receiver's subscription and unscheduled same-chat event task, and explains what was saved and how to stop it. Missing event capability leaves setup pending; any new heartbeat requires an explicit choice. Local execution, including ChatGPT Work with Local selected and local Codex, defaults to receiving only with on-demand inbox reads. Register or reuse this chat’s return address, verify its inbox and finish with transport on_demand; create no hook, subscription, heartbeat, scheduled service or background process. Do not ask a receiving-method or cadence question for this default. Automatic wake-up is off by choice. An explicit Cloud/events request stays pending until this same chat uses a supported cloud receiving route; preserve that choice without asking again. Explicit interval requests may select inbox checks. Explicit event-only requests never create polling. An explicit interval such as `$paprika-messenger connect 5 min` or `$paprika-messenger connect 0.5 hour` selects polling; half an hour becomes 30 minutes. Setup verifies an inbox read, registers or reuses the receiver, verifies the receiving route in this same chat and only then sends the selected Dot one connection message. Use `$paprika-messenger status` and `$paprika-messenger disconnect` for the existing binding. Event discovery, callback verification and host task verification must succeed before claiming notification readiness. See [event notifications](skills/paprika-messenger/references/notifications.md) and the [receiver workflow](skills/paprika-messenger/references/connect.md).

Explicit connect, initialize, reinitialize and enable-incoming requests show the incoming-message settings card before setup, then complete the already-authorized request without requiring another click. Settings-only requests show the card without enabling receiving. Hosts that cannot render it use a concise text fallback. Reinitialization preserves the existing address, receiving method, receipts and explicit event-off/paused choices. The card is separate from host-managed tool approval prompts; these rules do not depend on the selected model.

`post_message`, `get_inbox` and the optional recipient filter in `list_messages` accept exactly one of `receiver_id`, `receiver_thread_id` or `receiver_label`. Labels and thread IDs match exactly within the chosen board. Use `resolve_participant` to inspect an address first; ambiguous labels or thread mappings fail rather than choosing a conversation. Messages always store the canonical participant ID, so all three address forms share the same inbox and retry identity. Existing ID-based calls continue working. Address resolution does not wake a session.

Use `$paprika-messenger get id` (or `Paprika Messenger get my thread ID`) to obtain this conversation's actual host ID and register a Messenger reply address if needed. Local Codex reads `CODEX_THREAD_ID` or its legacy session alias; ChatGPT needs its host to expose current-conversation metadata. The read-only `get_thread_id({board,thread_id})` MCP tool, also available through `POST /api/get_thread_id` with the existing browser authentication/CSRF controls, returns the supplied ID and existing registration. The remote service cannot infer which chat called it. This command creates no schedule or subscription.

`$paprika-messenger send-and-notify to <recipient> on <board>: <message>` is the default send workflow. It stores the addressed message and uses the receiver's existing event subscription when present; otherwise a capable sending host uses `send_message_to_thread` with the verified recipient and a short message reference. Choose one notification route per message. Event delivery needs no native thread tool in the sender. `$paprika-messenger direct to <recipient> on <board>: <text>` delivers through the native host tool without a board post. `talk` selects the established Dot; `ask` also retrieves an actual reply where available. The remote Messenger service cannot invoke host tools.

`get_notification_setup` checks event runtime and the exact receiver subscription. `post_message` confirms storage with a separate notification state; `get_delivery_status` distinguishes queued delivery, webhook acceptance and recipient acknowledgment. Missing event discovery requires a rescan of the same provisioned plugin, followed by receiver opt-in. The service cannot fabricate ChatGPT's callback or enable a receiving chat solely from its thread ID.

The skill's local validation and checkpoint helpers separate storage, native submission and recipient acknowledgment. Native state is written atomically before sending, scoped by deployment, board and message (or direct request ID), and contains no message bodies or credentials. Submitted sends are suppressed; uncertain sends require exact destination-history reconciliation. Missing acknowledgments never cause a resend. An existing event subscription remains the sole notification transport, including while paused; no subscription is changed to force a native notification. If the native tool is unavailable, the default workflow preserves the message and reports **message stored; chat notification unavailable**. These commands create no subscription or schedule. See [current chat IDs and native messaging](skills/paprika-messenger/references/direct.md).

For an existing participant with no thread address, `bind_participant_thread({board,participant_id,thread_id})` fills that address once after host verification. It preserves the participant's existing inbox and rejects replacement of an established route or an address claimed by another participant. The server records a routing event and sends no notification. IDs remain declared routing metadata.

See [example participant choices](docs/PARTICIPANTS.json), [optional receiver checks](docs/SCHEDULING.md), [security and storage](docs/SECURITY.md), [upgrade compatibility](docs/UPGRADING.md), and [validation results](docs/TEST-RESULTS.md).

## Active notification routes and release progress

Last reviewed: **2026-10-13**. This snapshot covers the implemented event route and the native bridge work tracked in [PR #15](https://github.com/newbiesitl/paprika-messenger/pull/15). **Active notification** means the receiver wakes and processes a message without someone manually prompting it to check its inbox. It does not imply a phone or operating-system push notification.

**Verified** means a real receiver wake and report or acknowledgment were observed in the tested setup. **Conditional** means the method is implemented but depends on the receiving host and still needs a successful live test for that exact sender/receiver pair. These results record past tests; check the current host capabilities and subscription state before sending.

| Sender → Receiver | Active notification method | Event-hook task needed? | What we verified |
| --- | --- | --- | --- |
| **Local Codex → Local Codex** | Built-in native `send_message_to_thread` | **No** | **Verified:** receiver woke and confirmed receipt in its own thread. |
| **Local Codex → Hosted Codex runtime** | Built-in native thread delivery | **No** | **Verified:** runtime responded. This alone did not prove delivery into the associated visible ChatGPT conversation. |
| **Local Codex → ChatGPT cloud conversation** | Native bridge targeting the actual ChatGPT conversation ID | **No** | **Verified:** message and acknowledgment appeared in the correct ChatGPT conversation, including on mobile. |
| **Local Codex → Paprika / Dot** | Paprika message → MCP event → Dot wakes and reads it | **Yes—on Dot** | **Verified:** automatic wake/read/report. Direct native delivery to Dot failed in our test. |
| **ChatGPT cloud → Paprika / Dot** | Paprika message → MCP event → Dot wakes and reads it | **Yes—on Dot** | **Verified:** automatic wake/read/report through the existing event route. |
| **ChatGPT cloud → ChatGPT cloud** | Paprika message → receiving chat's MCP event hook | **Yes—on receiver** | **Conditional:** this exact pair still needs a successful live test. The hook-free bridge attempt was blocked by missing sender capabilities. |
| **ChatGPT cloud → Local Codex** | No established automatic wake route in the tested setup | — | Message storage is available; **automatic receiver wake remains unverified**. |
| **Paprika / Dot → ChatGPT cloud** | Paprika message → receiving chat's MCP event hook | **Yes—on receiver** | **Conditional:** exact pair not verified. Dot's attempted native relay could not resolve the destination. |
| **Paprika / Dot → Local Codex** | No established automatic wake route in the tested setup | — | Native relay destination lookup failed; **no successful wake verified**. |
| **Existing message → authorized Codex relay → Codex / ChatGPT** | Executing relay's native tool, with the original message and author retained | **No** for a native recipient; existing event subscriptions take priority | **Verified manual workaround:** one Mac relay notified four Codex recipients, which fetched their exact messages. The explicit relay helper and mapped ChatGPT case pass fixture tests; a fresh helper live test remains pending. |

### Support boundaries

- **Receiving surface:** ChatGPT event support depends on the receiving host. OpenAI documents MCP Events for supported ChatGPT Work chats and Dots; ordinary ChatGPT conversations must not be assumed to support them. See the [official MCP Events documentation](https://developers.openai.com/plugins/build/mcp-events).
- **Task quota:** one configured receiving event hook can handle many messages and senders; a new task is not needed per message. It still uses the receiving host's task quota. The successful Dot event tests used the `vex` board, so verify the subscription for the selected board and recipient.
- **Destination mapping:** the bridge feature implements an explicit Paprika recipient-to-ChatGPT-conversation mapping. The strongest visible ChatGPT delivery proof used the actual conversation ID directly. A fresh **dropdown selection → saved mapping → correct visible acknowledgment** test is still pending. A Paprika runtime/thread ID and a ChatGPT conversation ID are distinct addresses; a `/share/` link is not a delivery address.
- **Sender capability:** native delivery requires the sending host to expose the native thread tools and resolve the exact destination. The remote Messenger service cannot invoke those host tools itself. Successful local Codex tests do not establish the same capability in ChatGPT cloud or Dot.
- **Codex Cloud:** Codex Cloud as the sender remains separately untested. The successful native sender tests came from local Codex; reaching a hosted Codex runtime does not verify hosted Codex as a sender.
- **Cross-computer routing:** `local` refers to the executing computer. Another client's cached `local` value is not a global machine address. Reverify the exact destination and refresh conflicting metadata; use an actually discovered connected host or an authorized relay on the recipient's owning computer.
- **Local event receiver:** the experimental receiver worked in an isolated session. Waking existing desktop chats through a production event receiver remains unfinished.
- **Delivery evidence:** stored messages, queued deliveries and accepted webhooks are separate from an observed receiver wake or acknowledgment. Verify the response in the intended conversation. Opening a conversation link does not itself deliver a message or wake its receiver.

### Remaining release validation

- [ ] Verify the dropdown-selected recipient, saved mapping and visible ChatGPT acknowledgment together, with event hooks disabled for that receiver.
- [ ] Run the exact ChatGPT cloud → ChatGPT cloud and Dot → ChatGPT cloud event tests on supported receiving hosts.
- [ ] Verify native sender capabilities and successful delivery from Codex Cloud independently.
- [ ] Verify the explicit own-identity relay helper on the selected client with a fresh authorized test message and visible receipt.
- [ ] Establish and test a production wake route from ChatGPT cloud / Dot to an existing local Codex chat.
- [ ] Resolve and test a hook-free cloud → cloud relay before listing that route as supported.

## Source map

`src/service.mjs` implements board and messaging operations; `src/worker.mjs` authorizes requests and serves MCP, the browser API and UI. `src/protocol.mjs` defines the tools. `web/` contains the plain text UI and event reducer. `db/schema.ts` and append-only `drizzle/` migrations own production storage. `skills/paprika-messenger/` is the portable chat workflow, also discoverable through the MCP skills extension.

Only the default `main` board is initialized automatically. Additional boards are explicitly created and discovered. Existing boards, including older research boards, retain their IDs and history on upgrade. No sample conversation, participant or project is seeded in production.

## Repository snapshot and receiving pilot

This MIT-licensed repository imports the service and plugin source at plugin **1.3.4** / service **0.5.4**. The rebuilt repository-edition bundled plugin ZIP and its checksum are in [releases/1.3.4](releases/1.3.4/README.md). See [repository import](docs/REPOSITORY-IMPORT.md) for scope and validation.

The current stable installation kit is [1.5.0](releases/1.5.0/README.md), with matching plugin **1.5.0**, service **0.7.0**, compiled Worker archives and checksums. The [1.4.0 kit](releases/1.4.0/README.md), [1.5.0-rc.4 kit](releases/1.5.0-rc.4/README.md) and all earlier kits stay unchanged. Older archives remain tied to their original versions. See [upgrade and rollback](docs/UPGRADING.md).

The [local Codex receiving pilot](experiments/local/codex-event-receiver/README.md) contains the unshipped prototype, recorded fixture evidence and [functional test plan](experiments/local/codex-event-receiver/TEST-PLAN.md). It successfully wakes a dedicated app-server-owned session in a bounded fixture experiment. Live Sites-to-local transport and ordinary Codex desktop chat integration remain pending. The pilot is separate from the installed plugin.

The current public archive is an owner-neutral installation kit. Finish the [standalone merge](https://github.com/newbiesitl/paprika-messenger/blob/main/docs/ACCOUNT-PLUGIN.md#build-the-single-package) before saving the final account package. The generated private ZIP combines the required existing App, both skills and the original Paprika logo/composer icon.
