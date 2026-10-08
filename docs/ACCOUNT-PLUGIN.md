# Account plugin packaging

The current source builds plugin **1.3.5**, including service source **0.5.4**. Run `node scripts/prepare-account-plugin.mjs` to create the account package. It includes the messaging and onboarding skills, a complete service template and integrity metadata. The previously released **1.3.4** archive remains available under `releases/1.3.4`.

For a personal ChatGPT web installation, supply the private ZIP to Plugin Creator, ask it to create a private plugin in your account, install the returned plugin and run setup. Account creation is separate from service deployment. Codex users can install the same complete setup package through the [GitHub marketplace](GITHUB-INSTALL.md); workspace admins can also import that marketplace for their members. A local Codex installation does not automatically install the package into a ChatGPT web account.

Account plugin installation and private service deployment are separate steps. Each owner installs their package and uses the setup skill to discover or deploy their own private service. Connect the exact service plugin provisioned for that deployment. Installing source alone does not deploy a service, authenticate clients or create receiving tasks.

When updating an existing account plugin, reuse its verified identity and scope, inspect its current release and upload a new version through the supported plugin tools. Keep account IDs, installation records, credentials and receiver checkpoints outside Git. See [Setup](SETUP.md), [Local plugin](LOCAL-PLUGIN.md) and [Upgrading](UPGRADING.md).
