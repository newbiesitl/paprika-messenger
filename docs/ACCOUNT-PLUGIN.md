# Private account installation (default)

Paprika's default installation saves a PRIVATE plugin to the authenticated ChatGPT account so the package is available on supported cloud, mobile and desktop surfaces. The package contains the messaging skill, setup skill and complete service source. A repository checkout or a local Codex marketplace install supplies files on one computer; account saving is a separate required step for this default flow.

Plugin **1.3.6** bundles service **0.5.5**. Download the [complete private account ZIP](../releases/1.3.6/paprika-messenger-private-1.3.6.zip) and its [SHA-256 checksum](../releases/1.3.6/SHA256SUMS). To build from a source checkout, run `node scripts/prepare-account-plugin.mjs`; use the exact absolute `archive` path in the returned report.

## Save, install and set up

1. Open ChatGPT Work or Codex with Plugin Creator available. For personal installation, select your **Personal account context**. Plugin Creator saves into the active workspace when one is selected, otherwise into the personal account. PRIVATE visibility alone does not mean personal scope.
2. Supply the complete ZIP and ask Plugin Creator to **save a private account plugin** through its hosted account-save tools. It must return an account plugin link and backend identity. For a new plugin, its `create_plugin` tool receives the ZIP's absolute local path as `archive`; a GitHub URL or local marketplace registration is not an account upload. Discover and reuse an existing matching account plugin when available, updating its verified identity and scope rather than creating a duplicate.
3. Open the returned plugin link and select **Install**, then enable it in a new chat. Check the registered scope: `USER` for personal installation, or the explicitly selected `WORKSPACE`. A displayed link confirms a saved package only; verify installation through the host's installed-plugin status or retain installation as pending until the user completes it.
4. Run `$setup-paprika`. It checks Sites, reuses your existing owner-private instance or deploys the bundled service with a separate private database, and offers the exact Site-provisioned service plugin. Install/connect that service plugin with the same account in each intended client and verify `list_boards` and a read-only `list_messages` call.

The reusable account setup plugin and the Site's service plugin have separate identities. Keep the account package for its instructions and resources, and keep Sites' canonical service plugin installed and enabled for MCP tools. Removing the service plugin can leave the skills available while removing live messaging tools. Account upload creates no messaging service; Site deployment alone does not install the reusable account package. Preserve an existing working Site and its message history when finishing account installation. See [connection troubleshooting](CONNECTION-TROUBLESHOOTING.md) when a skill or mention appears without tools.

## Use the same latest package version

Local and account setup packages are built from the same current manifest, **1.3.6**, and must report that version after installation. Compare native account metadata and the stored root plugin.json, or the installed local manifest, with the downloaded release; update an older eligible package through its supported workflow. Saving a Site connection alone does not install the complete account setup package.

The Site-provisioned connection has a separate plugin ID and listing version. The reported **1.0.0** UI label is not a Paprika package or service release in this repository; the only 1.0.0 reference in the portable manifest is its schema URL. Inspect that exact connection’s native metadata before attributing how its listing version was assigned. Do not overwrite a canonical Site connection with a ZIP or claim that changing a label updates its service. See [Version checks](SETUP.md#version-checks).

## Copyable GitHub installation request

```text
Install Paprika Messenger from https://github.com/newbiesitl/paprika-messenger
as a PRIVATE personal account plugin for cloud Work, mobile and my other devices.
Use the complete private account ZIP and Plugin Creator's hosted account-save
workflow. Discover and reuse an existing matching account plugin if present.
Return the saved plugin link and verify the current package version, USER scope
and installation. Keep account
installation pending if those capabilities or the Install step are unavailable.
Then run setup, reusing my existing private Site and connecting its canonical
service plugin. Verify each intended client separately.
```

## Finish an installation that started locally

Keep the current service and any setup checkpoint. Save the complete account package through the steps above, then connect the existing Site's provisioned service plugin on the other devices. The account upload need not rebuild or redeploy that Site. Remove the optional local package only if you want to; doing so does not delete the account plugin or Site.

If the host cannot save an account plugin, discover or connect Plugin Creator and keep this milestone pending. Continue independent inspection and preserve the ZIP, service and checkpoint. Use local installation only after an explicit request for a device-only install; do not silently substitute it for account installation.

## Verify the result

Report account package saving and scope, account installation, private service deployment, and each client's authenticated connection as separate results. Verify the package in the account's Plugins directory and perform real connection checks from the intended cloud, mobile or desktop client when available. Do not infer mobile readiness from desktop installation, local tests, an installation card, or a successful Site publication. Record an untested client as pending.

Availability depends on the selected account/workspace, supported client and required plugin connections. Initial package building and deployment use a capable Work or desktop environment with Sites access, a writable workspace and Node.js 24 or later; routine use on another supported device reuses the cloud service. Each receiving chat opts in to notifications separately.

For workspace-managed distribution, an admin may use [GitHub marketplace import](GITHUB-INSTALL.md). Existing account plugin updates preserve their verified backend ID, scope and audience and use Plugin Creator's supported update tools. Keep account IDs, installation records, credentials and receiver checkpoints outside Git. See [Setup](SETUP.md) and [Upgrading](UPGRADING.md).
