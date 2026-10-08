# Private account installation package 1.3.6

This complete private setup ZIP defaults to account installation through Plugin Creator, for supported cloud Work, mobile and desktop surfaces signed into the same account. It includes both skills, icons, integrity metadata and service source **0.5.5**. The account installation instructions take precedence over the optional device-only Codex marketplace commands.

Download [paprika-messenger-private-1.3.6.zip](paprika-messenger-private-1.3.6.zip) and verify it against [SHA256SUMS](SHA256SUMS). In Personal account context, ask Plugin Creator to save the complete ZIP as a private account plugin, then open its returned link, install it and run `$setup-paprika`. See [Account installation](../../docs/ACCOUNT-PLUGIN.md) for scope checks and finishing an existing local installation.

The update requires onboarding to distinguish an account-saved package and its installation from local files, Site deployment and each client's authenticated service connection. Account and local packages use the same manifest version **1.3.6**. A Site-generated connection's separate listing version, such as 1.0.0, is not the package or server version. Existing private Sites, databases, message history and receiving choices are preserved. Other devices still need their supported plugin connection verified; mobile readiness is not inferred from desktop tests.

New local Codex and Work Local receivers default to receiving only with on-demand inbox reads, without hooks or schedules. Supported cloud receivers and Dots use verified events by default. Without a selected or registered peer, initialization finishes as receiving only without a peer question or handshake. An explicit Cloud/events choice persists across retries.

The bundled service includes a Bash-free Windows archive recovery using native tar and the installed Sites build validator. It preserves matching build attribution, append-only migrations, the selected Site and the verified pushed source revision. See [Windows packaging](../../docs/WINDOWS-SITES-PACKAGING.md). This extends the incident guide contributed in [PR #5](https://github.com/newbiesitl/paprika-messenger/pull/5).

Build with `node scripts/prepare-account-plugin.mjs`. The archive is reproducible from this release's canonical source. Saving the ZIP to an account, installing it, deploying a Site and connecting the Site's service plugin are separate milestones. This repository release does not publish an OpenAI directory listing or update any existing account plugin automatically. Older archives remain unchanged.
