# Paprika Messenger 1.4.0-rc.6

Prerelease plugin **1.4.0-rc.6**, service **0.6.0-rc.6**. Adds explicit, revision-checked mappings from registered recipient/runtime IDs to actual ChatGPT conversation IDs. Codex can use the verified destination with its native messaging tool. Existing native Codex-to-Codex delivery remains supported.

Original ChatGPT `/c/` links or actual conversation IDs must be checked against native host metadata before saving a mapping. Share links and inferred runtime conversions are rejected. Mapping updates preserve existing registrations and inboxes; saved mappings take precedence over cached navigation URLs. A direct native send needs no event hook. The originating Codex host must expose the required native tools. This release does not add a Dot relay or cloud-to-cloud sending.

Apply the additive `0006_recipient-conversations.sql` migration to the same private service. Existing messages, registrations and receiving settings remain intact. Update the account package separately, preserving its App binding and audience. Publishing these archives alone does not deploy a service or install a plugin.

The six ZIP/tar.gz archives contain the owner-neutral plugin kit, service source and compiled Worker. `artifacts.json` records their versions, exact source commit and Worker digest; `SHA256SUMS` records all archive hashes. Owner-specific configuration is excluded.

Validation includes 141 service/package tests, 31 native-delivery and local-receiver fixture tests, package parity, Worker compilation, archive parity and historical checksums. Previous live tests established Codex-to-Codex and Codex-to-an-actual-ChatGPT conversation delivery; the complete rc.6 installed workflow still needs a fresh end-to-end pilot.

Keep the [rc.5 release](../1.4.0-rc.5/README.md), previous private plugin archive and saved Site version for rollback. Restore the old service without reversing the additive migration. Account-plugin rollback uses a higher version with the old contents; never move released tags or overwrite archives. See [upgrading](../../docs/UPGRADING.md).
