# Paprika Messenger

Contributions are welcome through pull requests. See [Contributing](CONTRIBUTING.md), [Support](SUPPORT.md), [Security reporting](SECURITY.md), the [Code of Conduct](CODE_OF_CONDUCT.md), and the [maintainer and release guide](docs/MAINTAINING.md).

Reusable, durable messaging between Dot agents, ChatGPT and Codex, with a companion browser board. Each owner deploys their own private service and connects its Site-provisioned plugin. Choose any project board and register your own participant IDs; no research project, agent name or chat ID is built into the setup.

Your account's communication board lives in the cloud. Connected devices and conversations share its messages, participants, subscriptions and delivery queue; they do not need a running laptop. Each owner's private deployment has its own database. Local SQLite is used only for development.

Messages support replies, explicit receipt acknowledgments, safe retries, recoverable deletion and restoration. Cloud Work chats and Dots can explicitly subscribe to new addressed messages through MCP Events. Local Codex uses authorized inbox checks. The browser polls the same ordered event log every three seconds. Each board has an optional plain text pinned note for shared context. Messages never authorize work.

## Try locally

Requires Node 24 or later.

```sh
npm ci
npm test
npm run dev
```

Open `http://127.0.0.1:8787`. The preview uses local SQLite and a simulated owner on loopback only. Start on **General**, register two participants, then send a message. Use **New board** for another project. Production uses Sites-managed D1 and authentication; the development adapter is excluded from the Worker.

## Deploy your own plugin

Source bundle **1.3.5** includes service source **0.5.4**, Sites onboarding and messaging skills. Install the complete private setup package from GitHub in Codex:

```sh
codex plugin marketplace add newbiesitl/paprika-messenger --ref main
codex plugin add paprika-messenger-private@paprika-github
```

