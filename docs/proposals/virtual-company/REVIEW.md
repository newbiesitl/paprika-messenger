# Review and acceptance plan

**Design review only.** No implementation, deployment, live host test, or automatic reviewer invocation is part of this proposal PR. Read the [RFC](../PAPRIKA-VIRTUAL-COMPANY.md) and [examples](EXAMPLES.md).

## Review lanes

| Reviewer focus | Questions to answer |
| --- | --- |
| Paprika/Messenger maintainer | Can both packages safely reuse core/client source and one existing service? Are receiver IDs, delivery checkpoints, paused subscriptions, and current releases preserved? |
| Codex integration developer | Which actual host tools create persistent app-visible chats under an existing project? Can stop/quiescence, naming, identity, and reopening be independently verified on each target? |
| Reliability reviewer | Does the GitHub claim protocol prevent concurrent provisioning? Where can uncertain native creation, raw actions, offline execution, or stale epochs violate assumptions? |
| Knowledge/agent reviewer | Are contracts, assignments, and current snapshots distinct? Are revision checks, loss detection, provenance, and onboarding receipts adequate? |
| Security/product reviewer | Is enrollment bounded and revocable? Are private/public storage, one-host scope, no force takeover, and non-goals unambiguous? |

Record each finding with the relevant section, severity, scenario, proposed correction, and evidence. A role's self-reported success or a fixture pass is not a substitute for host-side verification.

## Required acceptance scenarios

| ID | Scenario | Passing evidence |
| --- | --- | --- |
| C01 | Coordinator plus two missing roles in an existing saved project | Exactly three persistent app-visible role chats, correct native identities and working project, independent reopen. |
| C02 | Adapter exposes only backend sessions or subagents | Setup blocks with a precise limitation; no silent substitution or readiness claim. |
| C03 | Repeat bootstrap | Reuses the same role bindings; zero new threads, receivers, hooks, or onboarding duplicates. |
| C04 | Two coordinators race on one host | Only one remote reservation wins before native creation; loser re-evaluates and performs no duplicate create. |
| C05 | A second host tries to join | No role activation there while the first host owns the company, even if some roles are not yet provisioned. |
| C06 | Timeout before/after native creation | Unknown operation keeps the slot; no blind retry; exact created thread is reconciled or recovery stays blocked. |
| C07 | Crash after creation but before binding/receipt | Recovery preserves native identity and uses the same operation ID; no second instance. |
| C08 | Registry update times out or loses a race | Re-read exact remote state; never force-push or merge competing ownership claims. |
| C09 | Registry permission/rules reject writes | Fail without weakening protections or treating local state as authoritative. |
| C10 | Network partition or stale host epoch | No new managed dispatch/promotion; no timeout-based takeover; in-flight behavior documented and tested. |
| C11 | Rename, version edit, copied folder, or fork | Does not manufacture a new ownership namespace or adopt a different repository. |
| C12 | Contract/assignment changes during onboarding | Stale receipt rejected; same instance re-onboards; ownership expansion requests approval. |
| C13 | Receipt merely echoes identifiers | Controller verifies sources/native identity; missing evidence stays blocked. |
| C14 | Snapshot replacement | New bounded current snapshot contains every unresolved item or an evidenced resolution/transfer; old version retrievable by Git commit. |
| C15 | Failed or conflicting snapshot publication | Prior current pointer remains valid; concurrent post-boundary work is retained for reconciliation. |
| C16 | Restore an older snapshot | Publishes old content as a new revision; no history purge or revision rollback. |
| C17 | Migration Mac to Windows | All old roles/receiving routes verified quiescent before new claims; no cross-host overlap; new roles recover assignments and latest knowledge. |
| C18 | Old host unreachable during migration | Transfer remains blocked until explicit recovery proves the old executor cannot continue; missing heartbeat is insufficient. |
| C19 | Both plugin packages installed | One service binding/receiver route per identity; no duplicate lifecycle execution or delivery. Messenger-only behavior remains unchanged. |
| C20 | Local native notifications unavailable | Reports on-demand state accurately; does not create an unrequested scheduler or claim a wake. |
| C21 | Public repository and sensitive knowledge | Private registry/knowledge destination required; no secrets, native IDs, or transcript publication into public examples. |
| C22 | Conflicting ownership/shared checkout writes | Ambiguous exclusive ownership blocks planning; write/Git conflicts are serialized or isolated on the same host. |
| C23 | Manifest removed role, revived archived chat, or manual duplicate | No implicit delete/reactivation; retired binding cannot regain authority; unmanaged duplicate risk is surfaced. |
| C24 | Drift in local global instructions/config | Actual host policy provenance and restrictions reported; portable role hash does not conceal a conflicting execution policy. |

## Validation progression

**Gate A: Capability evidence.** Run the read-only host probe, then the explicitly approved two-role pilot on each supported Mac/Windows build. Archive only sanitized test evidence. Failure of native project visibility or reliable stop/quiescence blocks the relevant lifecycle capability.

**Gate B: Deterministic contracts.** Add schemas and tests for stable IDs, path safety/case, role-section extraction, canonical digests, assignments, snapshot carry-forward, and operation state transitions. Test malformed and adversarial inputs as data, not instructions.

**Gate C: Lifecycle fault tests.** Inject failures around every native submission and every Git-ref update. Confirm conflict handling, unknown-operation retention, epoch checks, package coexistence, and state recovery. Test the conditional-commit protocol against a private sandbox repository, not only mocks.

**Gate D: Portability pilot.** Bootstrap, finish a small assignment, distill knowledge, rerun without duplicates, quiesce all roles, transfer the whole company, and verify reconstruction without old chat history. A failed step must have a recoverable state and honest status report.

**Gate E: Release review.** Run the repository's required validation workflow, compatibility tests, and human review. Package/source merge is separate from private plugin installation or service deployment. Preserve immutable Messenger release archives and existing deployment IDs.

## Decisions intentionally not delegated by this PR

No reviewer is being authorized to deploy, alter branch protections, create live event subscriptions, start a persistent background runner, spend on test agents, delete role histories, or bypass an ownership conflict. Implementation should be proposed separately after the architecture and evidence gates are reviewed.
