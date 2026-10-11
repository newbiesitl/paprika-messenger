# Paprika Messenger 1.4.0

Stable plugin **1.4.0**, service **0.6.0**. This release carries forward the rc.6 recipient picker, verified conversation links and authorized Codex native bridge. It gives the main package and backend distinct display names: **Paprika Messenger** uses the original red Paprika pixel icon; **Paprika Service** is the private service connector. Both packaged skills declare the Paprika icon.

Choose **@Paprika Messenger** to filter to the main package in ChatGPT. A shorter `@Paprika` search may also show Paprika Service. The host controls this picker, and no supported package setting hides a required App connector. Keep that connection enabled.

The native bridge uses explicit, revision-checked recipient-to-ChatGPT conversation mappings and verified native host metadata. It requires the originating Codex host's native messaging tools. This release does not add a background relay or a new cloud-to-cloud delivery route. Existing receiving settings are preserved.

Upgrade the same private Site when updating its running service. Apply the append-only migrations through `0006_recipient-conversations.sql`; existing messages, recipients and subscriptions remain intact. New setup uses **Paprika Service** as the Site title. For an existing connector, its App name is changed through the App's settings. Updating the account package alone does not rename App-owned presentation or deploy a service.

The six ZIP/tar.gz archives contain the owner-neutral plugin kit, service source and compiled Worker. `artifacts.json` records versions, the exact build source commit and Worker digest; `SHA256SUMS` records archive hashes. Each owner binds the kit to their own existing private App before account installation. Owner configuration and credentials are excluded.

Validation covers the service/package suite, native-delivery and local-receiver fixtures, generated package parity, Worker compilation, ZIP/tar parity and historical checksums. These automated checks do not certify every mobile or cloud host's rendering or native delivery. Those routes remain subject to the capability checks documented in the package.

Preserve the previous account archive and saved Site version for rollback. Restore the previous service without reversing additive migrations; an account-package rollback needs a higher version containing the previous files. Existing tags and released archives remain unchanged. See [upgrading](../../docs/UPGRADING.md) and the immutable [rc.6 release](../1.4.0-rc.6/README.md).
