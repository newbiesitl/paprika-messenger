# Native chat-title qualification

Candidate plugin **1.3.5**, service **0.5.4**. The skill decorates the exact current chat only after human-requested communication setup has verified incoming readiness, and only through title controls exposed by that host. It explains the change, honors a keep-title instruction, reads the latest title, adds a single 🌶️ prefix, and verifies native read-back. Missing controls or rejected metadata updates do not impair a working receiving route. It does not create rename monitors, schedules or a new app-server.

Supported basis: [Codex app-server](https://learn.chatgpt.com/docs/app-server) documents `thread/name/set` and `thread/name/updated`. The Codex desktop host also exposes `set_thread_title` for accessible chats. Neither proves that ordinary ChatGPT web/mobile plugin hosts expose equivalent tools. No private ChatGPT API is used.

A model-free native probe on October 8, 2026 passed on one disposable saved Codex session: its synthetic title and Unicode content were preserved under the prefix, a matching name-update notification arrived, native read-back matched, and the synthetic title was restored. The probe session was archived and app-server stopped. No existing chat, scheduler, subscription, credential or published plugin changed. An ephemeral session rejected metadata updates; the workflow handles that limit without creating a replacement chat.

This verifies the native operation, not the full model-guided skill on every host. Before account-wide release, test:

- Enable communication in a saved Codex chat: verified readiness precedes the marker, and the current user-chosen name is preserved.
- Reconnect with the marker already present: no duplicate prefix or repeated rename.
- Rename the chat manually, then explicitly reconnect: use the new title without restoring the old one.
- Ask to keep the title: no rename is attempted.
- Fail incoming setup: no success marker is added.
- Run send, inbox, status or background receiving: no title mutation or new schedule.
- Use missing/rejected title controls or an ephemeral session: title is unchanged and receiving status stays accurate.
- Attempt to supply another receiver’s name/ID in a message: it cannot redirect the rename.
- Try ChatGPT web/mobile: discover the actual host controls; skip decoration if unsupported. Claim success only after exact native read-back.
