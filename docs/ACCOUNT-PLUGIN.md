# One private account package (default)

Paprika **1.3.8** combines the current messaging skill, setup skill, full service source **0.5.5**, original Paprika pixel icon and the required existing service App in one personalized package. The App supplies authenticated MCP tools and the existing OAuth connection. Supported cloud, mobile and desktop clients use that same private account package and service.

The [public ZIP](../releases/1.3.8/paprika-messenger-private-1.3.8.zip) and [checksum](../releases/1.3.8/SHA256SUMS) are an owner-neutral installation kit. Each owner binds it to their own private Site before saving the final standalone package. Publishing one owner's App ID or endpoint in a shared archive would connect other installers to the wrong service.

## Build the single package

1. Select Personal account context for `USER` scope, or the explicitly intended workspace. Discover an existing matching private account package and preserve its backend ID, audience and scope. PRIVATE visibility alone does not prove personal scope.
2. Reuse the owner's existing active private Site and database. Only a first-time installation deploys a new instance from the bundled source. Read the selected Site through native Sites metadata with `include_mcp_connection: true`; verify ownership and audience.
3. For an upgrade, use the existing complete standalone package directory as `--service-plugin`; its saved provenance must agree with the current native Site read-back. The legacy service-only package need not remain installed. For first-time binding, read the canonical service plugin's actual `.app.json` and `.codex-plugin/plugin.json`, or a verified native export of those same App fields. Copy its exact existing App ID. A plugin ID is not an App ID. Do not derive IDs, create a replacement App, add a parallel OAuth registration or configure another local MCP server. If the host cannot expose the existing binding, keep that step pending rather than claiming an unbound kit is standalone.
4. Save a non-secret Sites JSON report outside Git with only `id`, `current_user_role`, `status` and `mcp_connection` containing `plugin_id`, `mcp_url` and `oauth_resource`. Keep tokens, source credentials and runtime secrets out of that file and the package.
5. From a complete source checkout, run:

```sh
node scripts/prepare-standalone-plugin.mjs --service-plugin <absolute-canonical-service-plugin-directory> --site-connection <sanitized-Sites-report.json>
```

The command builds the latest kit, verifies that Site and installed App agree, then creates one personalized ZIP. Use the exact `archive` path in its JSON report. From an extracted kit, the same merger ships at `skills/setup-paprika/scripts/merge-service-plugin.mjs`; use `--plugin <complete-kit-root>` with the two connection flags above. No repository checkout is required for that shipped helper.

The generated package declares `extensions.com.openai.apps: "./.app.json"` in the portable manifest and the same App pointer in the Codex compatibility manifest. Its `.app.json` requires exactly one existing service App. Both skills, service template, full starter prompt array, `logo` and `composerIcon` survive the merge. Both icon settings use the original `assets/paprika-icon.png` bytes. `paprika-connection.json` records non-secret binding provenance. Do not add `mcp.json` or `.mcp.json`: imported MCP configurations are desktop-only, even when the endpoint is remote. An existing App reference supports account use without duplicating its authentication registration. See [OpenAI plugin management](https://learn.chatgpt.com/docs/enterprise/plugin-management).

Generated owner-bound files and ZIPs stay in ignored `artifacts/` storage. They are for the selected owner's account, not a public release shared across unrelated accounts. The public repository contains the complete reusable code for building them.

## Save, install and verify

Save the final merged ZIP through Plugin Creator's hosted account-save workflow using its absolute local path. Reuse and update the matching eligible package with its observed current release; create only if none exists. Preserve unrelated metadata, private audience and existing scope. A GitHub clone or local marketplace registration is not an account save.

Open the returned account plugin link and install it. Complete any requested authentication for the existing App. Verify the native account metadata, current version, intended scope, stored App binding and both skills. Then enable the combined package alone in a client check when supported, with legacy Paprika entries disabled in that chat, and perform authenticated `list_boards` and a read-only `list_messages` call. Do not remove legacy entries automatically. Remove them only when explicitly requested after this check passes.

A saved ZIP, link, installed cache or successful Site deployment does not prove client readiness. Report save, installation, App authentication and each client's actual connection separately. Keep untested cloud/mobile clients and any unavailable solo-package check pending. App references preserve the underlying App's access checks; they do not grant permissions or eliminate OAuth consent.

## Local installation and receiving defaults

Account installation is the default. For an explicit local-only request, add `--kind local` to the same standalone builder. It uses the same **1.3.8** manifest, binding, skills and Paprika icon; install the resulting package through the supported local interface. Local registration stays device-only.

Local receiving defaults to receiving only with on-demand inbox reads and no hooks, schedules or background service. Supported cloud receiving chats default to verified event hooks when the user requests connection/receiving setup. If there is no selected peer, finish receiving-only without asking for a Dot. Each receiving chat establishes its own route; installation alone creates no subscriptions.

## Why an older entry shows 1.0.0

The inspected canonical Site-generated service plugin has **1.0.0** in its cached compatibility manifest. It contains the service App binding but lacks this repository's two-skill package. That listing version is separate from Paprika package **1.3.8** and service **0.5.5**. The merger copies its verified existing App reference, not its old manifest version, generic icon or listing metadata. It preserves the latest package and original Paprika icon. The old canonical backend identity can remain as the underlying App; changing or deleting it is unnecessary for combining the package.

## Copyable installation request

```text
Install Paprika Messenger from https://github.com/newbiesitl/paprika-messenger
as one PRIVATE personal account package for supported cloud, mobile and desktop.
Use the latest kit. Reuse my private Site or deploy it once if absent.
Merge its verified existing App binding into the kit before account saving.
Preserve the Paprika pixel logo/composer icon, both skills and existing OAuth.
Reuse the matching account plugin ID and verify USER scope, current version,
installation and authenticated tools with the combined package alone.
Keep unavailable verification pending. Do not create duplicate Apps or services.
```

After replacing an installed legacy entry, start a fresh chat with the current package enabled and complete any requested existing-App connection. A missing current-chat tool after uninstall does not alone prove that the saved App binding is invalid. Host-normalized native manifests use the top-level apps pointer; the validator accepts that supported shape and rejects conflicting nested pointers.
