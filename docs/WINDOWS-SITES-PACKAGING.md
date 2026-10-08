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

One successful recovery used the installed Sites `prepare-site-build.cjs` validator to stage the existing tested Worker, then used Windows `tar.exe` to create the deployment archive. The recovery preserved the shell packager's hosting-manifest and build-attribution handling and included the append-only migrations. The resulting archive contained:

```text
dist/server/index.js
dist/_worker.js
dist/.openai/hosting.json
dist/.openai/drizzle/...
```

This is a record of an agent-assisted recovery, not a replacement deployment command bundled with Paprika. A Windows fallback must validate the build, preserve matching build attribution, stage migrations, check archive contents and use the exact source revision already pushed to the Site's configured branch. Package only deployment output; exclude credentials, local SQLite data, Git metadata, dependency directories and setup checkpoints. Keep source credentials transient through the supported Sites workflow.

The same saved-source revision was subsequently published through Sites' private deployment operation and reached `succeeded`. Service-plugin installation and authenticated `list_boards` / `list_messages` verification remain separate steps; publication alone does not prove that a ChatGPT or Codex client is connected.

## Follow-up improvements

Paprika onboarding can check the selected host's package manager and packaging prerequisites before Site registration and retain an actionable diagnostic in its non-secret checkpoint. The installed Sites helper should report the executable that failed to start and provide a supported Windows archive path, for example a cross-platform Node packager or a native Windows equivalent with the same validation and metadata rules. That underlying helper change belongs to Sites and should be reported upstream.

This documentation records the dependency and recovery procedure. It does not change the onboarding implementation, replace the installed Sites helper or certify other Windows environments. See [GitHub installation](GITHUB-INSTALL.md), [setup](SETUP.md) and [upgrading](UPGRADING.md) for the normal lifecycle.
