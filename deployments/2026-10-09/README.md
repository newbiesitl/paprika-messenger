# Paprika service 0.5.6 native Windows deployment archive

This is the exact native-tar fallback archive built and successfully published on October 9, 2026 JST for the owner's existing Paprika Messenger Site. The owner requested that it be retained in this repository. Verify `SHA256SUMS`; `provenance.json` records the GitHub source, pushed Site source, packager, validation and successful deployment.

The archive contains the Worker, hosting manifest and existing append-only migrations. It contains no runtime credentials, database contents, message history, subscriptions, Git metadata or dependency directory. The Site's historical migration files were preserved rather than replaced by template copies.

This archive is specific to the Site recorded in its hosting manifest. New users must build their own archive through [setup](../../docs/SETUP.md) and [Windows packaging](../../docs/WINDOWS-SITES-PACKAGING.md). The reusable installation kit is a separate release under `releases/`; this tar does not install a plugin or enable receiving notifications.
