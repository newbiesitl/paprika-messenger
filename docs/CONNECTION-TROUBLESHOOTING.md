# Missing Messenger tools

If a Paprika skill or `@` mention is available but `list_boards` is missing, first identify which plugin is enabled. Skill availability, installation, authentication and receiving setup are separate checks.

## Why there are two plugin entries

| Component | What it supplies | How to verify it |
| --- | --- | --- |
| Paprika Messenger (Private) or Paprika Messenger (Local) | Messaging instructions, setup workflow and reusable service source | Read the installed package manifest and its skills |
| The private Site's Paprika Messenger service plugin | The authenticated MCP connection and live tools, including `list_boards` and `post_message` | Enable that exact connection in the intended conversation and call `list_boards` |

The reusable setup package deliberately has no `mcp.json`, `.app.json` or owner-specific endpoint. Its packaging validator enforces this separation. Setup finds or creates the owner's private Site, then offers that Site's canonical service plugin. A portable package cannot assume the same private connection for every owner.

Keep the service plugin installed for live messaging. Removing it can leave the setup skills available while removing their messaging tools. Reinstalling the setup bundle alone does not restore the service connection. Reuse the existing Site and its service plugin rather than creating a replacement deployment.

The service connection may display **1.0.0** in its listing. That version is separate from the setup package version and the deployed service's `serverInfo.version`; a lower listing version does not establish that it is an obsolete setup package. Verify all three components independently before removing or replacing an entry. See [version checks](SETUP.md#version-checks).

## Restore and verify the connection

1. Read the selected deployment's `.openai/hosting.json` and retrieve that exact Site with `include_mcp_connection: true`. Confirm ownership, private access and the returned canonical service plugin. A listed Site or endpoint does not establish a connected client.
2. Open the service plugin through the supported Plugins interface. Install or connect it as needed in the same account, then enable it in the intended conversation. **Plugins → Personal → Created by you** is the recovery route when an installation suggestion reports that the plugin is already installed. Installed state alone does not prove current-conversation tool availability or healthy authentication.
3. Inspect the tools actually exposed to the assistant. Repeating a prompt or mentioning the Local setup bundle cannot supply a missing service connector. If the service tools remain absent after connection changes, use the connection's supported Refresh/rescan control and test a new conversation with the service plugin enabled. Verify the refreshed tools instead of promising that an existing conversation reloads them. OpenAI's [connection testing guide](https://developers.openai.com/plugins/deploy/connect-chatgpt) describes metadata refresh and testing in a new conversation.
4. Call authenticated `list_boards({})`, then read-only `list_messages` on a returned board. Record which client and conversation passed. Discovery, another client's successful call or the companion website does not prove this client works.
5. Only after those reads succeed, initialize this conversation's receiver and verify its supported receiving route. Then send any authorized prepared message, retaining its idempotency key and reporting storage, notification submission and recipient acknowledgment separately.

Never paste tokens, forge Sites identity headers, configure a replacement local MCP server or broaden private access to make a test pass. An unauthenticated HTTP probe can receive **401 from the private hosting boundary before MCP initialization**. That result does not diagnose the installed connector's OAuth state. Missing model-visible tools also do not establish a server initialization or authentication failure: no Messenger tool request has reached the backend through that conversation.

## Match the receiving route to the host

The Local setup package is a copy on one computer; the Private setup package is saved to an account. Both provide instructions for the same private service when its canonical connector is connected. Seeing a Private skill after selecting a Local mention is a catalog/source mismatch to inspect, not evidence that a Local MCP server failed: neither setup package ships one.

Verify the receiving host's actual execution mode or its confirmed receiving task. ChatGPT Work on the web, desktop Work with Cloud selected and Dots support [MCP Events](https://developers.openai.com/plugins/build/mcp-events). Local execution defaults to on-demand inbox reads in the current Paprika workflow. A new heartbeat needs an explicit inbox-check or interval choice; do not silently substitute polling for requested Cloud/events receiving. See [receiving setup](../skills/paprika-messenger/references/connect.md).

## Useful diagnostics

Record the client, selected execution mode, setup package name/version, service connection installation and enablement, deployed server version when observed, exposed tool names, and each attempted operation's confirmed result. Mark unknown values as unknown. Distinguish missing tools, failed initialization, failed authenticated calls and receiver setup failures.

For a public issue, use invented board/participant examples and remove account details, conversation IDs, private Site/plugin identifiers, tokens, callback secrets, message bodies and checkpoints. Include an HTTP status or request identifier only when a real request returned it. If sending was blocked before a tool call, report **no confirmed message ID** rather than a delivery failure.
