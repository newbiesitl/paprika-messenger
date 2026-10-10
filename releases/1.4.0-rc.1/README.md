# Paprika Messenger 1.4.0-rc.1

Test candidate with service **0.6.0-rc.1**. The stable [1.3.11](../1.3.11/README.md) artifacts remain unchanged for fallback. This release adds:

- A searchable in-chat recipient card and a shared private-board website picker.
- A board filter defaulting to `main`, using already registered boards and routing.
- Native thread name and ID, grouped by verified native project, with ChatGPT/Codex and Cloud/Local annotations. Unknown project metadata is distinct from unassigned.
- The most recent 50 recipients by Paprika communication, Load more pagination, and literal ID/name search across the full selected-board directory. No NLP service is required.
- Bounded host metadata refresh with a five-minute cache, plus **Refresh thread details** to force a fresh lookup for the current page.
- Choose a recipient before typing, or choose after agreeing content to request that exact message once. Frozen content and one idempotency key survive timeout/reconciliation; rendering and metadata refresh send no Messenger message.

## Packages and provenance

The plugin, service source and compiled Worker are each provided as ZIP and tar.gz for Windows and macOS. `SHA256SUMS` covers all six archives; `artifacts.json` records their hashes, included versions, source commit and Worker digest. Build from committed source with the lockfile. Do not replace published archives or move this release's tag.

The public plugin kit has no owner's App binding or credentials. Use the setup skill to merge it with the selected owner's existing service App before account installation. A plugin install does not deploy the service by itself.

## Migration, host support and rollback

Deploy the same private service and D1 with the additive `0004_recipient-directory` migration. It preserves existing routes, messages and receiving subscriptions while adding metadata and communication-recency storage. Backfill reads existing posted-message events; list/metadata reads never change recency. A 50-entry metadata update stays within the hosting statement and bound-parameter budgets.

The host skill reads native metadata. The Site and browser cannot independently access ChatGPT/Codex catalogs; unavailable hosts retain cached/unknown fields. Search uses observed names, so a newly renamed older conversation may need ID lookup and refresh first. MCP Apps context attachments and native composer mentions depend on the client's support; the card supplies an explicit address command when attachment is unavailable. Native mentions use `main`; other boards use the card filter.

Keep the prior installed private package and saved Site version. Revert the running service by redeploying that saved version, keeping the additive tables and the same database. To restore old plugin code through Plugin Creator, upload it with a higher rollback version and the actual current release guard; lower uploaded versions are rejected. See [upgrade and rollback](../../docs/UPGRADING.md).

## Verification

110 service, protocol, UI, routing and packaging tests pass, plus 13 local receiver/host-context checks. The new checks cover older recipients beyond the first 50, Unicode search/cursors, board isolation, rename/project changes, atomic metadata updates, hosting query budgets, owner authorization, selection without sending, frozen agreed content, repeated clicks, timeouts and active metadata refresh. Archive verification checks ZIP/tar.gz parity, current Worker hash and historical checksums. Live host-native UI behavior still needs testing in each requested client.
