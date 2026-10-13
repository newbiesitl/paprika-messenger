# RFC: Paprika Virtual Company — portable roles on one Codex machine

**Status:** Proposal for review; not implemented or a release announcement.  
**Requested scope:** A separate Codex-only plugin, sharing selected Paprika Messenger components.  
**Date:** 2026-10-13.  
**Source baseline inspected:** `788764c02214aedc2ffbe2d30ef8a7aea916d428` (Messenger stable 1.5.0 preparation).  
**Companions:** [Data examples](virtual-company/EXAMPLES.md) · [Acceptance and review plan](virtual-company/REVIEW.md).

## 1. Decision requested

Approve the architecture and first implementation milestones, not deployment. The first product outcome is **portable roles, assignments, and distilled working knowledge**, reconstructed in persistent, app-visible Codex conversations on one machine. Complete conversation-history migration is unnecessary.

The owner already keeps role definitions, ownership, and responsibilities in Git. Keep those documents authoritative. A user adds a repository as a saved Codex project, starts a coordinator conversation, and asks Paprika Virtual Company to adopt it, recreate missing roles, onboard them from the repository, and connect their Messenger addresses.

The new product is distinct from the owner's Paprika Dot. Neither a Dot nor ChatGPT cloud execution is required. Nothing in this RFC installs a plugin, creates a live company, schedules work, changes Messenger subscriptions, or alters the current release.

## 2. Requirements fixed by the owner

| Decision | First-release requirement |
| --- | --- |
| Packaging | Separately installable **Paprika Virtual Company**, reusing a maintained subset of Messenger modules. Messenger remains usable alone. |
| Execution | Codex on one selected machine; all company roles share that execution host. Mac and Windows are separate targets to certify. |
| Project bootstrap | User creates/selects the saved project and initial coordinator. Automated saved-project creation is not required. |
| Portability | Repository definitions and assignments plus current role-specific knowledge suffice; new native thread IDs are acceptable. |
| Uniqueness | At most one non-retired instance per company/role, including reserved, onboarding, paused, and uncertain instances. No duplicate-worker option in v1. |
| Ownership authority | Track lifecycle and ownership through GitHub, separately from definition versions and hashes. |
| Knowledge | One compact current snapshot per role, refreshed regularly and replaced safely rather than endlessly appended. |
| Onboarding | Verify pinned definitions, ownership boundaries, assignments, knowledge revision, and an actual role response. |
| Authorization | One bounded, revocable project enrollment for the approved operations; platform approvals still apply. |
| Later work | Company coordination, then company assistance. Distributed execution waits for separately verified cross-install Messenger notification support. |

## 3. Product and package boundaries

Build two independent distributions from shared source in this repository. Candidate modules below are **proposed boundaries**, not existing directories or an undocumented plugin-import mechanism.

| Shared/new component | Responsibility |
| --- | --- |
| Messenger client/core | Address resolution, board/recipient operations, inbox reads, delivery checkpoints, and confirmed receipts. |
| Codex host adapter | Discover actual capabilities; create/adopt/read/name/stop persistent project conversations and submit onboarding. |
| Company engine | Validate definitions, calculate plans, enforce claims, reconcile results, and report readiness. |
| GitHub state adapter | Atomic ownership transitions and immutable evidence references. |
| Knowledge manager | Distill, validate, publish, supersede, and retrieve bounded role snapshots. |
| Company skills | User-facing setup, status, onboarding, checkpoint, repair, and transfer workflows. |

OpenAI documents packaging skills and MCP connections in a plugin [S1], and distinguishes workflow guidance from controlled actions [S2]. Reuse modules at **source/build time**, with explicit compatibility versions. Do not assume the host can dynamically import selected internals from another installed plugin.

Preserve Messenger's plugin identity, App/service binding, database, historical participants, and release artifacts. Give Virtual Company its own package identity and namespaced skills. It should reuse the owner's selected existing service, not deploy a second board database or change a Dot-enabled service's type. No Dot workflows are included in v1.

Both plugins must coexist without duplicate receiver tasks, duplicate notifications, or different idempotency stores for the same delivery. Scope shared delivery records by deployment, board, receiver, and delivery ID, not package name. Do not read another installed package's cache as a source dependency. A build includes only the needed maintained components and notices; releases pin their compatibility. Package isolation is not a new backend security boundary.

