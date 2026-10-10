# Paprika Messenger 1.4.0-rc.5

Plugin **1.4.0-rc.5**, service **0.6.0-rc.5**. This test release packages the cloud-conversation link fix merged in [PR #17](https://github.com/newbiesitl/paprika-messenger/pull/17). Behavior is unchanged from rc.4: verified ChatGPT navigation URLs are separate from immutable message-routing IDs and appear in recipient menus and send confirmations. Opening uses the client's URL action. Refresh preserves existing links when no new URL is available.

The ZIP and tar.gz pairs contain the owner-neutral account installation kit, complete reusable service source, and compiled Worker. `artifacts.json` records the exact source commit, included versions and Worker digest; `SHA256SUMS` records all six archive hashes. The compiled Worker is a JavaScript server module for the existing Sites/Cloudflare runtime, not a desktop executable.

No new migration is added after rc.4. Upgrades from rc.3 or earlier require the existing additive `0005_conversation-url.sql` migration; existing registrations, messages and routing stay intact. Publishing this release does not install an account plugin or deploy a private service.

Release validation covers the service/package tests, receiver fixture tests, generated GitHub package parity, and all historical archive checksums. Windows and macOS CI also verify the current release's ZIP/tar.gz contents against the source build.

The user confirmed recipient links appear on the phone, and an earlier Cloud-chat URL pilot opened a normal iPhone conversation. Desktop rendering remains unverified; remote-local navigation is deferred. Missing links require verified host metadata or a verified owning conversation URL; reinitializing a registration is unnecessary.

Keep the unchanged [1.4.0-rc.4 release](../1.4.0-rc.4/README.md) and saved private Site version for rollback. Restore the previous service without reversing the additive migration. Restoring old account-plugin contents requires a new higher version; never overwrite a published tag or archive. See [upgrading](../../docs/UPGRADING.md).
