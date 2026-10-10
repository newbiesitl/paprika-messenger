import { fail, strict, id, text } from './validation.mjs';
import { listRecipients } from './recipient-directory.mjs';

export const recipientWidgetUri='ui://paprika-messenger/recipients/v1.html';
export const recipientWidgetMeta={ui:{resourceUri:recipientWidgetUri,visibility:['model','app']},
  'openai/outputTemplate':recipientWidgetUri,'openai/widgetAccessible':true,
  'openai/toolInvocation/invoking':'Loading registered conversations…','openai/toolInvocation/invoked':'Choose a recipient'};
export async function showRecipientPicker(service,args) {
  strict(args,['board','query','cursor','limit','mode','agreed_message']);
  const mode=args.mode ?? 'choose';
  if(!['choose','send_agreed'].includes(mode))fail(400,'invalid_argument','mode must be choose or send_agreed.');
  let agreed_message=null;
  if(mode==='send_agreed') {
    strict(args.agreed_message,['sender_id','sender_label','topic','body','reply_to_id','idempotency_key']);
    const value=args.agreed_message,board=await service.board(args.board ?? 'main');
    const sender=await service.participant(board,id(value.sender_id,'sender_id'));
    if(value.sender_label!==sender.label)fail(409,'sender_label_conflict','Use the registered sender label for the agreed message.');
    agreed_message={sender_id:sender.id,sender_label:sender.label,topic:text(value.topic,'topic',120),body:text(value.body,'body',16000),
      idempotency_key:text(value.idempotency_key,'idempotency_key',128)};
    if(value.reply_to_id!=null){await service.message(board,id(value.reply_to_id,'reply_to_id'));agreed_message.reply_to_id=value.reply_to_id;}
  } else if(args.agreed_message!==undefined)fail(400,'invalid_argument','An agreed message requires send_agreed mode.');
  const page=await listRecipients(service,{board:args.board ?? 'main',...Object.fromEntries(['query','cursor','limit'].filter(k=>Object.hasOwn(args,k)).map(k=>[k,args[k]]))});
  const boards=await service.list_boards({limit:200});
  return {...page,mode,agreed_message,selection_sends:mode==='send_agreed',board_options:boards.boards,
    boards_has_more:boards.has_more,boards_next_after_id:boards.next_after_id};
}
