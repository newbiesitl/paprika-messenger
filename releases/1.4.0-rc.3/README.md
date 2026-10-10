# Paprika Messenger 1.4.0-rc.3

Test candidate with service **0.6.0-rc.3**, built from source commit `509efe3366041f1e14e328e8ff3b3c32e3a6b0f0`. The previous [1.4.0-rc.2](../1.4.0-rc.2/README.md), [1.4.0-rc.1](../1.4.0-rc.1/README.md) and stable [1.3.11](../1.3.11/README.md) archives remain unchanged for rollback.

Recipient rows and the selected recipient in the custom dropdown gain a separate **Open conversation** link. The host's built-in question panel offers **Open a conversation** and then returns a link or uses supported native navigation. Opening does not select a send recipient or send pending content. Agreed content and its idempotency key remain frozen while navigating.

Confirmed message results include the exact recipient's link when supported. A failed optional metadata lookup leaves confirmed storage intact. Links use verified native IDs and source/host metadata, never communication IDs or public share URLs. ChatGPT links open in the signed-in account. Local Codex links open on the computer handling the link; they do not choose another computer. Unknown, cloud Codex and remote host routes have no invented URL. Host navigation refusal leaves a copyable link.

## Upgrade and rollback

No new database migration or stored navigation field is introduced. Preserve the existing private Site, D1 data, audience, App/OAuth binding, subscriptions and receiving tasks. Install the account package and deploy the matching service separately. Retain the complete previous private plugin archive and saved Site version. Service rollback restores that saved version against the same database. Account rollback through Plugin Creator uses the old code in a new, higher version with the current release guard; do not overwrite old release assets.

The owner-neutral plugin, service source and compiled Worker are supplied as ZIP and tar.gz pairs. `SHA256SUMS` covers all six archives; `artifacts.json` records versions, source commit, hashes and Worker digest. Personalized account configuration stays outside public Git. See [upgrade instructions](../../docs/UPGRADING.md).

## Verification

125 service, protocol, UI and packaging tests and 13 existing receiver regression tests pass locally. Added checks exercise HTTP and MCP confirmations, idempotent retries, exact recipient matching, metadata failure, independent dropdown anchors, host navigation refusal and native Open without send authorization. Generated package validation and archive parity checks pass. No live recipient message was sent. Actual mobile rendering and cross-device navigation require tests on those clients.
