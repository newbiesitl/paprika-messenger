# Private Sites deployment and resume

Use the installed Sites building, hosting and MCP skills and native tool schemas for current registration, source synchronization, packaging and publication. Discover actual tools before using them; names in this reference describe the native operations, not permission to invent an unavailable tool. The bundled service version is **0.5.5**. The package version is independent and appears in the plugin manifest.

## Select before creating

Read a user-selected workspace's `.openai/hosting.json` first. Its `project_id` selects the existing Site; use `get_site` on that ID without creating or listing replacements. If no project was selected, inspect a connected Messenger read-only and paginate `list_sites` with owner scope to find the user's existing deployment. Resolve candidate IDs with `get_site(include_mcp_connection: true)`; use returned connection/plugin details to match the installed connection. Owner listings establish ownership; an unrelated title, remembered endpoint or accessible board alone does not select an instance. Do not probe a candidate through private deployment.

Confirm the chosen Site is active and owner-only from its access metadata, including external viewers, groups and other editors. Preserve the audience on existing instances. If ownership/audience cannot be established or several candidates remain, obtain the user's selection or missing access information before dependent writes. A selected shared Site cannot silently become private, and changing sharing does not make this single-owner service a multi-user service.

A working existing instance is reused for connection setup. Do not copy the template over it, rotate secrets, replace its database or upgrade it solely because onboarding ships newer source. Source updates require the user's requested update scope and the existing Sites opening workflow.

## Keep a non-secret checkpoint

Persist setup progress atomically in a user-owned workspace outside the installed plugin, for example `.paprika/setup-state.json`. Exclude it from source archives and commits. Before the first mutation, record the selected account/workspace context, destination and phase; before an account save or Site registration record that a creation attempt is pending. Retain only values needed to resume.

Also retain the verified account setup package's backend plugin ID, actual USER/WORKSPACE scope, plugin URL, release ID and installation status, separately from the Site's provisioned service plugin. Resume an existing saved account package instead of creating another one; a package save with uncertain outcome requires discovery before retrying. A local installation or a deployed Site alone leaves account installation pending. Never include these owner-specific checkpoint values in a reusable archive.

```json
{
  "schema_version": 1,
  "service_version": "0.5.5",
  "source_directory": "/absolute/user-workspace/paprika-service",
  "phase": "source_ready",
  "account_save_pending": false,
  "account_plugin": {
    "plugin_id": null,
    "scope": null,
    "plugin_url": null,
    "release_id": null,
    "installation_status": "pending"
  },
  "registration_pending": false,
  "project_id": null,
  "site_url": null,
  "provisioned_plugin_id": null,
  "commit_sha": null,
  "saved_version_id": null,
  "deployment_id": null,
  "environment_revision": null,
  "verified_clients": []
}
```

Replace example paths and nulls only with actual values. Use phases such as `account_save_pending`, `account_saved`, `account_install_pending`, `source_ready`, `registration_pending`, `registered`, `runtime_configured`, `published`, `connection_pending` and `verified`. An explicitly requested local-only installation may record the account step as skipped with that device scope. Record the account/workspace context only as a non-secret identifier already provided by the host; do not derive an identity from a display name. A verified-client entry identifies the host/client and the read-only check time, without messages or authentication data. Checkpoint claims are hints to revalidate, not authority to use another account or proof a connection is still active.

Never store Git credentials, service tokens, OAuth values, verified-email settings, event keys, callback URLs, signing secrets, message bodies or private histories in this file. Keep credentials in session memory/hidden stdin only. On resume, reconcile the selected manifest, checkpoint and native Site metadata before acting. Recover a missing source credential for the same registered project. Resolve uncertain registration through native owner discovery/metadata before trying creation again; never blindly repeat `create_site`. Resume an existing deployment by its returned ID, and reuse an already saved archive-backed version when the source is unchanged. Source changes invalidate previous build/commit assertions.

