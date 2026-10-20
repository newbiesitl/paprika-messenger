import { strict, id } from './validation.mjs';
import { listRecipients, getRecipient } from './recipient-directory.mjs';

export const meetingPickerUri = 'ui://paprika-messenger/meeting-participants/v1.html';
export const meetingPickerMeta = {
  ui:{resourceUri:meetingPickerUri, visibility:['model', 'app']},
  'openai/outputTemplate':meetingPickerUri, 'openai/widgetAccessible':true,
  'openai/toolInvocation/invoking':'Loading meeting participants…',
  'openai/toolInvocation/invoked':'Choose meeting participants'
};

export async function showMeetingParticipantPicker(service, args) {
  strict(args, ['board', 'coordinator_id', 'query', 'cursor', 'limit']);
  const board = await service.board(id(args.board, 'board'));
  const coordinator = args.coordinator_id === undefined ? null
    : (await getRecipient(service, {board, participant_id:id(args.coordinator_id, 'coordinator_id')})).recipient;
  const page = await listRecipients(service, {board,
    ...Object.fromEntries(['query', 'cursor', 'limit'].filter(key => Object.hasOwn(args, key)).map(key => [key, args[key]]))});
  return {...page, picker_kind:'meeting_participants', coordinator_id:coordinator?.participant_id ?? null,
    coordinator_label:coordinator?.thread_name ?? null, max_participants:12, selection_sends:false,
    recipients:page.recipients.filter(recipient => recipient.participant_id !== coordinator?.participant_id)};
}
