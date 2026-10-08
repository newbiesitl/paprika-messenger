# Bundled open-source package 1.3.4

This repository edition of the private per-owner plugin is rebuilt from the public source. It includes messaging, onboarding and service source **0.5.4**, with repository links in place of account-specific publisher contact and deployment domains. It differs from the previously installed account archive; the installed plugin and live service are unchanged. The local receiving pilot is not included.

Verify this archive against `SHA256SUMS`. Rebuild with `node scripts/prepare-account-plugin.mjs`. Installing the bundle alone does not deploy or authenticate a service; use its onboarding flow. Repository upload does not publish a new account plugin release or deploy a Site.