## Build and register

Initialize only a new empty user workspace with `scripts/init-service.mjs`. Check its reported service version, then inspect the copied source's `package.json`, lockfile and `.openai/hosting.json`. Run `npm ci`, required tests and build in the destination, never in the installed template. Reuse passing checks when their inputs are unchanged.

The fresh manifest declares `d1: "DB"`, `r2: null` and `capabilities: ["mcp"]` with no Site ID. Do not insert another owner's project ID, physical database identifier, endpoint or credentials. Sites owns the real D1 provisioning and OAuth boundary. The board does not call other workspace apps; omit `enable_plugins` during registration.

Register once with native `create_site`. Immediately merge the exact returned ID into the manifest as `project_id` using the current Sites helper; preserve its other fields. Record that ID before any dependent action. Keep the returned source credential transient. If registration succeeded without a credential, request one for that same project rather than registering again.

## Configure and publish

Obtain the owner's verified account email from the selected Site's owner metadata or ask the user for the account address when metadata does not provide it. Configure `OWNER_EMAIL` and `COORDINATOR_EMAIL` to that owner through Sites runtime settings, marking sensitive identity values as secrets. Set `SITE_ORIGIN` to the exact origin in registration's `expected_url` or authoritative Site metadata. A Git remote is not the Site origin. Optional `OWNER_USER_ID` and `COORDINATOR_USER_ID` bind Site-scoped subjects only when those subjects are known; do not substitute a general account ID.

Do not publish until the required owner settings and exact Site origin are configured. If the origin is unavailable, retrieve the same Site's authoritative metadata or resolve the missing value before deployment. Preserve all unrelated runtime keys and existing secrets. Redacted null secret values mean hidden, not absent; do not replace them merely because reads cannot reveal their plaintext. Runtime-setting updates require deploying a saved version with the new environment revision.

The service is a Cloudflare Worker. Its build creates `dist/server/index.js` and `dist/_worker.js`; deployment includes the generated hosting manifest and append-only `drizzle/` migrations under `dist/.openai/`. Local SQLite development data and its loopback identity adapter are excluded. Use the current Sites source workflow to run any remaining checks/build, push the exact source state, and package the same verified commit. Credentials enter that workflow through hidden stdin, never shell arguments or files. For an existing source update, first open the same Site through the Sites source workflow and retain its opening result.

Publish with the native private operation for the confirmed owner-private Site. Reuse returned version/deployment IDs and inspect nonterminal deployment status until it succeeds or produces a specific blocker. Report a live URL only from a successful native response. Keep project, App/plugin identities, D1 data and audience stable through retries and updates. Do not create an App/plugin wrapper for the Site. Do not create schedules, enable paused maintenance tasks or set event runtime secrets merely because onboarding deploys the board.

## Connect and prove access

Call `get_site(include_mcp_connection: true)` after publication. Use its exact returned `plugin_id` with the supported suggestion/installation UI. That is this user's service plugin, distinct from the portable onboarding package. If the card is unavailable or installation is already present, direct the user to Plugins → Personal → Created by you to connect it. A returned ID or displayed card proves neither installation nor authentication.

Once the connection is confirmed, call `list_boards({})` through that plugin and `list_messages({"board":"main","limit":1})` for a new instance, or read a selected returned board for an existing instance. Both must succeed as actual authenticated data calls. The initialized `main` board may have no messages. Do not create/delete messages or acknowledge receipts for this check. A 401/403 means the supported connection or owner runtime settings need repair; never weaken access, invent trusted identity headers, or route through a development identity adapter.

Record deployment, ChatGPT, Codex and Dot verification separately. Verify only clients whose execution is actually available; retain the exact provisioned plugin identity for connecting the rest. Follow the messaging skill for user-authorized test exchanges and separately opted-in notifications. The complete setup, security and event guides are shipped under `assets/service-template/docs/`; downloading or importing them alone establishes no connection.
