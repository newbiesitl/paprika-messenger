# Paprika Messenger 1.3.7

[Download installation kit](paprika-messenger-private-1.3.7.zip) · [SHA-256 checksum](SHA256SUMS)

This release builds one personalized messaging package from the current skills, complete service source **0.5.5** and the selected owner's existing Sites App binding. It preserves the Paprika pixel image for both plugin logo and composer icon. The App supplies MCP tools and existing OAuth; it is referenced without creating another App or service.

The public ZIP is an owner-neutral kit. Follow [Account installation](../../docs/ACCOUNT-PLUGIN.md#build-the-single-package) to generate the final standalone ZIP against your private Site, then save it through Plugin Creator. Account installation is the default; explicit local builds use the same version with `--kind local`. Personalized App IDs, endpoints and generated archives stay outside public Git history. Both skills and the merger ship in this kit, so the merger also runs from an extracted ZIP without a repository checkout.

Local receiving remains on demand with no hooks or schedules. Supported cloud receiving defaults to verified events. No selected peer means receiving only without a peer question. Installing a package creates no receiving task.

Validation: 86 service/packaging tests and 13 automated receiving-pilot tests passed; hosted Worker build and generated-package freshness checks passed. Packaging tests extract the combined ZIP, verify both manifest App pointers, both skills, matching current version and exact icon bytes, and reject incorrect App/Site bindings, credential endpoints, version downgrades and missing configuration. Fixture checks do not establish mobile readiness or automatic wake-up on a user's client.

The Site-generated compatibility listing can still show 1.0.0 for the underlying App. The combined package uses 1.3.7; its listing and icon come from the latest package rather than that old manifest. Preserve the existing Site, database, App, OAuth connection and private audience when upgrading. Existing legacy plugin entries should be removed only on request after a successful check with the combined package alone enabled.
