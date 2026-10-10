# Paprika Messenger 1.4.0-rc.4

Plugin **1.4.0-rc.4**, service **0.6.0-rc.4**. Cloud conversations can now keep a verified ChatGPT navigation URL separately from their immutable message-routing ID. Recipient links and send confirmations reuse it; ordinary metadata refresh preserves it. Opening uses the client's URL action. Remote-local rendering is deferred.

The source revision and SHA-256 hashes are recorded in `artifacts.json` and `SHA256SUMS`. The ZIP and tar.gz pairs contain the account installation kit, complete reusable service source, and compiled Worker. Packages are owner-neutral; setup reuses or creates the installing user's own private service.

Validation: 130 service/package tests, 13 receiver tests, and 43 tests in the private deployment checkout passed. Migration testing verifies that the added nullable URL column preserves existing messages and routing. A phone Cloud-chat URL pilot opened a normal conversation; the upgraded plugin still needs the user's mobile retest.

Keep the unchanged [1.4.0-rc.3 release](../1.4.0-rc.3/README.md) and saved private Site version for rollback. Restore the old service without reversing the additive migration. To restore old account-plugin contents, use a new higher version rather than overwriting an existing release. See [upgrading](../../docs/UPGRADING.md).
