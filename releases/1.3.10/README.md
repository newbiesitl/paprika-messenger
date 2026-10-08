# Paprika Messenger 1.3.10 installation kit

This complete private account kit includes both skills and service source 0.5.7. Onboarding now verifies installed-package, bundled-source and running-server versions separately, and uses the validated native Windows tar route when the installed Sites packager requires unavailable Bash.

The prepared kit also separates ordinary Chat, Work Local/Cloud, Codex Local/Cloud and optional Dot checks. Full onboarding includes requested Dot receiving setup on the selected board, expired-lease renewal and live wake/read verification. Missing native host capabilities remain explicit pending steps; see [Client capabilities](../../docs/CLIENT-CAPABILITIES.md). This release is prepared for review and has not been published to an installed account plugin.

Service 0.5.7 grants `ttlMs: null` without expiration. Finite requests and the one-hour omitted-lifetime default are preserved. Upgrading does not change existing leases or register missing recipients; the receiving host must re-subscribe and verify its actual grant. Non-expiring subscriptions still honor unsubscribe, pause, owner access and delivery budgets.

The owner-neutral ZIP contains no shared endpoint, App ID, OAuth credential or message database. Follow [account installation](../../docs/ACCOUNT-PLUGIN.md) to bind the owner's verified existing App before saving one private account package. Verify `SHA256SUMS` before extracting.

Updating or reinstalling the plugin does not publish the bundled service. Existing working Sites are reused; requested service upgrades publish the same Site's exact pushed source. Client discovery, authenticated reads and receiving subscriptions are verified separately. Historical release archives remain unchanged.