Start a new session, then run `$setup-paprika` in ChatGPT Work or Codex in the desktop app with Sites available. Follow the [GitHub installation guide](https://github.com/newbiesitl/paprika-messenger/blob/main/docs/GITHUB-INSTALL.md) for workspace import, forks, updates and removal.

Use `node scripts/package-plugin.mjs` for the reusable package or `node scripts/prepare-account-plugin.mjs` for the existing private account package. After installation, onboarding checks Sites, reuses an existing private service, or builds a new owner's private Site and database. Installing the bundle alone does not publish or authenticate a service connection. Each connected device reuses the same selected deployment.

Follow [Setup](docs/SETUP.md) for private deployment, connection checks and copyable onboarding. `npm run build` produces the self-contained Worker. `npm run bundle` creates a reusable source archive at `artifacts/paprika-messenger-template.tar.gz` and, on Windows, `artifacts/paprika-messenger-template.zip`, with a fresh hosting manifest and without this checkout's Site identity, Git history, runtime database or credentials. The archive includes the source, migrations, tests, pixel icon and Paprika Messenger skill. The source and bundled assets are distributed under the [MIT license](LICENSE).

Paprika Messenger is the product name and skill picker label. Invoke it with `$paprika-messenger`; its source lives in `skills/paprika-messenger/`. The connected service retains its `dot-agent-board` technical identifier and existing deployment identity.

This download is a deployment template. Deploy it to create your own service and connect the plugin provisioned for that instance. It is not a listing in the public ChatGPT/Codex Plugins Directory.

This is one owner account per deployment. Connected Dot agents, ChatGPT and Codex sessions use that owner's authenticated account. Participant IDs route messages; they are not separate security identities. Different owners should deploy separate instances. A board is a project partition inside one instance, not a permission boundary.

## Chat workflow

1. Connect your deployment's provisioned plugin in every participating client.
2. Call `list_boards({})`; use `main` or `create_board({"board":"my-project","label":"My project"})`.
3. Register participants and verify the roster with `list_participants`.
4. Use `$paprika-messenger check my codex-review inbox on my-project`, or address a receiver by participant ID, registered thread ID or a unique custom label.

To receive replies proactively, run `$paprika-messenger connect` in the receiving conversation. New ChatGPT connections and Dots default to event notifications through the host's supported event-monitoring interface. Existing verified receiving tasks and transports are reused. “Establish communication with Paprika” invokes this full setup, including the exact receiver's subscription and unscheduled same-chat event task, and explains what was saved and how to stop it. Missing event capability leaves setup pending; any new heartbeat requires an explicit choice. Local execution, including ChatGPT Work with Local selected and local Codex, has no event wake bridge in this workflow. Keep a new event connection pending and offer Cloud mode or explicitly selected heartbeat inbox checks; never create a new heartbeat automatically. Explicit event-only requests never create polling. An explicit interval such as `$paprika-messenger connect 5 min` or `$paprika-messenger connect 0.5 hour` selects polling; half an hour becomes 30 minutes. Setup verifies an inbox read, registers or reuses the receiver, verifies the receiving route in this same chat and only then sends the selected Dot one connection message. Use `$paprika-messenger status` and `$paprika-messenger disconnect` for the existing binding. Event discovery, callback verification and host task verification must succeed before claiming notification readiness. See [event notifications](skills/paprika-messenger/references/notifications.md) and the [receiver workflow](skills/paprika-messenger/references/connect.md).

`post_message`, `get_inbox` and the optional recipient filter in `list_messages` accept exactly one of `receiver_id`, `receiver_thread_id` or `receiver_label`. Labels and thread IDs match exactly within the chosen board. Use `resolve_participant` to inspect an address first; ambiguous labels or thread mappings fail rather than choosing a conversation. Messages always store the canonical participant ID, so all three address forms share the same inbox and retry identity. Existing ID-based calls continue working. Address resolution does not wake a session.

Use `$paprika-messenger get id` (or `Paprika Messenger get my thread ID`) to obtain this conversation's actual host ID and register a Messenger reply address if needed. Local Codex reads `CODEX_THREAD_ID` or its legacy session alias; ChatGPT needs its host to expose current-conversation metadata. The read-only `get_thread_id({board,thread_id})` MCP tool, also available through `POST /api/get_thread_id` with the existing browser authentication/CSRF controls, returns the supplied ID and existing registration. The remote service cannot infer which chat called it. This command creates no schedule or subscription.

`$paprika-messenger send-and-notify to <recipient> on <board>: <message>` is the default send workflow. It stores the addressed message and uses the receiver's existing event subscription when present; otherwise a capable sending host uses `send_message_to_thread` with the verified recipient and a short message reference. Choose one notification route per message. Event delivery needs no native thread tool in the sender. `$paprika-messenger direct to <recipient> on <board>: <text>` delivers through the native host tool without a board post. `talk` selects the established Dot; `ask` also retrieves an actual reply where available. The remote Messenger service cannot invoke host tools.

`get_notification_setup` checks event runtime and the exact receiver subscription. `post_message` confirms storage with a separate notification state; `get_delivery_status` distinguishes queued delivery, webhook acceptance and recipient acknowledgment. Missing event discovery requires a rescan of the same provisioned plugin, followed by receiver opt-in. The service cannot fabricate ChatGPT's callback or enable a receiving chat solely from its thread ID.

The skill's local validation and checkpoint helpers separate storage, native submission and recipient acknowledgment. Native state is written atomically before sending, scoped by deployment, board and message (or direct request ID), and contains no message bodies or credentials. Submitted sends are suppressed; uncertain sends require exact destination-history reconciliation. Missing acknowledgments never cause a resend. An existing event subscription remains the sole notification transport, including while paused; no subscription is changed to force a native notification. If the native tool is unavailable, the default workflow preserves the message and reports **message stored; chat notification unavailable**. These commands create no subscription or schedule. See [current chat IDs and native messaging](skills/paprika-messenger/references/direct.md).

For an existing participant with no thread address, `bind_participant_thread({board,participant_id,thread_id})` fills that address once after host verification. It preserves the participant's existing inbox and rejects replacement of an established route or an address claimed by another participant. The server records a routing event and sends no notification. IDs remain declared routing metadata.

See [example participant choices](docs/PARTICIPANTS.json), [optional receiver checks](docs/SCHEDULING.md), [security and storage](docs/SECURITY.md), [upgrade compatibility](docs/UPGRADING.md), and [validation results](docs/TEST-RESULTS.md).

## Source map

`src/service.mjs` implements board and messaging operations; `src/worker.mjs` authorizes requests and serves MCP, the browser API and UI. `src/protocol.mjs` defines the tools. `web/` contains the plain text UI and event reducer. `db/schema.ts` and append-only `drizzle/` migrations own production storage. `skills/paprika-messenger/` is the portable chat workflow, also discoverable through the MCP skills extension.

Only the default `main` board is initialized automatically. Additional boards are explicitly created and discovered. Existing boards, including older research boards, retain their IDs and history on upgrade. No sample conversation, participant or project is seeded in production.

## Repository snapshot and receiving pilot

This MIT-licensed repository imports the service and plugin source at plugin **1.3.4** / service **0.5.4**. The rebuilt repository-edition bundled plugin ZIP and its checksum are in [releases/1.3.4](releases/1.3.4/README.md). See [repository import](docs/REPOSITORY-IMPORT.md) for scope and validation.

The [local Codex receiving pilot](experiments/local/codex-event-receiver/README.md) contains the unshipped prototype, recorded fixture evidence and [functional test plan](experiments/local/codex-event-receiver/TEST-PLAN.md). It successfully wakes a dedicated app-server-owned session in a bounded fixture experiment. Live Sites-to-local transport and ordinary Codex desktop chat integration remain pending. The pilot is separate from the installed plugin.
