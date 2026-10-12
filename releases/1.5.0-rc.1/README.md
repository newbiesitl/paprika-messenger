# Paprika Messenger 1.5.0-rc.1

Test plugin **1.5.0-rc.1**, service **0.7.0-rc.1**. Registered threads have a **Remove from board** action in the recipient dropdown and private board. Removal hides them from ordinary recipient lists, name/ID search, suggestions and the active roster on that board. Other boards are unaffected. **Undo removal** and the separate **Removed threads** view restore the original registration.

The thread's native conversation, immutable IDs, cached metadata, links, messages, unread inbox and acknowledgments remain intact. New routed messages and stale recipient selections are rejected while removed. Matching event subscriptions are paused and pending notifications cancelled. Restore does not send a message, resume receiving or replay cancelled notifications. Host-owned heartbeat tasks are managed separately in their receiving chat.

Upgrade the same private service and account package. Apply the append-only migrations through `0007_thread-registration.sql`, including the lifecycle and routing triggers. Deployment leaves all existing registrations active until the user chooses removal. Direct dropdown requests still open the menu without a preliminary question.

The ZIP/tar.gz pairs contain the owner-neutral plugin kit, service source and compiled Worker. `artifacts.json` records their build source commit and Worker digest; `SHA256SUMS` records archive hashes. Preserve previous releases and private deployment/account snapshots. Read the [upgrade and rollback guidance](../../docs/UPGRADING.md#150-rc1-remove-and-restore-board-threads) before reverting a service after cleanup has been used. Saving artifacts does not install an account package, deploy a Site, merge source or publish a GitHub release.

Validation passed all 160 root tests and 13 receiver regressions, Worker compilation and generated-package checks. Synthetic browser fixtures verified hiding, restoration, Undo, selected-recipient clearing, retained history and board isolation. Desktop and phone-width layouts were inspected. Versioned archives are checked for ZIP/tar.gz parity and matching hashes. Mobile and desktop inline rendering remain separate client checks.
