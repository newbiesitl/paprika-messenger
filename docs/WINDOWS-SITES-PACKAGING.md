# Windows Sites packaging troubleshooting

Paprika's GitHub setup package can install successfully on Windows while a later Sites deployment fails during archive creation. The failure described here was observed on 2026-10-08 with plugin package **1.3.5**, service **0.5.4**, Sites plugin **0.1.75**, Codex CLI **0.162.0-alpha.2**, and Node.js **24.19.0**. It concerns that installed Sites helper; later helper versions may behave differently.

## Check the deployment environment first

Run these checks in the same execution environment that will build and publish the service, before registering a new Site:

```powershell
node --version
foreach ($tool in 'node', 'npm', 'git', 'bash', 'tar') {
    if (Get-Command $tool -ErrorAction SilentlyContinue) {
        Write-Output "$tool available"
    } else {
        Write-Output "$tool missing"
    }
}
```

Node must be version 24 or newer. The repository uses npm and `package-lock.json`; preserve that package manager and lockfile. A bundled Node executable does not guarantee that npm is installed. In the observed environment, npm was also absent and a temporary npm runner was used to complete `npm ci` without changing the dependency inputs. That was a separate prerequisite from the later Bash failure.

For Sites 0.1.75's shell-based packaging path, Bash and its required shell utilities must be available to the Node process. A working `git --version` does not establish that Bash is available: the bundled Git CLI can be supplied separately. Prefer an environment with the required tools or a supported cross-platform Sites packager. Changing Paprika's dependencies cannot resolve a missing shell in the host's packaging workflow.

## Recognize the failure

In Sites 0.1.75, `scripts/site-workflow.mjs` calls `scripts/package-site.mjs`, which starts:

```text
bash <sites-plugin-root>/skills/sites-hosting/scripts/package-site.sh ...
```

When Bash cannot be started, the workflow reports:

```text
Unable to start the Sites workflow command.
Site preparation command failed.
```

The first message is generic and can also describe other process-start failures. Confirm the installed helper's Bash invocation and the missing executable before attributing it to this problem.

In the observed run, all **73 bundled service tests** and the Worker build passed. Source was committed, pushed, and checked against the configured remote branch before archive creation failed. The failure came from the installed OpenAI Sites packaging helper, outside this repository's `scripts/build.mjs` and `scripts/bundle.mjs`. Those successful local checks did not yet establish a published service or an authenticated client connection.

## Resume the same private service

If registration or source upload has already succeeded, retain the setup checkpoint and `.openai/hosting.json` and reuse their exact Site identity. Inspect the existing saved version and deployment state before retrying. Do not create a second Site, change owner-only access, replace the database or provision a different plugin to work around a missing executable.

### Included native archive recovery

The current package **1.3.10** / service **0.5.6** includes `scripts/package.mjs` in the complete service template. This recovery was introduced in package **1.3.6** / service **0.5.5**. It uses native `tar` directly and does not require Bash. It calls the selected installed Sites plugin's `prepare-site-build.cjs`; it does not replace or edit that plugin. Onboarding checks npm, Git and the actual packager prerequisites before dependent Site registration.

Use the normal supported Sites workflow for source preparation, required tests/build and source push. Sites 0.1.75 selects publish mode only when `archivePath` is supplied: omitting it opens source but does not execute `commands` or push changes. Its publish mode checks and pushes source before invoking Bash packaging. If only that confirmed final archive phase fails after successful push, continue the already authorized deployment through native-tar recovery; do not stop setup or repeat unchanged checks/registration. Reopen the **same unchanged pushed checkout** through the native Sites workflow without `archivePath`, retaining its returned `project_id`, `checkout_path` and verified `commit_sha`. Save only that non-secret result to `.paprika/site-source.json`, outside Git; never save the credential/input object. Resolve another source, build or push error before attempting recovery. A future helper with a supported source-only push mode can use that mode; inspect its actual interface rather than assuming this older helper has one.

From that service checkout, call the helper in the current installed setup skill. This also recovers an older checkout whose own packaging script lacks these checks; do not copy a new template over the existing Site:

```text
node "<absolute setup-paprika skill directory>/assets/service-template/scripts/package.mjs" --sites-plugin-root "<absolute installed Sites plugin root>" --source ".paprika/site-source.json"
```

Use the actual installed directories obtained from the setup and Sites skill/tool environment. A checkout already containing the current helper may call its own `scripts/package.mjs` instead. The helper acts on the current service checkout and requires its HEAD and hosting project to match the native opening result. It validates the Worker, rejects conflicting source/build attribution, retains the build's attribution, stages migrations under `dist/.openai/drizzle`, rejects symlinks and private/development output, and verifies the archive entries against the validated files. It creates `artifacts/dot-board.tar.gz` and returns its checksum and the same source revision. It refuses to overwrite an existing archive; retain that archive and supply `--archive "<this checkout>/artifacts/new-name.tar.gz"` when another output is needed.

Pass the returned exact project, commit and archive to the normal native Sites version/private-deployment operation. Reuse an existing matching archive-backed saved version when available, and wait for its real deployment status. Keep the archive unchanged until upload succeeds. The helper creates no Site, version, plugin, subscription, schedule or authentication connection. Another client still needs an authenticated connection check.

A deployment tar contains its selected Site's manifest and is tied to the returned source commit. It is not an owner-neutral installation kit. New users build their own tar through setup; they must not deploy another owner's prebuilt archive. After a source update, record package, bundled-source and running-server versions separately and verify authenticated board/service-type reads. A fresh chat can test updated discovery when the existing chat offers no refresh control; reinstalling a package does not redeploy the Site or renew receiving subscriptions.

One successful recovery used the installed Sites `prepare-site-build.cjs` validator to stage the existing tested Worker, then used Windows `tar.exe` to create the deployment archive. The recovery preserved the shell packager's hosting-manifest and build-attribution handling and included the append-only migrations. The resulting archive contained:

```text
dist/server/index.js
dist/_worker.js
dist/.openai/hosting.json
dist/.openai/drizzle/...
```

The original incident was an agent-assisted recovery; the included helper now applies those checks for Paprika's Worker archive. Package only deployment output; exclude credentials, local SQLite data, Git metadata, dependency directories and setup checkpoints. Keep source credentials transient through the supported Sites workflow.

The same saved-source revision was subsequently published through Sites' private deployment operation and reached `succeeded`. Service-plugin installation and authenticated `list_boards` / `list_messages` verification remain separate steps; publication alone does not prove that a ChatGPT or Codex client is connected.

## Follow-up improvements

Paprika onboarding checks the selected host's package manager and packaging prerequisites before Site registration and retains an actionable diagnostic in its non-secret checkpoint. The installed Sites helper should also report the executable that failed to start and provide a supported Windows archive path for other projects. That underlying helper change belongs to Sites; Paprika's recovery does not patch the installed Sites plugin.

This guide preserves the incident originally documented in [PR #5](https://github.com/newbiesitl/paprika-messenger/pull/5) and adds the tested recovery shipped in the complete current package. Packaging tests verify the fallback's validation, attribution, migrations, source identity and archive boundaries; they do not certify another account's deployment or client connection. See [GitHub installation](https://github.com/newbiesitl/paprika-messenger/blob/main/docs/GITHUB-INSTALL.md), [setup](SETUP.md) and [upgrading](UPGRADING.md) for the normal lifecycle.