Prefer a thin local workflow using verified native Codex tools. Introduce an in-process/local adapter only where needed. No always-on local daemon is required for the first bootstrap. If the native tools bypass the adapter, singleton enforcement is cooperative and must be described as such, not advertised as a hard security guarantee.

## 4. Three distinct kinds of state

| State | Source of truth | Examples |
| --- | --- | --- |
| Approved company definition | Working repository's reviewed Git revision | Role contracts, ownership descriptions, manifest, assignments, shared instructions. |
| Distilled role knowledge | Configured Git knowledge location | Current progress, decision references, unfinished work, blockers, next actions. |
| Operational ownership | One authoritative GitHub registry ref per company | Active host, generation, role claims, native bindings, operation outcomes. |

GitHub's registry is authoritative for **company ownership**; Messenger remains authoritative for **messages and delivery receipts**. Messenger role-directory entries are routing projections, never a competing ownership database. GitHub outages therefore block new ownership changes and new managed dispatch; they do not imply that existing message storage has stopped.

Portable files use relative, case-exact paths and stable logical IDs, not machine paths. Private local configuration resolves the working folder, Codex profile, exact saved project, and existing service authentication. A matching folder name is not project identity. Reject a different GitHub repository identity/fork until explicitly enrolled as a new company; a copied manifest must not acquire the original company's ownership.

The default registry target should be private. If the working repo is public, use an explicitly configured private GitHub state repository for native thread IDs, host bindings, grants, and sensitive snapshots. A non-default branch does not make public-repository contents private. Never commit credentials, callback secrets, real conversation bodies, or machine-identifying paths. This proposal contains fictional examples only, consistent with [Contributing](../../CONTRIBUTING.md).

## 5. Portable role and ownership contracts

Retain the existing `agent.md` or equivalent role document. Add a small manifest that indexes stable role IDs and exact references into that document; do not duplicate authoritative job descriptions in generated prompts or YAML. `AGENTS.md` may point to the existing document because it is Codex's documented discovered instruction filename [S4]. This RFC does not require renaming the user's file.

A role contract should describe its purpose, responsibilities, owned paths/components, inputs, outputs, acceptance criteria, decision rights, required reviewers, dependencies, escalation rules, and prohibited actions. Keep narrative descriptions in Markdown; use structured fields only where validation or routing needs them. Distinguish primary ownership from review responsibilities. Overlapping exclusive ownership or ambiguous role sections must fail planning until resolved.

Current assignments are a separate versioned register keyed by stable assignment IDs and logical owner roles. Link to existing issues/PRs rather than copying an entire task-management system. Store deliverable, status, evidence, dependencies, and next action. Snapshot status is as-of a recorded time/revision; recheck live issue/PR state when it matters.

Contract descriptions and CODEOWNERS can guide review, but they are not filesystem, credential, or GitHub authorization boundaries. Effective permissions must be enforced by actual host/service policies. Repository prose, incoming messages, and distilled notes cannot expand the approved scope.

## 6. Version definitions, knowledge, and ownership independently

| Field | Purpose | Not a substitute for |
| --- | --- | --- |
| `role_id` | Stable logical identity inside the company. | A native conversation ID. |
| `role_version` | Human-reviewable revision of the role contract. | Exact content verification. |
| `contract_digest` | SHA-256 of the effective portable role definition and referenced policy inputs. | A lock or permission grant. |
| `knowledge_revision` + `knowledge_digest` | Identify the current distilled snapshot. | Role definition version or exclusive ownership. |
| `assignment_revision` | Identify the approved assignment register. | Completion evidence. |
| `company_epoch` | Monotonic ownership generation, advanced on host/controller transfer. | Termination of a running old process. |
| `instance_generation` | Monotonic role-instance generation. | Permission to create a second instance. |
| `registry_revision` | Monotonic state-document revision. | Git's conflict checking. |

The digest input should be a versioned, canonical, sorted structure containing the role ID, referenced contract sections/files, effective ownership/policy fields, and normalized UTF-8/LF content digests. Preserve path case. Use deterministic section extraction or hash the entire file conservatively when stable sections are unavailable. Do not ask an LLM to infer a hash's scope. Exclude native IDs, volatile timestamps, knowledge, and the digest field itself. Record the exact source commit separately; unrelated code commits need not change a role contract digest.

