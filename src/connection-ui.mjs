import { strict } from './validation.mjs';
import { EventService, receivingConnectionPolicy } from './events.mjs';

export const connectionWidgetUri = 'ui://paprika-messenger/connection/v1.html';
export const connectionWidgetMeta = {
  ui: { resourceUri: connectionWidgetUri, visibility: ['model', 'app'] },
  'openai/outputTemplate': connectionWidgetUri,
  'openai/widgetAccessible': true,
  'openai/toolInvocation/invoking': 'Checking incoming messages…',
  'openai/toolInvocation/invoked': 'Incoming message settings'
};

// Rendering a card is a read. Only an explicit action in the receiving host
// requests monitoring; the service cannot manufacture that host's callback.
export async function connectionControls(service, events, args) {
  strict(args, ['board', 'receiver_id', 'receiver_thread_id', 'receiver_label']);
  const selectors = ['receiver_id', 'receiver_thread_id', 'receiver_label'];
  const selected = selectors.filter(key => Object.hasOwn(args, key));
  if (selected.length) return (events ?? new EventService(service, {})).setup(args);
  const board = await service.board(args.board);
  return {
    board, receiver_id: null, state: 'receiver_required', notification_ready: false,
    receiving_surfaces: ['ChatGPT Work web', 'ChatGPT Work desktop with Cloud selected', 'Dot'],
    connection_policy: receivingConnectionPolicy,
    next_step: 'Choose Enable incoming messages in the receiving chat. The host verifies this chat’s return address and inbox, reconciles existing tasks and establishes its event receiving route. Require both the exact ready subscription and verified same-chat host event task before confirming success. Check receiving-host execution mode when available and verify actual event-task/callback capability; local execution without a verified event bridge stays pending. Any new heartbeat requires an explicit inbox-check or interval choice.'
  };
}
