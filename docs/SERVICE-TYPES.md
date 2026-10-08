# Choose a Paprika Messenger service type

Dot is optional. Accounts without Dot can exchange messages and linked replies between ChatGPT, local Codex and cloud Codex through the same private service.

| Service type | Clients | Setup behavior |
| --- | --- | --- |
| `chatgpt-codex` | ChatGPT, local Codex, cloud Codex | Skip all Dot discovery, registration, connection and verification |
| `dot-chatgpt-codex` | Those clients plus optional Dot agents | Also support explicitly requested Dot connections |

Onboarding selects a type after installation, when the host launches setup or you run `$setup-paprika`. A package installation alone cannot inspect account entitlements. Setup uses a verified Dot availability result when the host exposes one. Missing tools, a plan name or a permission error cannot prove whether your account includes Dot. If availability is unknown, new setup chooses `chatgpt-codex` and reports that detection was unavailable. An explicit choice takes priority.

For example:

```text
$setup-paprika Set up ChatGPT and local/cloud Codex communication.
My account does not have Dot. Reuse my existing private service if present.
```

Setup saves the non-secret `PAPRIKA_SERVICE_TYPE` in the selected Site's runtime settings and keeps its selection source in the setup checkpoint. The authenticated, read-only `get_service_config({})` tool reports the deployed type and supported clients without exposing owner settings or credentials. This is a workflow choice, not account authentication or a client security boundary: participant labels still cannot prove a client's identity.

Existing deployments preserve their selected type. An absent setting retains the legacy `dot-chatgpt-codex` type. A requested change to `chatgpt-codex` uses the same Site, database and service plugin, deploying a version with the new runtime revision. Existing addresses, history and monitoring are preserved. Services older than 0.5.6 need a requested source update to expose the configuration tool; changing the setup package alone does not update an already deployed service.

## Receiving on each client

| Client | Basic communication | Automatic receiving |
| --- | --- | --- |
| Ordinary ChatGPT Chat | Send, read inboxes, reply when authenticated tools are exposed; a declared address does not require native chat metadata | Do not assume Work event support; verify the current chat's actual receiving interface |
| ChatGPT Work Local | Send, read inboxes, reply through the connected service | Default is on-demand inbox reads without a background task |
| ChatGPT Work Cloud | Send, read inboxes, reply through the connected service | Use a verified event task and receiver subscription when this host exposes the supported interface |
| Local Codex | Send, read inboxes, reply through the connected service | Default is on-demand reads without a task; scheduled checks require an explicit choice and a supported host scheduler |
| Cloud Codex | Send, read inboxes, reply through the connected service | Verify actual host event or scheduler support; cloud execution alone does not establish wake capability |
| Optional Dot | Verify the Dot's own service connection and address when selected | Verify its host-owned task, active subscription on the selected board and an actual wake/read |

Verify the authenticated service connection separately in each requested client. No Dot, event secret, subscription or native thread-sending tool is required for basic messaging and inbox reads. Native chat notifications and events are optional capabilities with separate verification. A missing notification route leaves messages stored and available for an on-demand read.

Follow [Client capabilities](CLIENT-CAPABILITIES.md) for full onboarding, per-surface checkpoints, Dot subscription bootstrap/renewal and acceptance checks. A full onboarding request that names Dot receiving includes that step; configuring only the initiating chat is insufficient. Service type selection enables the workflow but does not subscribe the Dot or supply a missing native API.

`connect to <peer>`, `talk` and `ask` follow the selected service type when choosing a registered peer. If `talk` or `ask` has no established recipient, choose one explicitly. `get id`, addressed sends, replies, receipts and disconnect keep their existing behavior.

## Selection helper

The installed setup skill includes `scripts/select-service-type.mjs`. Supply JSON on stdin with optional `requested_service_type`, `existing_service_type` and `dot_available` (`true`, `false` or `null` for unknown). For example, this input selects the type without Dot:

```json
{"requested_service_type":"chatgpt-codex","dot_available":false}
```

The helper returns the selected type, selection source and runtime setting. It performs no entitlement probe, network request, deployment or message send. The onboarding host is responsible for supplying verified availability and configuring the selected private service.
