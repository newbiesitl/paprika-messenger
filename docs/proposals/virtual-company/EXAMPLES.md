# Illustrative data contracts for Paprika Virtual Company

**Proposal examples only.** These are not accepted Codex config files, existing MCP tools, or an installed plugin. All companies, hosts, roles, assignments, revisions, and addresses below are fictional. Production schema validation and canonicalization are implementation work.

Read the [RFC](../PAPRIKA-VIRTUAL-COMPANY.md) and [acceptance plan](REVIEW.md) first. The existing company role definitions remain on Git; only a small index and explicit lifecycle/knowledge metadata are added.

## 1. Working repository layout

```text
AGENTS.md                           # Points to existing instructions/contracts.
agent.md                            # Existing role definitions; retain this source.
paprika.company.yaml                # Small portable index and desired policies.
docs/company/assignments.yaml       # Logical roles own assignments, not thread IDs.
docs/company/knowledge/
  coordinator/current.md            # One compact current view per role.
  engineer/current.md
  reviewer/current.md
```

Knowledge may instead live in an explicitly configured private GitHub repository when the code is public or the checkpoint includes sensitive information. Host IDs, actual thread IDs, auth grants, native operation checkpoints, and machine paths never belong in a public manifest. Private local paths are not shown here.

## 2. Company manifest

```yaml
schema_version: 1
company:
  id: example-company
  repository: example-owner/example-project
  topology: single_host
  runtime: codex_local
  board: example-company
coordinator:
  role_id: coordinator
  adopt_current_thread: true
roles:
  - id: coordinator
    version: "1.0.0"
    definition: agent.md#coordinator
  - id: engineer
    version: "1.0.0"
    definition: agent.md#engineer
  - id: reviewer
    version: "1.0.0"
    definition: agent.md#reviewer
assignments: docs/company/assignments.yaml
knowledge:
  root: docs/company/knowledge
  current_file: current.md
  refresh_on: [explicit_checkpoint, assignment_milestone, pre_transfer, size_limit]
  max_current_words: 1500
  stale_after_days: 7
  old_versions: git_history
  background_schedule: false
lifecycle:
  max_instances_per_role: 1
  require_app_visible_project_threads: true
  recreate_from_knowledge: true
  takeover: verified_stop_then_claim
  automatic_failover: false
messaging:
  preferred: same_install_native
  unavailable_behavior: report_on_demand
```

The enrollment resolves the repository name to its actual stable repository identity and stores it privately. A fork/name collision is not a match. Missing stable contract sections cause validation failure; an approved whole-file reference is the conservative alternative. Treat IDs as case-sensitive; reject case-only collisions for portability.

`preferred` is not a capability claim. Native transport must be verified. The staleness field asks an active coordinator to check whether refresh is due; it neither creates a timer nor makes a sleeping machine run. The word budget is a proposed default. Overflow must produce a reviewable error or a compact linked supplement, never silently remove unfinished work.

## 3. Role definition in the existing agent.md

```markdown
## reviewer

Role version: 1.0.0
Purpose: Independently review changes against the approved design and tests.
Primary responsibility: Review quality and regression evidence.
Review scope: src/, tests/, and affected public interfaces.
Exclusions: No production deployment, credential changes, or self-approved merges.
Inputs: Assigned pull request, approved contract, design decisions, test results.
Outputs: Review findings with evidence, severity, and resolution criteria.
Decision rights: Recommend changes; escalate acceptance exceptions to coordinator.
Required collaboration: Engineer supplies evidence; coordinator resolves priorities.
Ownership rule: Reviewing a path does not transfer implementation ownership.
Acceptance: Findings cite exact files/commits; uncertainty and untested paths are explicit.
```

A role contract can reference structured ownership maps without copying them into every prompt. Normative definitions must have one canonical source. Any permission-like text is bounded by the owner's enrollment and actual platform policy.

## 4. Assignment register

```yaml
schema_version: 1
revision: 4
assignments:
  - id: TASK-007
    owner_role: engineer
    reviewer_role: reviewer
    state: in_progress
    source_issue: example-owner/example-project#7
    deliverable: Validate configuration inputs and document errors.
    evidence: []
    blocked_by: []
    next_action: Add boundary-value fixtures before implementation.
```

Changing a machine does not change `owner_role`. Validate that owner/reviewer IDs exist, dependencies are well formed, and the contract permits the assignment. Keep the issue/PR as the live work artifact; this file is the portable assignment mapping, not an independent claim that an issue is still open.

## 5. Current distilled role knowledge

The following is a `reviewer/current.md` example. Angle-bracket values must be replaced by computed values before real use.

```markdown
---
schema_version: 1
company_id: example-company
role_id: reviewer
role_version: 1.0.0
contract_digest: "sha256:<computed-contract-digest>"
knowledge_revision: 8
previous_snapshot: "<knowledge-repo>@<prior-commit>:reviewer/current.md"
definition_commit: "<immutable-definition-commit>"
code_commit: "<immutable-code-commit>"
assignment_revision: 4
covered_through: "<captured-event-or-assignment-watermark>"
created_at: "2026-10-13T12:00:00Z"
---

# Current position
TASK-007 is awaiting its first review. Implementation is not yet accepted.

## Verified progress
The input-validation contract is agreed; see its approved decision record.
No completed implementation tests have been verified in this snapshot.

## Decisions and constraints
Review src/ and tests/. Do not deploy or approve a merge on the owner's behalf.
Canonical responsibilities remain in agent.md#reviewer; this is a reminder only.

## Open work and next actions
- TASK-007: inspect submitted boundary-value fixtures at the pinned PR commit.
- Verify that every advertised error case has evidence before acceptance.

## Blockers and uncertainty
No implementation commit was included at the capture boundary.
Recheck live PR state; later updates are outside this snapshot.

## Durable lessons
Keep empty-input and invalid-type cases separate in the test report.

## Provenance
Link exact approved decisions, commits, PRs, and test artifacts here.
```

