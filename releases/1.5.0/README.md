# Paprika Messenger 1.5.0

Stable plugin **1.5.0**, bundled service **0.7.0**. This promotes the existing 1.5 release candidates plus merged PR #29 sender annotations and PR #30 release preparation. The connection guidance from PR #28 is included through that merged baseline. The separate callback-health work is excluded.

Requested receiving setup shows the existing connection card and continues authorized setup; settings-only requests remain read-only. Native notifications show the stored original sender's quoted label and immutable ID. Relays preserve original authorship, while direct delivery uses its verified sender. Routing, permissions, retry checkpoints and transport selection are unchanged. The card HTML is unchanged.

The release also retains the 1.5 line's recipient caching, change revisions, board-thread remove/restore controls and explicit native notification relays. Upgrades from stable 1.4.0 require existing append-only migrations through `0008_recipient-cache-revisions.sql`; this stable promotion adds no migration beyond its release candidates. Preserve boards, messages, receiving settings, App/OAuth binding, owner-private audience and existing service/account identities. Deployment alone creates no task or subscription.

The six archives contain the owner-neutral account installation kit, service source and compiled Worker in ZIP and tar.gz formats. `artifacts.json` records the exact build source commit and Worker digest; `SHA256SUMS` records archive hashes. Bind the generic kit to each owner's own existing service App before account installation. Never publish personalized account bindings or credentials. All earlier release archives remain unchanged.

Validation: 183 root tests, 13 receiver regressions and 18 native verification tests pass on Node.js 24.19.0 in the cloud Linux environment; Worker compilation and generated package parity pass. Local ZIP list/extraction checks use an external Python standard-library zipfile adapter, with GNU tar retained for tar/tar.gz. This is not native Linux ZIP validation. The final release-preparation head must also pass Windows/macOS CI, including archive parity and historical checksums, before the stable tag is published.

Account installation, Site publication, cached client activation, visible card rendering and actual receiving are separate checks. Keep previous saved Site and account versions for rollback; do not reverse additive migrations or overwrite old published archives. Restoring prior account contents requires a higher package version. See [upgrade guidance](../../docs/UPGRADING.md).
