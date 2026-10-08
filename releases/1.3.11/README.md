# Paprika Messenger 1.3.11

This installation kit contains the messaging and setup skills and service source **0.5.8**. New receiving connections use **main** unless another board was selected or already established. Supported event subscriptions now default to **no expiration**: omitted or null `ttlMs` returns `refreshBefore: null`. Explicit finite lifetimes remain supported. Pause, unsubscribe, callback verification, access revocation and delivery budgets still apply.

## Downloads

| Package | Windows ZIP | macOS / Unix tar.gz |
| --- | --- | --- |
| Complete private account installation kit | [Plugin ZIP](paprika-messenger-private-1.3.11.zip) | [Plugin tar.gz](paprika-messenger-private-1.3.11.tar.gz) |
| Reusable service source, migrations and tests | [Service ZIP](paprika-messenger-service-0.5.8.zip) | [Service tar.gz](paprika-messenger-service-0.5.8.tar.gz) |
| Compiled service Worker | [Worker ZIP](paprika-messenger-worker-0.5.8.zip) | [Worker tar.gz](paprika-messenger-worker-0.5.8.tar.gz) |

Both formats contain the same files for each package and can be used on either operating system. The compiled Worker is a JavaScript server module, with its UI and messaging skill embedded; it requires the configured Sites/Cloudflare runtime and is not a desktop executable. Node.js 24 or later is required to build or test the service source. [artifacts.json](artifacts.json) records the exact source commit, included versions and hashes. [SHA256SUMS](SHA256SUMS) covers all six archives.

## Install or upgrade

On macOS, verify the downloaded files with `shasum -a 256 -c SHA256SUMS`, then extract the kit with `tar -xzf paprika-messenger-private-1.3.11.tar.gz`. On Windows, compare `Get-FileHash -Algorithm SHA256 <archive>` with the matching checksum, then use `Expand-Archive` or Explorer to extract the ZIP. Download all six archives before checking the complete checksum file.

Follow [private account installation](../../docs/ACCOUNT-PLUGIN.md) to bind the kit to the owner's verified existing App and save the resulting private package through Plugin Creator. These reusable downloads contain no owner's endpoint, App ID, credentials or message database. Account installation remains the default; the [GitHub installation guide](../../docs/GITHUB-INSTALL.md) also describes an explicitly requested local installation.

An installed package does not deploy the bundled server. Upgrade the existing private Site through its supported deployment flow to use service 0.5.8. Existing finite or expired subscriptions are preserved until their receiving host re-subscribes. For ongoing receiving, request a non-expiring grant, verify the exact conversation and `main` receiver, and confirm both `ready` and `refresh_before: null`. Recover older messages through the durable inbox. Existing project-board bindings remain unchanged unless the user requests a move.

The repository release does not install an account plugin or create a receiving task for the user. See [client verification](../../docs/CLIENT-CAPABILITIES.md) for the live wake, fetch and display checks. Historical release archives and deployment snapshots remain unchanged.