Record actual host policy/configuration provenance separately from the portable contract. Host restrictions may narrow the role and must be reported. A matching digest proves matching input, not comprehension or authenticity. A privilege/ownership expansion requires approval and re-onboarding; a hash change cannot approve itself. Definition revision changes normally re-onboard the same instance, not create another.

## 7. Exclusive roles through a GitHub-backed registry

### 7.1 Invariants

Each company has one active host and one coordinator ownership claim. Each `(company_id, role_id)` has at most one occupied slot. A slot is occupied from `reserved` until verified `retired`; `unknown`, `paused`, and failed-but-not-reconciled creation retain the slot. Registry maps role IDs, not role hashes, so editing a definition cannot create a second lock namespace.

Every managed create, onboarding submission, dispatch, binding change, snapshot promotion, and retirement checks the current host, epoch, role generation, and operation claim. Use a per-company local mutex as well as the remote registry. Local state is a cache/journal, not the authority.

### 7.2 Atomic claim protocol

Use one state ref, for example `paprika-company-state`, holding a complete company state document. The coordinator is the only normal writer; roles submit checkpoint candidates instead of racing on a shared branch.

1. Read remote head `H` and its registry; verify enrollment, repository identity, host claim, definition revision, and empty/expected slot.
2. Build a candidate Git commit `C` with **exactly one parent, `H`**, containing the complete validated state transition and stable operation ID.
3. Update the ref to `C` with `force: false`. GitHub documents this as a fast-forward-only update [S5]. Two sibling commits from `H` cannot both become successive fast-forward heads.
4. A conflict means re-read and re-evaluate the operation. Never force-update, merge two ownership claims, or blindly rebase/retry the same intent. Only a confirmed winning reservation may invoke native creation.
5. On uncertain ref-update outcome, read the authoritative state/log for the same operation ID; do not issue the native action until ownership is established.

This is a **proposed conditional-commit protocol**, not a claimed built-in compare-and-swap parameter or distributed lock service. Record state transitions in Git history and test them against real GitHub behavior. Do not substitute independent updates to several files, issue labels, timestamps, or a local checkout. Registry setup must honor repository rules; if the selected ref cannot be updated under approved policy, block setup rather than weakening protections. Main-branch protections remain unchanged.

### 7.3 Crash and split-brain behavior

Persist a reservation before native thread creation and an operation checkpoint before submission. If creation times out or the process crashes before recording the returned ID, keep `creation_unknown`. Reconcile using the exact operation correlation and trusted host records; never retry just because no reply arrived. If native records cannot conclusively locate or exclude creation, require recovery review. Do not generate a new operation ID to bypass uncertainty.

No automatic takeover based on a timer or lease expiry in v1. Loss of connectivity does not prove that an old instance stopped. Stop new managed actions when fresh ownership verification fails. A GitHub claim cannot kill a turn already running, prevent a human from manually opening a lookalike thread, or enforce raw filesystem operations outside the wrapper. Strict lifecycle guarantees cover cooperating, verified adapters; platform-level enforcement and completed stop verification are release gates for stronger claims.

Archived conversation history may remain after retirement; it is not a second active role. Old instances must not be re-adopted automatically. Removing a manifest entry is not permission to delete its conversation or discard its knowledge.

## 8. Distilled knowledge: replace the current view, preserve evidence

Each role has one canonical `current.md` with compact metadata and a bounded narrative. It is a **working checkpoint**, not a transcript, an authorization source, or a second copy of the role contract. Record:

- Role/version/digest, knowledge revision, previous snapshot reference, source code/definition revision, and covered event/assignment watermark.
- Completed work with commit/PR/test evidence; ongoing tasks and their exact next actions; blockers and unresolved questions.
- Relevant decisions and durable lessons with source references; rejected approaches only when useful to avoid repeating a mistake.
- Uncertainty, missing evidence, working-tree/branch state, and changes after the capture boundary that still need reconciliation.

Keep durable architecture decisions in their canonical documents; the snapshot links to them. Validate that unresolved assignment IDs, constraints, and blockers are not silently dropped. Distillation can be lossy: summaries cannot prove completeness, and a role's self-report is not independent verification.

