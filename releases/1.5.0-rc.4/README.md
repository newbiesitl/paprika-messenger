# Paprika Messenger 1.5.0-rc.4

This release packages the merged PR #28 connection-card guidance with service 0.7.0-rc.4. Explicit connect/initialize/reinitialize/enable-incoming requests show the existing settings card and continue authorized setup without a redundant click. Settings-only requests remain read-only. The connection card HTML is unchanged, and callback-health work is excluded.

The six archives contain the owner-neutral account installation kit, service source and compiled Worker, each in ZIP and tar.gz form. SHA256SUMS and artifacts.json identify the exact contents and source commit. Preserve earlier release archives.

The account kit must be bound to the selected owner's existing App using the documented setup flow. Updating the private account plugin and publishing the matching source to that same private Site are separate operations. Preserve App/OAuth binding, service data, audience and receiving settings. No new migration, task or subscription is created by this release itself. Client context refresh and actual host receiving behavior require separate verification.

Validation: all 180 root tests, 13 receiver regressions and 18 native verification tests pass in the cloud Linux environment on Node.js 24.19.0. Generated package parity and Worker compilation pass. Local ZIP checks use an external compatibility adapter (Python standard-library zipfile for ZIP list/extraction; GNU tar for tar/tar.gz) because GNU tar cannot extract ZIPs. This is not native Linux ZIP validation. The merged PR source also passed Windows/macOS CI before release-only version changes; these exact release commits still require their own CI.
