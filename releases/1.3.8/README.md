# Paprika Messenger 1.3.8

[Download installation kit](paprika-messenger-private-1.3.8.zip) · [SHA-256 checksum](SHA256SUMS)

This patch fixes validation of host-normalized native manifests: the App pointer belongs at the top level of the Codex manifest, while the portable manifest discovers it through its OpenAI extension. A redundant nested native pointer is optional, and conflicting pointers still fail validation.

The merger now upgrades directly from an existing complete standalone package, verifying its App and non-secret connection provenance against the current native Sites read-back. The older service-only package does not need to remain installed to build future updates. Both skills, complete service source **0.5.5**, existing Site/App/OAuth identity, full starter prompts and original Paprika logo/composer icon are retained.

The public archive remains an owner-neutral installation kit. Follow [Account installation](../../docs/ACCOUNT-PLUGIN.md#build-the-single-package) to create a personalized ZIP and save or update the same private account package. Local installation remains an explicit choice. Generated private binding files stay outside public Git history. Earlier release archives and checksums are unchanged.

After replacing a legacy plugin, activate the latest package in a fresh chat and verify its required existing App connection, then perform authenticated `list_boards` and `list_messages` reads. A missing tool in the previous chat does not establish a fresh client's result. Archive validation and connected-account display alone are insufficient evidence of working tool activation. The skills now direct standalone users through current-package activation checks before considering legacy reinstallation.

Validation: 86 service/packaging tests and 13 receiving-pilot tests passed; Worker build and generated-package freshness passed. The corrected validator accepts the actual host-normalized installed 1.3.7 cache. Tests remove the legacy fixture before upgrading from the combined package, preserve exact App/icon bytes, and reject conflicting pointers and wrong-Site provenance. Live activation in a fresh client remains a separate required check.
