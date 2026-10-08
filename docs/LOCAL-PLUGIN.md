# Local plugin setup

Use [Private account installation](ACCOUNT-PLUGIN.md) for the default installation across supported cloud, mobile and desktop surfaces. Choose this local workflow only when you explicitly want a copy on one computer for development or device-only use. See [GitHub installation](GITHUB-INSTALL.md) for its optional local marketplace commands.

Run `node scripts/prepare-local-plugin.mjs` to build the local marketplace package from this source. The helper preserves the previous package and existing marketplace policies while verifying the new bundle. Use the supported Codex plugin installation interface to install or update it. Local installation applies to that computer; account installation is a separate workflow described in [Private account installation](ACCOUNT-PLUGIN.md).

The package supplies skills and service source. Run the setup skill to connect your existing private service or deploy a new owner-private instance. Installation alone creates no second messaging database, subscription or schedule.

Try `$paprika-messenger get id`, then `$paprika-messenger connect` in the receiving chat. Verify its exact address and receiving capability before sending to a registered peer. Ordinary local Codex desktop chats do not yet have the experimental app-server wake bridge; see the [pilot](../experiments/local/codex-event-receiver/README.md) for its separate scope. Refresh discovery through supported host controls if the displayed skill metadata remains stale.