Compute `knowledge_digest` over the final normalized snapshot bytes and store it in the registry/onboarding bundle, not recursively inside the hashed document. Old current views remain retrievable by commit. A new snapshot must explicitly retain, resolve with evidence, or transfer each previously open assignment/blocker. The coordinator validates that inventory before promotion.

## 6. Private operational registry

One state document on a designated private registry ref is the operational authority. This abbreviated JSON is a shape example, not a real claim or precomputed digest.

```json
{
  "schema_version": 1,
  "company_id": "example-company",
  "repository_identity": "<verified-stable-repository-id>",
  "registry_revision": 12,
  "company_epoch": 3,
  "company_state": "active",
  "owner_host_key": "host-example-a",
  "coordinator_thread_id": "thread-example-coordinator",
  "enrollment_ref": "<private-approved-enrollment-record>",
  "roles": {
    "reviewer": {
      "instance_generation": 2,
      "state": "ready",
      "host_key": "host-example-a",
      "native_thread_id": "thread-example-reviewer",
      "native_project_id": "project-example",
      "messenger_receiver_id": "receiver-example-reviewer-generation-2",
      "role_version": "1.0.0",
      "contract_digest": "sha256:<computed-contract-digest>",
      "knowledge_revision": 8,
      "knowledge_ref": "<knowledge-repo>@<commit>:reviewer/current.md",
      "knowledge_digest": "sha256:<computed-snapshot-digest>",
      "assignment_revision": 4,
      "operation_id": "operation-example-prepare-reviewer",
      "onboarding_receipt_ref": "<private-verified-receipt-reference>"
    }
  }
}
```

The complete registry includes every enrolled role, including the coordinator. The abbreviated example omits other entries only for readability. Pseudonymous host/thread keys above are not credentials. Actual private state still needs access controls, integrity checks, and retention policy.

The ownership key is `(company_id, role_id)`, never `(role_hash, local_path)` or a display title. `registry_revision` does not itself prevent racing writes: publication uses the RFC's single-parent, fast-forward-only protocol against the observed remote head. A rejected candidate must be re-evaluated, not merged with the winning role claim.

## 7. Onboarding request and receipt

Proposed logical request fields:

```yaml
operation_id: operation-example-onboard-reviewer
company_id: example-company
company_epoch: 3
role_id: reviewer
instance_generation: 2
scope: read_and_report_onboarding
expected:
  role_version: "1.0.0"
  contract_digest: "sha256:<computed-contract-digest>"
  definition_commit: "<immutable-definition-commit>"
  code_commit: "<immutable-code-commit>"
  knowledge_revision: 8
  knowledge_digest: "sha256:<computed-snapshot-digest>"
  assignment_revision: 4
required_receipt_fields:
  - observed_native_identity
  - verified_source_references
  - role_and_contract_identifiers
  - ownership_and_exclusions
  - assignment_ids_and_next_actions
  - knowledge_identifiers
  - missing_information_and_conflicts
```

The receipt is correlated with this request and checked against controller-observed identity and actual Git contents. Report missing evidence instead of echoing an expected digest without reading its source. Matching identifiers make verification deterministic, but do not prove reasoning quality. A receipt arriving after an input supersession cannot mark the old bundle current.

## 8. Lifecycle and migration example

```text
unclaimed -> reserved -> creating -> thread_verified -> onboarding -> ready
                         |
                         +-> creation_unknown -> reconcile or recovery review
ready -> paused -> quiescing -> retired
```

Every state except `unclaimed` and verified `retired` occupies the single role slot. Failed or unknown transitions do not free it automatically. Only verified absence/retirement permits a new generation.

```text
Mac company active, epoch 3
  -> freeze dispatch and publish final snapshots
  -> stop/verify every old role and its receiving route
  -> retire all old role instances; release company
  -> Windows claims epoch 4
  -> adopt destination coordinator and recreate other roles
  -> verify new onboarding and communication
```

Before the old company is released, the destination coordinator is only an unassigned inspector. There is no rolling, per-role cross-machine migration in v1 and no time-based force takeover.

## 9. Provisional user workflows

These are proposed skill requests, not existing tool names or commands:

- “Plan this company's setup from the repository.” Read-only validation and capability report.
- “Enroll this project and create the approved roles, using this thread as coordinator.” Bounded initial provisioning.
- “Refresh each role's knowledge checkpoint.” Authorized publication with carry-forward validation.
- “Show company readiness and repair missing setup.” Reconciliation; no duplicate creation or privilege expansion.
- “Prepare this company for transfer.” Snapshot and quiesce; destination activation is a distinct verified step.

No request silently installs hooks, changes unrelated subscriptions, deletes historical chats, or performs an implementation assignment merely because its description is present in a contract.