**Publication workflow:** capture a consistent input boundary; draft the successor; validate schema, references, carry-forward coverage, size budget, and current role ownership; review under the approved checkpoint policy; commit the new content; then atomically promote the current pointer/metadata. A failed candidate never deletes the old current snapshot. If a PR merge is required, the old snapshot remains authoritative until the approved merge is verified. When knowledge and registry are separate refs/repos, this is not one atomic transaction: commit knowledge first and conditionally publish its immutable reference; an unpromoted artifact is harmless.

Only the current snapshot is read on ordinary onboarding. Older snapshots stay in Git history, not a growing list of files to inject into every prompt. Replacing current content does **not** erase historical Git data; do not force-push, purge history, or claim storage reclamation. Restore old content as a new revision rather than rewinding the revision counter.

Refresh at explicit checkpoints, before migration, after meaningful assignment milestones, or when the approved size/staleness threshold is reached. The coordinator evaluates the policy during authorized activity; v1 creates no hidden idle schedule. Calendar-based maintenance later requires explicit scheduling approval. Remove temporary candidates only after confirmed publication, within owned scratch paths, never unresolved source evidence. Thresholds in the examples are proposals for review, not fixed product facts.

## 9. Verified onboarding and portable assignments

The coordinator selects immutable definition, code, assignment, and knowledge inputs. It creates or adopts one native role thread and sends an onboarding request with a stable ID and explicit read/report scope. The role returns a structured receipt stating role/version/digest, owned and excluded areas, required reviewers, assignment IDs, sources actually read, knowledge revision/digest, code revision, host/project/thread identity, and missing or conflicting information.

The controller recomputes digests, verifies native identity and project association independently where supported, checks required fields and references, and rechecks that the selected inputs have not been superseded before marking the role ready. A stale receipt triggers an update/re-onboarding of the same instance, not duplication. Blockers remain visible. Definition match, onboarding report, and successful communication are separate readiness dimensions.

An onboarding receipt is evidence of a response to a particular input bundle. It is not proof of understanding, authorization for arbitrary work, or the same as a Messenger delivery acknowledgment. Normal assignments require their own approved scope; bootstrapping is not blanket permission for deployment or spending.

## 10. Codex host and messaging requirements

App Server documents persistent thread creation, resumption, reading, naming, and turn submission [S3]. That is useful API evidence, **not verification that every desktop build exposes app-visible project-thread creation**. Discover installed capabilities and use their actual schemas. Do not assume a specific native tool name is callable because a prior chat mentioned it.

Before lifecycle enablement, test creating/adopting, reading back, reopening, naming, project association, working directory, submission, and stopping/quiescence on the exact installed target. Record OS, Codex build, execution mode/profile, and evidence. Starting a backend-only session or an ephemeral subagent does not satisfy the product requirement. No direct edits to Codex's private databases or wholesale copying of its home directory.

Reuse verified Messenger board/address operations. Existing boards can be reused; new board creation is covered only by enrollment scope. Preserve established receivers, paused controls, and delivery semantics. Each new thread gets a distinct native binding; do not overwrite an old immutable participant binding to make a new instance look like it.

In v1, use same-install native send-and-notify when verified, otherwise explicitly report on-demand receiving. Registration is not subscription, queued delivery is not a wake, and a wake is not onboarding completion. Reuse existing exact-receiver subscriptions when appropriate; do not force the shared service into a new mode or create duplicate routes. The current repo explicitly separates these capabilities and limits the local receiver experiment [S6]. Automatic same-install notification is a separate certification result, not implied by the single-machine topology.

Readiness output includes `thread_verified`, `project_verified`, `onboarded`, `messenger_registered`, `receiving_transport`, `live_receive_verified`, and blockers. It must never collapse all of them to a misleading `connected: true`.

## 11. Stop-and-transfer migration; no overlapping rollout

A destination can inspect configuration and prepare a checkout before transfer, but it cannot activate a second company or create replacement role instances yet. A manually opened destination chat is an unassigned bootstrap inspector until it can claim the coordinator role.

The source coordinator stops dispatch, creates final role checkpoints, verifies publication, drains/interrupts managed turns, suspends relevant receiving triggers, and verifies all old role instances are quiescent and retired. Record transfer evidence and release the whole company. Only then may the destination atomically claim the next company epoch, adopt its coordinator, create the other roles, and onboard from the committed knowledge. Partial migration across active machines is forbidden.

