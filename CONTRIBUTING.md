# Contributing to Paprika Messenger

Bug reports, documentation improvements, tests, and focused code changes are welcome. Read the [Code of Conduct](CODE_OF_CONDUCT.md) and use [private reporting](SECURITY.md) for suspected security vulnerabilities.

## Discuss and prepare a change

Search [existing issues](https://github.com/newbiesitl/paprika-messenger/issues) before opening a new one. Use the bug or feature form when appropriate. Discuss substantial changes to permissions, storage, notification behavior, or public interfaces before implementing them.

Fork the repository, create a branch in your fork, and submit a pull request targeting `main`. You do not need collaborator access to contribute. Keep the PR focused, explain the concrete problem and resulting behavior, and link related issues.

## Local validation

Use Node.js 24 or newer. Run the same commands as the required `validate` workflow:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
node --test experiments/local/codex-event-receiver/receiver.test.mjs experiments/local/codex-event-receiver/session-context.test.mjs
```

For local service development, run `npm run dev` and follow the [README](README.md). Include the relevant validation commands and results in your PR. For documentation-only changes, explain which checks apply and verify links and examples; GitHub CI still runs.

Automated receiver tests use fixtures. The separate real-model pilot is opt-in and is not required for contributions or CI. The current local receiving prototype only controls its dedicated app-server-owned session. A fixture pass is not evidence of production readiness or ordinary desktop chat wake-up.

## Review and merge policy

[@newbiesitl](https://github.com/newbiesitl) maintains the project and owns all paths through [CODEOWNERS](.github/CODEOWNERS). Incoming changes require one approving code-owner review. New reviewable commits dismiss stale approvals.

The owner has a PR-only exception to the approval rule and may merge after reviewing the complete diff, including PRs they authored. GitHub does not allow authors to approve their own PRs. This exception also applies to other PRs the owner merges; using it is the owner's explicit merge decision.

Every merge still requires a passing `validate` check from GitHub Actions, an up-to-date branch, and resolved review conversations. Force pushes and deletion of `main` are blocked, including for the owner. Changes use squash merging. Dependency-update PRs receive the same review and validation as other changes and are not automatically merged.

The review exception is configured in a separate ruleset from the required CI and branch protections. See [maintainer guidance](docs/MAINTAINING.md) for the configuration and release process.

## Protect data and compatibility

Keep fixtures separate from live deployment evidence. Never commit owner credentials, databases, callback secrets, message bodies from real conversations, or receiver checkpoints. Use invented participants and messages in examples and redact logs.

Preserve existing deployment identity, boards, message history, and compatibility when upgrading. Production database changes use append-only migrations. Document changed behavior and add focused tests for code changes. Keep readiness claims tied to verified behavior.

## License and releases

Contributions are distributed under the repository's [MIT license](LICENSE). Preserve applicable third-party notices and identify the source and license of new assets.

Plugin publication and Site deployment are separate from merging source. The owner decides when to publish a release; contributors should not update generated release archives unless the PR specifically prepares a release. Released archives and checksums remain tied to their recorded version and source.
