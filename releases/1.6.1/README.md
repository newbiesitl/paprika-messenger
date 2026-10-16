# Paprika Messenger 1.6.1

Plugin **1.6.1**, bundled service source and compiled Worker **0.8.1**. This patch packages the reviewed implementation from PR #40.

- Adaptive delivery keeps ordinary messages through 1,500 original Unicode code points inline by default and stores longer bodies intact before a reference notification. The limit is configurable; failed or unsupported storage never falls back to inline delivery.
- Every linked reply or collaboration message uses confirmed storage at any length, preserving the parent, server-counted handoff and stopped/exhausted-chain checks. Direct delivery rejects linked metadata. Existing event routes and uncertain native submissions retain their transport and retry protections.
- Native sender headers use observed titles, explicit role bindings and verified plugin metadata, with readable fallback branding.
- Read-only package/PNG diagnostics inspect manifest precedence, icon paths, dimensions and hashes. The generic picker icon cause remains unresolved, and actual host rendering needs separate verification. This release does not claim an icon fix.

The six archives contain the owner-neutral account installation kit, reusable service source and compiled Worker in ZIP and tar.gz formats. `artifacts.json` records the clean source commit and Worker digest; `SHA256SUMS` records every archive hash. Bind the kit to the selected owner's existing private service App before saving the account package. An upgrade preserves the current plugin identity, audience, presentation, icon bytes, App/OAuth connection and service binding. Keep all previous release archives unchanged.

The service patch version distinguishes changed embedded skill resources from released 0.8.0 bytes. Service APIs and migrations are unchanged. Installing this account package does not deploy the Worker, change the hosted service, start receiving or grant collaboration permission. Existing migrations remain through `0009_autonomous-collaboration.sql`; this package update requires no migration. Preserve boards, addresses, history, receiving settings and pending journals.

Validation: **240** main tests and **31** receiver/native regression probes pass locally on macOS with Node.js 26.5.0. Worker build and generated GitHub package parity pass. The release builder checks all six extracted archives, version metadata, hashes and ZIP/tar.gz parity. Required Windows and macOS CI checks must pass on the final release head before tagging. Local fixtures do not establish production collaboration, client activation or picker rendering. See [upgrade guidance](../../docs/UPGRADING.md).