If the source machine is unreachable and stopping cannot be verified, remain blocked. An explicit recovery procedure must establish that the old executor cannot continue; an offline indicator, missing heartbeat, or elapsed time is insufficient. Do not advertise a force-takeover shortcut as maintaining the invariant. Accept downtime rather than split-brain operation.

Same-machine recreation follows the same retire-before-create rule. A definition update normally preserves the thread; recreation is a separate authorized lifecycle transition.

## 12. Enrollment, security, and working-tree discipline

One-time machine setup installs/authenticates the selected local integration. One project enrollment binds exact repository identity, local project, current coordinator, registry target, approved roster and digest, communication mode, knowledge publication rules, and allowed operations. Persist a revocable grant in private state, enforced by the adapter/controller rather than trusting an editable Markdown assertion.

Reruns within that scope need no repeated Paprika enrollment. A new machine needs local trust and a controlled transfer. Roster or privilege expansions and new receiving schedules require new approval. Codex and GitHub authentication, sandboxing, branch protections, and tool approval remain independent. The manifest declares desired configuration; cloning it does not grant authority.

All roles share one machine, not necessarily one writable checkout. Prefer separate worktrees on that same host when supported and still visibly associated with the intended project. Otherwise serialize mutations in the shared working tree and surface overlapping edits; never run competing Git operations blindly. Do not copy secrets or Mac virtual environments into Windows as part of company portability.

## 13. Delivery stages and first implementation gates

**Stage 1 — Portable company:** capability probe; shared packaging boundaries; manifest/contract validation; ownership reservation/recovery; adopt/create/reuse roles; Git-backed knowledge and assignment references; verified onboarding; local communication; controlled stop-and-transfer. No production release until the singleton, app-visibility, and migration tests pass.

**Stage 2 — Coordination:** richer assignment tracking, review handoffs, blockers, and status summaries, still constrained by explicit authority. Avoid duplicating GitHub's issue/PR sources of truth.

**Stage 3 — Assistance:** suggestions, bounded proactive workflows, approved monitoring and resource budgets. Distributed companies are a separate future RFC after cross-install notification and fencing are verified; this proposal does not approve them.

Start with one existing project and a coordinator plus two roles. Demonstrate creation, onboarding, reopening, knowledge refresh, repeat bootstrap with zero duplicates, concurrent bootstrap rejection, and stop-and-transfer between certified hosts. See the detailed [test and review plan](virtual-company/REVIEW.md).

## 14. Questions for reviewers

1. Which native adapter can prove persistent app-visible project threads and stop/quiescence on the target Codex builds? This is the primary feasibility gate.
2. Can the conditional Git-ref protocol, recovery journal, and local serialization deliver the scoped singleton guarantees under crash/partition tests?
3. Should the proposed private registry ref live in a private working repo or a dedicated private state repo for public companies? Keep exactly one authority in either case.
4. Are role-contract extraction, versioning, snapshot retention, and assignment carry-forward sufficiently explicit to avoid silent drift?
5. Can both packages share maintained modules and the same Messenger deployment without duplicate skills, dispatchers, registrations, or changed release behavior?

## Sources and existing boundaries

External documentation was checked on 2026-10-13. It establishes interface building blocks, not end-to-end test results for this proposed product. All schemas, company commands, ownership policies, and module names in this RFC are design proposals.

- [S1: OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins).
- [S2: OpenAI skills and MCP responsibilities](https://developers.openai.com/plugins/build/skills).
- [S3: Codex App Server](https://developers.openai.com/codex/app-server/).
- [S4: Codex AGENTS.md discovery](https://developers.openai.com/codex/guides/agents-md/).
- [S5: GitHub update-reference API](https://docs.github.com/en/rest/git/refs#update-a-reference).
- [S6: Existing client capability boundaries](../CLIENT-CAPABILITIES.md), [receiver workflow](../../skills/paprika-messenger/references/connect.md), and [native delivery](../../skills/paprika-messenger/references/direct.md).
- [Contribution and validation policy](../../CONTRIBUTING.md) and [maintainer/release policy](../MAINTAINING.md).
