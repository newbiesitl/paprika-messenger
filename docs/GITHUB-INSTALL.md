# Install Paprika Messenger from GitHub

GitHub distributes the complete private setup package: both skills, icons, service source, migrations, tests and integrity metadata. **Private account installation is the default**, for supported cloud, mobile and other devices signed into that account. Each owner runs setup for their own private service.

## Account installation from GitHub (default)

Follow [Private account installation](ACCOUNT-PLUGIN.md): use the [complete private account ZIP](../releases/1.3.11/paprika-messenger-private-1.3.11.zip), bind that installation kit to your verified existing service App, then save the resulting standalone ZIP through Plugin Creator's hosted account-save workflow, open the returned plugin link, install it and verify the intended scope. For a personal plugin, select the Personal account context before saving. An active workspace selects workspace scope.

```text
Install Paprika Messenger from https://github.com/newbiesitl/paprika-messenger
as a private personal account plugin for cloud Work, mobile and my other devices.
Use the complete current kit, merge my existing service App binding into it, then save one standalone ZIP through Plugin Creator.
Verify the current package version, account scope and installation, then run setup using my existing private
Site if I already have one. Report each client's connection separately.
```

The commands below intentionally install on one computer. Registering a GitHub marketplace through Codex CLI has no account-wide installation switch. Use those commands only when choosing a local installation; cloud account saving and installation remain separate.

## Optional installation on one computer

Use a current Codex CLI with `codex plugin` support. In a terminal, run:

```sh
codex plugin marketplace add newbiesitl/paprika-messenger --ref main
codex plugin add paprika-messenger-private@paprika-github
```

Start a new Codex session or refresh the desktop app, then open **Plugins** and confirm **Paprika Messenger (Private)** is installed and enabled. The installation is local to that computer. It does not make the package available in ChatGPT on the web or on another device.

In ChatGPT Work or Codex in the desktop app, with Sites available, run:

```text
$setup-paprika Set up my private Paprika Messenger service. Reuse my existing
private service if I already have one, otherwise deploy my own private instance.
Verify the authenticated connection before reporting success.
```

Setup uses the complete installed template. New deployment needs Sites access, a writable workspace and Node.js 24 or later. Sites is currently available on Plus, Pro, Business, Enterprise and Edu, subject to account limits and workspace controls. Standalone Codex CLI can prepare and test local source; use ChatGPT web or the desktop app for Sites deployment and management. GPT-6 is not a package requirement.

On Windows, inspect the installed Sites packager’s prerequisites before registration. Sites 0.1.75 can fail when Bash is absent even though Node, Git and native tar work. Follow [Windows packaging troubleshooting and recovery](WINDOWS-SITES-PACKAGING.md); the included native packager preserves the same Site and validated source revision.

Enable the one combined package with its required existing Site App in every participating client and complete any requested authentication. Verify `list_boards({})` and a read-only `list_messages` call. Installing the setup package, deploying the service and binding/authenticating its existing App are separate steps. Each receiving chat opts in to notifications separately.

## ChatGPT workspace installation

A workspace admin can make the package available on supported ChatGPT and Codex surfaces:

1. Open **Admin > Plugins > Add > Import marketplace**.
2. Set **Source** to `https://github.com/newbiesitl/paprika-messenger`, leave **Path** empty, and set **Branch, tag, or commit** to `main`.
3. Authorize the supported GitHub connection and review the import results.
4. Configure the imported plugin's installation policy for the intended roles. Members then install it and run the setup workflow with their own account.

Workspace import and sync use the admin's GitHub access and workspace policies. Importing this skills package does not grant Sites access or authenticate a messaging service. Personal installation uses Plugin Creator's private account-save workflow; see [Private account installation](ACCOUNT-PLUGIN.md).

## Forks and private GitHub repositories

Forking is optional. This marketplace uses a relative package path, so a complete fork works without editing the manifest. Substitute your fork's `owner/repo` in the marketplace command, or its repository URL for workspace import. A private repository also requires the installing GitHub identity to have read access through the supported client connection. A public upstream fork is not automatically a private repository; hosting a private messaging service is separate from repository visibility.

## Local updates and removal

Refresh the registered marketplace, then reinstall the package through Codex:

```sh
codex plugin marketplace upgrade paprika-github
codex plugin add paprika-messenger-private@paprika-github
```

Start a new session after updating. Workspace admins can use **Sync now**; new workspace imports otherwise sync daily. An update refreshes setup files and skills; upgrade an existing service separately with [Upgrading](UPGRADING.md).

To remove the local setup package and its marketplace:

```sh
codex plugin remove paprika-messenger-private@paprika-github
codex plugin marketplace remove paprika-github
```

Uninstalling the setup package does not delete a private Site, its database or any receiving task. Manage those through their respective supported interfaces.

## Maintain the GitHub package

Edit the canonical source under `src/`, `skills/`, `plugin-public/` and the other service directories. Bump the plugin version for a new package release, then run:

```sh
node scripts/prepare-github-plugin.mjs
node scripts/prepare-github-plugin.mjs --check
```

Commit the generated `plugins/paprika-messenger-private/` directory with the source changes. The generator retains any previous package in ignored `artifacts/` storage. CI compares every generated file with current source, checks template integrity and rejects personal credentials or deployment identities. Packaging normalizes bundled text to LF before hashing, and `.gitattributes` preserves LF during checkout. Existing released ZIPs and checksums remain immutable.

The GitHub marketplace is a distribution source. This flow does not publish a listing in OpenAI's public Plugins Directory.

CLI marketplace commands manage the local copy. Account package updates use the verified account plugin identity and Plugin Creator's update workflow; they are not applied by refreshing a local marketplace. The final personalized package includes the existing service App binding; inspect it before updating and preserve that binding.

See the official [plugin packaging](https://developers.openai.com/plugins/build/plugins), [Codex plugin commands](https://learn.chatgpt.com/docs/cli/reference), [workspace GitHub import](https://learn.chatgpt.com/docs/enterprise/plugin-management), and [Sites](https://learn.chatgpt.com/docs/sites) documentation.

The current public archive is an owner-neutral installation kit. Finish the [standalone merge](https://github.com/newbiesitl/paprika-messenger/blob/main/docs/ACCOUNT-PLUGIN.md#build-the-single-package) before saving the final account package. The generated private ZIP combines the required existing App, both skills and the original Paprika logo/composer icon.
