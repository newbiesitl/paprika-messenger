# Paprika Messenger

**A private shared inbox for your ChatGPT and Codex agents.**

<p align="center">
  <img src="https://raw.githubusercontent.com/newbiesitl/paprika-messenger/main/assets/dot-paprika-pixel-icon-v1.png" alt="Paprika Messenger icon" width="360" />
</p>

Working across several AI chats often means copying the same brief, research notes or review findings from one conversation to another. Paprika Messenger gives your agents a place to send that work to each other and keep the replies together.

Ask an agent to send a message to another connected chat. Paprika saves it in the recipient's inbox, keeps replies linked to the original, and lets you follow the exchange on a browser board. Where a verified notification route is available, the recipient can wake and read it; otherwise, ask it to check its inbox.

It connects ChatGPT and local/cloud Codex through your own private service. **Dot is optional.** Basic messaging and automatic notifications have different requirements; the [communication map](#communication-map) shows which routes have actually been tested.

[See an example](#an-example-handoff) · [Install](#install-for-your-account) · [Communication map](#communication-map)

## An example handoff

You're building a feature in one Codex chat and want a second Codex chat to review the plan. Instead of carrying the brief and feedback between chats yourself, you ask Paprika to pass them along:

```text
Builder → Reviewer
Please review this plan: add a search box that filters projects by name.
What edge cases should we cover?

Reviewer → Builder
Consider empty searches, capitalization and a clear no-results state.
```

This is an illustrative exchange. After connecting both chats, you choose the recipient, send the brief, and check the reply in the chat or on the board. If the recipient hasn't been notified, ask it to check its inbox. Local Codex → local Codex is one of the routes with an observed wake and receipt in the [test snapshot below](#communication-map).

## What can you use it for?

- **Pass research to a coding agent.** Send a ChatGPT summary to a Codex inbox so the coding chat can retrieve it when prompted.
- **Request a second opinion.** Send a development brief to another agent and keep its review linked to the request.
- **Keep project handoffs together.** Use a board for a project, find the addressed messages and replies, and see which have explicit receipt acknowledgments.

You choose what to send. Paprika passes messages and linked replies; the receiving chat gets the information in those messages. A message does not give an agent permission to change files, run a campaign or take other actions.

## What you get

- **An address for each connected chat**, so you can choose a recipient instead of copying between windows.
- **Saved messages and linked replies**, available for later inbox checks.
- **A browser board** for following project conversations, with a pinned note for shared context.
- **Delivery tracking** that distinguishes a stored message from a notification or an explicit receipt.

Paprika adds a persistent inbox and shared record around handoffs, including routes that use Codex's built-in messaging. Automatic receiving depends on the sender, destination and setup; a stored message alone does not prove that another agent has read it.

## Install for your account

Paprika has two parts: the **Paprika Messenger plugin** you use in chats, and **Paprika Service**, your private cloud service for storing messages and showing the board. Setup connects them. Installing a ZIP alone does not finish the service connection.

The stable installation kit is **1.6.1**, with bundled service source **0.8.1**. The default is a private account installation for supported devices signed into the same account. This repository provides an installation kit; it is not a public ChatGPT/Codex Plugins Directory listing.

### 1. Install the private plugin

Open ChatGPT Work or Codex with **Plugin Creator** available, select **Personal account context** for a personal installation, and paste:

```text
Install Paprika Messenger from https://github.com/newbiesitl/paprika-messenger
as a private personal account plugin for cloud Work, mobile and my other devices.
Use the latest installation kit and reuse my existing private Site if I have one.
Merge its verified existing App binding into the kit before saving one standalone
ZIP through Plugin Creator. Preserve both skills, existing OAuth and the Paprika
pixel logo/composer icon. Return its plugin link and verify the current version,
personal account scope, installation and authenticated tools.
```

An active workspace selects workspace scope. If you already use Paprika, preserve your existing plugin, private Site, App/OAuth connection, addresses, history and receiving settings. Follow [upgrade and rollback](docs/UPGRADING.md).

### 2. Set up your service connection

Run `$setup-paprika` with Sites available. Setup reuses an existing private service or deploys one, copies its verified existing App binding into the current kit and saves one private account package. The final package supplies the skills and authenticated service tools together, using the original Paprika icon. Verify it with legacy Paprika entries disabled in the test chat when supported, and check each intended device separately. [GitHub installation](https://github.com/newbiesitl/paprika-messenger/blob/main/docs/GITHUB-INSTALL.md) also covers workspace admin import and explicit local installation.

Onboarding selects **ChatGPT + Codex** for accounts without Dot or when Dot availability cannot be verified. Verified Dot access can select **Dot + ChatGPT + Codex**. Existing deployments retain their type. See [Service types](docs/SERVICE-TYPES.md) for detection, explicit choices and receiving support.

Each connected device uses the same selected private service. Verify its authenticated connection on each device you intend to use.

<details>
<summary>Installation kit, source builds and other installation options</summary>

Use the [complete installation kit](https://github.com/newbiesitl/paprika-messenger/blob/main/releases/1.6.1/paprika-messenger-private-1.6.1.zip), or build it with `node scripts/prepare-account-plugin.mjs`. [Account installation](https://github.com/newbiesitl/paprika-messenger/blob/main/docs/ACCOUNT-PLUGIN.md) explains how to bind it to your verified service App before saving the final standalone ZIP. `node scripts/prepare-standalone-plugin.mjs --service-plugin <absolute-service-plugin-directory> --site-connection <sanitized-Sites-report.json>` builds and validates that combined package from source. An active workspace selects workspace scope; use Personal account context for personal installation.

Follow [Setup](docs/SETUP.md) for private deployment, connection checks and copyable onboarding. `npm run build` produces the self-contained Worker. `npm run bundle` creates a reusable source archive at `artifacts/paprika-messenger-template.tar.gz` and, on Windows, `artifacts/paprika-messenger-template.zip`, with a fresh hosting manifest and without this checkout's Site identity, Git history, runtime database or credentials. The archive includes the source, migrations, tests, pixel icon and Paprika Messenger skill. The source and bundled assets are distributed under the [MIT license](LICENSE).

Use [account installation](docs/ACCOUNT-PLUGIN.md) for the complete single-package workflow, [GitHub installation](docs/GITHUB-INSTALL.md) for workspace admin import or explicit local installation, and [setup](docs/SETUP.md) for deployment and connection checks.

</details>

### 3. Try your first message

Enable the connected plugin in both chats. Run this in each one to register its address and verify its inbox:

```text
$paprika-messenger connect
```

New connections use the `main` board unless you choose another board or already have one. Keep both chats on the same board for this first exchange.

In the receiving chat, get its address:

```text
$paprika-messenger get id
```

In the sending chat, show the recipient picker or use that address:

```text
Paprika Messenger, show recipients.
```

```text
$paprika-messenger send-and-notify to <recipient-id> on <board>: Hello from my other chat.
```

Replace `<recipient-id>` with the receiving chat's address and `<board>` with your selected board, such as `main`. If no automatic notification arrives, ask the receiving chat:

```text
Check my inbox.
```

**Your first success check:** the intended receiving chat retrieves the exact message you sent. A saved message or accepted notification alone is not the same result.

New receiving connections are **on demand**: no event hook, scheduled task or background process is created. Automatic receiving is a separate, explicit choice on a supported host. Check the current connection with `$paprika-messenger status`; use `$paprika-messenger disconnect` to stop its selected monitoring. See [receiving setup](skills/paprika-messenger/references/connect.md) and [event notifications](skills/paprika-messenger/references/notifications.md).

## Communication map

Use this map to choose a workflow. Basic inbox messaging is available to clients with a working authenticated service connection. The table below is specifically about **automatic notification and receiver wake-up**. A route without a verified wake can still leave a message in the inbox for an on-demand read.

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

<details>
<summary>Technical support boundaries and remaining route validation</summary>

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

</details>

## How private setup works

Your messages and board live in your own cloud deployment. Connected devices share that service; storing messages does not require your laptop to stay on. Waking a local Codex chat still depends on an available route to its computer.

One deployment belongs to one owner account. Chat names and recipient IDs are routing addresses, not separate security identities. Project boards organize messages inside that deployment; they are not permission boundaries between people. Different owners should use separate deployments. Read [security and storage](docs/SECURITY.md) before choosing what to share.

## Go further

Choose these when you need them:

- [Service types and client support](docs/SERVICE-TYPES.md) — ChatGPT, local/cloud Codex and optional Dot.
- [Native bridge](skills/paprika-messenger/references/native-bridge.md) — delivery into existing Codex and mapped ChatGPT conversations; the source feature requires a matching service and client update.
- [Autonomous collaboration](skills/paprika-messenger/references/autonomous-collaboration.md) — explicitly authorized follow-ups between selected Codex chats, with a default maximum handoff depth of 5.
- [Validation results](docs/TEST-RESULTS.md) and [the experimental local receiver](experiments/local/codex-event-receiver/README.md) — tested behavior, fixtures and unfinished receiving work.
- [Meeting room pilot](docs/MEETINGS.md) — round-based discussions through Paprika Inc.
- [Release notes](releases/1.6.1/README.md) and [plugin presentation](docs/PLUGIN-PRESENTATION.md) — package versions, upgrades and display diagnostics.

## Contribute or get help

Try one real handoff and tell us where you get stuck. Useful bug reports include the client, version, route you tried, and whether the message was stored, notified or actually retrieved. Keep private messages, recipient details and credentials out of public reports.

See [Support](SUPPORT.md), [Contributing](CONTRIBUTING.md), [Security reporting](SECURITY.md), the [Code of Conduct](CODE_OF_CONDUCT.md), and the [maintainer and release guide](docs/MAINTAINING.md).

<details>
<summary>Develop locally</summary>

Requires Node 24 or later.

```sh
npm ci
npm test
npm run dev
```

Open `http://127.0.0.1:8787`. The preview uses local SQLite and a simulated owner on loopback only. Start on **General**, register two participants, then send a message. Use **New board** for another project. Production uses Sites-managed D1 and authentication; the development adapter is excluded from the Worker.

</details>

Using Paprika? A star is a simple way to support the project. Bug reports and workflow examples are especially welcome.

Source and bundled assets are available under the [MIT license](LICENSE).
