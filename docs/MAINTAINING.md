# Maintainer and release guide

## Ownership and contribution decisions

The repository is maintained by [@newbiesitl](https://github.com/newbiesitl). Anyone may propose a change through a fork and PR. Collaborator access grants write permissions and is only needed for trusted maintainers, not ordinary contributors. The owner decides which contributions and releases are accepted.

[CODEOWNERS](../.github/CODEOWNERS) assigns every path, including its own file, to `@newbiesitl`. Keep that rule and the live GitHub review settings consistent when ownership changes.

## Branch protections and owner exception

Two independent controls apply to `main`:

| Control | Requirements | Owner exception |
| --- | --- | --- |
| Classic branch protection | PR required; `validate` from GitHub Actions; up-to-date branch; resolved review conversations; linear history; no force pushes or deletion | None; these protections apply to administrators |
| Owner review ruleset | One approving code-owner review; dismiss stale approvals after new reviewable changes | Repository administrators may bypass this ruleset when merging through a PR |

In this personal repository, the owner is the administrator. The bypass uses GitHub's administrator role, not an author-specific condition. If the repository moves to an organization or its access model changes, review that bypass list before granting any other account admin access.

GitHub forbids authors from approving their own PRs. To merge an owner-authored PR, self-review the complete diff, record validation, and use the explicit review bypass if GitHub requires it. The exception also allows the owner to merge another contributor's PR; prefer an ordinary approving review for those contributions. CI and the other branch protections still apply to every merge.

The request body for the review ruleset is versioned in [owner-review.json](../.github/rulesets/owner-review.json). It grants PR-only bypass to repository role `5` (administrator). It contains only the review rule; CI and history rules deliberately remain in the separate branch protection so the review bypass cannot waive them.

Merging or editing this JSON file does not apply GitHub settings automatically. Manage the existing rule under **Settings -> Rules -> Rulesets** or through the repository rules API, and verify the live settings after changes. Classic protection is under **Settings -> Branches**. Avoid creating duplicate rulesets.

## Triage and maintenance

Use the issue forms to collect versions and reproducible examples. Use `bug`, `enhancement`, `documentation`, and `question` labels where relevant. Add `good first issue` or `help wanted` only when the scope and acceptance criteria are clear. Link duplicate reports to the existing issue.

Use the [Code of Conduct](../CODE_OF_CONDUCT.md) for moderation and the [security policy](../SECURITY.md) for private vulnerability reports. Review reports and pull requests on a best-effort basis without promising response deadlines.

Dependabot checks npm dependencies and GitHub Actions weekly on Monday at 10:00 Asia/Tokyo, with up to three version-update PRs open per ecosystem. Security updates are separately enabled in GitHub and may arrive sooner. All update PRs need review and the normal `validate` checks. Keep Actions pinned to full commit SHAs and keep workflow permissions limited to `contents: read` unless a reviewed change needs more access. Automatic merging is disabled.

## Prepare a release

1. Select a validated source commit on `main`. Run the commands in [CONTRIBUTING.md](../CONTRIBUTING.md) and check relevant upgrade and packaging behavior.
2. Update the service version in `package.json` and its lockfile when service behavior changes. Update the plugin manifest version for a plugin release, and keep documentation, bundled service metadata, and compatibility manifests consistent.
3. Build the intended package with the existing script: `node scripts/package-plugin.mjs` for the reusable package, or `node scripts/prepare-account-plugin.mjs` for the repository's private per-owner edition. Preserve each deployment's owner, Site, App, and plugin identity.
   Regenerate the complete GitHub package with `node scripts/prepare-github-plugin.mjs` and commit `plugins/paprika-messenger-private/`. Run the same command with `--check` to confirm that every generated file matches the source. Keep the versioned marketplace and package in sync for source and dependency updates; see [GitHub installation](GITHUB-INSTALL.md).
4. Inspect the package for credentials, private Site identity, databases, conversation data, checkpoints, and generated dependencies. Keep the experimental receiving pilot outside the installed plugin. Verify the archive's SHA-256 and record the source commit and included versions.
   Keep private account installation as the default in the README, package and setup skill. Saving an account package, installing it, deploying a Site and verifying each client's connection are separate milestones. Select and verify personal versus workspace scope; local CLI installation is an explicit optional choice. Use [Account installation](ACCOUNT-PLUGIN.md) to finish or update an account package without replacing its existing private Site.
5. Add a new version directory under `releases/` with its README and commit the tested source. Run `node scripts/release.mjs build` from that clean commit to build matching plugin, reusable service and compiled Worker ZIP/tar.gz pairs. The script checks each extracted archive and refuses to overwrite existing assets. Commit the six archives, `artifacts.json` source provenance and `SHA256SUMS`. Run `node scripts/release.mjs verify` to verify all historical checksums and current archive parity; Windows and macOS CI run these checks. Publish release notes covering user-visible changes, compatibility, migrations, and known limitations.
6. Merge the release preparation through the normal PR process. Tag the validated commit and publish its release assets as a separate owner-authorized release action. Keep previously released archives and checksums immutable.

Merging source does not deploy a Site or publish an installed plugin. Those actions require their own release decision and validation. Documentation and repository-governance changes alone do not require rebuilding or replacing a released plugin archive.

The current public archive is an owner-neutral installation kit. Finish the [standalone merge](https://github.com/newbiesitl/paprika-messenger/blob/main/docs/ACCOUNT-PLUGIN.md#build-the-single-package) before saving the final account package. The generated private ZIP combines the required existing App, both skills and the original Paprika logo/composer icon.
