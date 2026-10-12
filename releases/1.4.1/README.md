# Paprika Messenger 1.4.1

Recipient dropdown requests now open the embedded menu directly, without a preliminary question panel. The menu defaults to `main` or the board already selected in the chat. Search, board selection, pagination, thread-detail refresh and conversation links stay in the menu. A native question panel is available only when explicitly requested.

Plugin 1.4.1 bundles service 0.6.1. Update both the account package and the existing private service: the old preference appeared in the packaged skill and MCP discovery/initialization instructions. Showing the menu does not send a message or require sender registration. No database migration, routing change or receiving schedule is added.

Keep the 1.4.0 release and the previous saved Site version for rollback. Account rollback restores the old files under a new higher semantic version. Existing chats may retain earlier plugin instructions; verify the update in a fresh chat.

The six archives, SHA256SUMS and artifacts.json are generated from a committed source revision by scripts/release.mjs. Host rendering still depends on MCP App support. This patch does not change conversation-link navigation or resolve the separately reported Mac navigation issue.

