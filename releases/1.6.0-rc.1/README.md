# Paprika Messenger 1.6.0-rc.1

Plugin **1.6.0-rc.1**, bundled service **0.8.0-rc.1**.

This candidate includes the stable 1.5.1 baseline, retaining direct setup with event hooks off by default.

Autonomous collaboration lets selected, verified Codex threads exchange reports and follow-up tasks under an explicit human standing grant. Each sending host must accept that grant under its own permission rules. The default Max handoff depth is **5**: each logical thread-to-thread message counts once, while retries and receipts do not count. A new human-initiated assignment starts a new chain; reaching the limit requires human intervention.

Board policies and collaboration runs use the existing Site database. Atomic message guards enforce participant scope, the current sender, reply continuity and the handoff cap. New tools configure collaboration and start, inspect or stop runs. Board messages and native notices show `Sender · Handoff N/M`.

Upgrades apply the additive migration `0009_autonomous-collaboration.sql`. Preserve existing boards, messages, receiving settings, owner-private audience, App bindings and service/account identities. Collaboration is disabled by default. Deploying this version does not grant communication permission or create a receiving task.

The six archives contain the owner-neutral account installation kit, service source and compiled Worker in ZIP and tar.gz formats. `artifacts.json` records the source commit and Worker digest; `SHA256SUMS` records archive hashes. Bind the generic kit to the owner's existing service App before account installation. Earlier release assets remain unchanged.

Validation: all 197 service and packaging tests, Worker compilation, generated package consistency and 18 native delivery probe tests passed on Windows and macOS CI. The 13 receiver pilot tests passed on Windows CI. Local board preview verified the sender/depth display. A live native architect/worker conversation has not been exercised. Run `node scripts/release.mjs verify` for historical checksums and release archive parity before merging or tagging.

Source merge, Site deployment, account plugin update and client activation are separate steps. This release also supports the current Sites validator directory during Windows packaging. See [upgrade guidance](../../docs/UPGRADING.md) and the [maintainer guide](../../docs/MAINTAINING.md).
