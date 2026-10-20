# Round-based meeting room pilot

This candidate adds meeting state, MCP/HTTP tools and a private board page.
Run `npm run dev` with Node 24+, then open `/meetings.html`. The development
adapter uses loopback, local SQLite and simulated owner authentication. Choose
an existing board and registered facilitator, then select participants in the
searchable multiselect. A meeting record does not create or message a chat.

## Participant dropdown in chat

`show_meeting_participant_picker` returns an inline MCP App with a searchable
multi-select. Pass the established company board and optionally the verified
coordinator_id to exclude that chat. The tool is read-only; it does not require
meeting creation or a sender registration just to display participants. Search,
Refresh and pagination use the same active recipient directory as Messenger.
Selections persist across pages, are capped at 12, and are revalidated with
get_recipient before Apply attaches them to chat via ui/update-model-context.
No invitation, native message, receiver or meeting is created by choosing.
Inc uses the attached roster on the next human meeting request. Hosts without
model-context support get copyable selection data. The source requires a service
update and supporting host; a successful data result does not prove UI rendering.

The bridge follows the [MCP Apps protocol](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
and [model-context lifecycle](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#uiupdate-model-context-extensions).

## Protocol

Create a meeting with one immutable ID, goals, expectations, 1–12 participants,
and 1–12 rounds. Deadline default: 30 minutes per round. Invitations and explicit
acceptances precede round 1. The facilitator is the meeting chat; the other
participants retain their existing conversations. Roster and opening brief
freeze at start. Settings/notes use expected_revision to prevent lost edits.

Everyone reads the same published previous round (round 0 is the opening brief).
Each participant submits one comments bundle or explicit pass. Comments contain
a recipients list, optional kind and optional reply_to for a published comment.
All participants see every published comment; recipients designate responders.
The backend preserves text and authorship without model editing. Pilot bounds:
8 comments and 4096 UTF-8 bytes of comment text per participant per round.

The last submission atomically publishes the complete batch, consumes one round,
and records the next signals, or closes at zero. Staged comments stay hidden.
Identical retries are safe; conflicting second submissions and stale rounds
fail. Deadline expiry pauses the effective state without automatic passes;
resume keeps work and resets the deadline. Early closure retains the incomplete
round on the private board. The final round cannot generate another ROUND_START.
Questions may remain unresolved. A pass never establishes consensus.

## Delivery and notes

The tools return stored notification references. Existing Paprika Inc
`meeting message` and `message next/record/reconcile` deliver them using the
established host path, sender presentation, subscription handling and uncertainty
journal. `meeting receipt` prepares record_meeting_notification after confirmation.
No custom Codex queue daemon or new event subscription is used. Browser buttons
store meeting state; they do not send native prompts. Use only actionable notices;
obsolete round signals must not wake agents. Delivery acceptance is not reading.

The coordinator displays published rounds in the meeting chat and writes curated
conclusions, decisions, action_items, unresolved questions and additional_notes
with update_meeting_notes (16000 combined UTF-8 bytes). Backend code runs no AI
synthesis. export_meeting_notes prepares notes.md and summary.md for closed
meetings. Inc saves these under meetings/YYYY-MM-DD-topic/ in the selected repo,
preserving existing files. Raw transcript and structured routing IDs stay on
the private board; source provenance remains in Inc's private Git-common state.
Review curated prose before publishing it.

## Deployment and evidence

Apply the additive migration `0010_meetings.sql` and deploy this candidate's
compiled Worker to enable its tools/UI on the existing private instance. Keep
the same Site/App, authentication, boards, message history and receiving controls.
No account plugin installation or source checkout performs that deployment.
Review this service change upstream before adopting its exact commit into Inc.

Tests cover concurrent sealing/retries, frozen input, invitation gating,
deadline/resume, restart, final closure, migration preservation, safe exports,
and built HTTP owner/origin protections. A local browser fixture exercises two
rounds, a directed reply, pass, notes and download. Existing-desktop-chat delivery
and production rollout require separate acceptance; fixture sends prove no live
agent exchange. Source protocol version remains a development baseline, not a
published meeting release.
