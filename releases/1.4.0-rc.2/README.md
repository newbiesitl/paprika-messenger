# Paprika Messenger 1.4.0-rc.2

Test candidate with service **0.6.0-rc.2**, built from source commit `786b27d7e5d12c2e13cf6993f84d47bbdaec4ff9`. The previous [1.4.0-rc.1](../1.4.0-rc.1/README.md) candidate and stable [1.3.11](../1.3.11/README.md) artifacts remain unchanged for rollback.

This candidate prefers the current host's built-in recipient question panel when that tool is available. It supplies project → thread labels, full native IDs and environment annotations. Search by literal name/ID, change an existing board, refresh thread details, load more conversations, clear and cancel are menu actions. The board defaults to `main`; metadata reads are bounded to the current page's 50 verified bindings. Refresh preserves its page cursor and any agreed message/key. The embedded MCP App remains available for hosts that render it. A question panel does not imply an inline search box, nested dropdown or persistent composer attachment.

Choosing a recipient first sends nothing. An actual recipient answer for already agreed content completes the missing choice for that one authorized send, preserving the exact message and idempotency key. Control actions, unanswered questions, preselected options and UI rendering authorize no delivery. Recipient verification remains on the selected board before sending.

## Resource-loading correction

A read through the connected native App against deployed service 0.6.0-rc.1 failed host validation with `PerRequestReadResourceResult`: required `ttlMs` and `cacheScope` fields were missing. This candidate returns `ttlMs: 0`, `cacheScope: private` and the completion discriminator for modern MCP discovery/list/read responses. Existing initialize-era clients retain their response shape. Diagnostics log UI linkage, MIME type, HTML size, cache-policy presence and aggregate counts without recipient titles, IDs, searches, message content or credentials.

The observed failure establishes a resource-loading problem; it does not establish every cause of the reported mobile behavior. Native question tools and MCP Apps support depend on the actual client. ChatGPT mobile Cloud selection and embedded rendering still need verification after rollout. Model-hidden tool-result `_meta` is not evidence that the host received no UI metadata.

## Packages, upgrade and rollback

The owner-neutral plugin, service source and compiled Worker are supplied as ZIP and tar.gz. `SHA256SUMS` covers all six archives; `artifacts.json` records source commit, versions, archive hashes and Worker digest. The personalized account overlay stays outside public Git and release assets. Do not replace published files or move the release tag.

Upgrading the existing 0.6.0-rc.1 service requires no new database migration. Preserve its Site, database, audience, owner settings, App/OAuth binding, messages and subscriptions. An older installation requires the existing additive `0004_recipient-directory` migration through its normal Sites workflow. Uploading the plugin package alone does not deploy the running service.

Retain the installed private package and saved Site version. Restore that saved version to roll back the service against the same database, leaving additive tables intact. Account Plugin Creator rejects lower uploaded semantic versions: restoring older plugin code uses a newly versioned rollback package and the actual current release guard. See [upgrade and rollback](../../docs/UPGRADING.md).

## Verification

119 local service, protocol, UI, routing and packaging tests pass. New checks cover native label/ID mapping, project grouping, duplicate names and control-like titles, literal global search, pagination and refresh cursors, bounded metadata reads, frozen agreed content/key, no writes during selection, modern cache fields and legacy response compatibility. All five generated cacheable MCP response types pass the official 2026-07-28 JSON schema. Skill and generated GitHub package validation pass. Live rollout and mobile end-to-end behavior are pending.
