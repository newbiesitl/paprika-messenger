# Open-source repository import

The import is a clean source snapshot from Site source commit `da7acf7911cacbd45d56b87630149f99ce5f5b83`, with plugin **1.3.4** and service **0.5.4**. It includes service source, browser UI, MCP tools and events, database schema and migrations, plugin manifests, both skills, onboarding and packaging scripts, documentation, tests, assets and the rebuilt repository-edition bundled ZIP.

The `experiments/local/codex-event-receiver` folder contains the separate unshipped app-server pilot, draft initialization skill, automated tests, sanitized historical evidence and functional test plan. It is not a production receiving bridge.

Credentials, local databases, receiver checkpoints, conversation logs, generated dependencies and prior build directories are excluded. The clean import does not carry private Site Git history. `.openai/hosting.json` contains only generic hosting capabilities; each owner registers their own Site identity. Account-specific installation documentation and recorded pilot session IDs are sanitized for public release. Repository support links replace account-specific publisher contact details and domains. The bundled ZIP is rebuilt from this sanitized source and has its own recorded checksum. The existing Site remote, published plugin and live receiving subscriptions are unchanged.

Validation commands:

```sh
npm ci
npm test
npm run build
node --test experiments/local/codex-event-receiver/receiver.test.mjs experiments/local/codex-event-receiver/session-context.test.mjs
```

Requires Node.js 24 or newer. The real model pilot requires an installed signed-in Codex runtime and is a separate bounded opt-in command documented in its README. Automated pilot tests use fixtures and do not start model turns.

Validated on October 8, 2026: **76 service and packaging tests passed**, **13 automated pilot tests passed**, and the self-contained Worker build succeeded. The repository-edition bundled ZIP has a separately verified SHA-256. The same commands run in the required GitHub `validate` check. No model turn or production event route is needed for CI.
