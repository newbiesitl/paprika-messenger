# Paprika Messenger 1.6.0

Plugin **1.6.0**, bundled service **0.8.0**. This stable release promotes the latest merged source from PRs #32, #36 and #37 on the 1.5.1 baseline.

- Cached recipient discovery, verified conversation links, recoverable board cleanup and explicit native delivery.
- Codex collaboration under an explicit human standing grant, with participant scope, reply continuity and a default maximum handoff depth of **5**. Collaboration stays disabled by default.
- Callback transport evidence and host trace correlation; owner-scoped retirement of an exact already-paused event subscription when explicitly requested.
- On-demand receiving with event hooks off by default, without a preliminary settings card or new background task. Existing verified receiving choices remain intact.

The release contains the owner-neutral account installation kit, reusable service source and compiled Worker in ZIP and tar.gz formats. `artifacts.json` records source provenance and the Worker digest; `SHA256SUMS` records all six archive hashes. Bind the installation kit to the owner’s verified existing service App before saving the standalone account package. macOS and Windows use the same package and icon.

Apply the existing additive migrations through `0009_autonomous-collaboration.sql` when updating the service. Promotion from 1.6.0-rc.1 adds no new migration. Preserve the private audience, existing Site, App/OAuth connection, participants, boards, messages and receiving settings. Earlier release artifacts are unchanged.

Validation: all **213** service and packaging tests and **31** receiver/native delivery regression tests pass on Windows with Node.js 24.19.0. Worker compilation and generated GitHub package consistency pass. The release builder validates all six extracted archives, version metadata, exact hashes and ZIP/tar.gz parity. Required Windows and macOS CI checks must pass on the final release head before tagging.

Known limits: callback acceptance does not prove a receiving-host wake, and a live autonomous architect/worker chain has not been exercised. Installing this package does not deploy its bundled service or grant collaboration permission. See [upgrade guidance](../../docs/UPGRADING.md) and the [maintainer guide](../../docs/MAINTAINING.md).
