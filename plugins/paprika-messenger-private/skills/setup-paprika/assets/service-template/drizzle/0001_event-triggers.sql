CREATE VIEW message_json AS SELECT id,board,receiver_id,topic,
  json_object('id',id,'board',board,'sender_id',sender_id,'sender_label',sender_label,
  'receiver_id',receiver_id,'topic',topic,'body',body,'reply_to_id',reply_to_id,
  'authored_by',authored_by,'created_at',created_at,'updated_at',updated_at,
  'deleted_at',deleted_at,'deleted_by',deleted_by) AS payload FROM messages;
--> statement-breakpoint
CREATE TRIGGER participant_post AFTER INSERT ON participants BEGIN
  INSERT INTO events(board,kind,entity_id,payload) VALUES(NEW.board,'participant_registered',NEW.id,
    json_object('id',NEW.id,'board',NEW.board,'label',NEW.label,'kind',NEW.kind,
    'thread_id',NEW.thread_id,'created_at',NEW.created_at,'registered_by',NEW.registered_by));
END;
--> statement-breakpoint
CREATE TRIGGER message_post AFTER INSERT ON messages BEGIN
  INSERT INTO events(board,kind,entity_id,receiver_id,topic,payload)
    SELECT board,'message_posted',id,receiver_id,topic,payload FROM message_json WHERE id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER message_visibility AFTER UPDATE OF deleted_at ON messages
WHEN NEW.deleted_at IS NOT OLD.deleted_at BEGIN
  INSERT INTO events(board,kind,entity_id,receiver_id,topic,payload)
    SELECT board,CASE WHEN NEW.deleted_at IS NULL THEN 'message_restored' ELSE 'message_deleted' END,
    id,receiver_id,topic,payload FROM message_json WHERE id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER message_ack AFTER INSERT ON acknowledgments BEGIN
  INSERT INTO events(board,kind,entity_id,receiver_id,topic,payload)
    SELECT NEW.board,'message_acknowledged',NEW.message_id,receiver_id,topic,
    json_object('message_id',NEW.message_id,'participant_id',NEW.participant_id,
      'acknowledged_by',NEW.acknowledged_by,'acknowledged_at',NEW.acknowledged_at)
    FROM messages WHERE id=NEW.message_id;
END;
--> statement-breakpoint
CREATE TRIGGER coordination_revision AFTER UPDATE ON coordination BEGIN
  INSERT INTO events(board,kind,entity_id,payload) VALUES(NEW.board,'coordination_updated',NEW.board,
    json_object('board',NEW.board,'queue_reference',NEW.queue_reference,'execution_owner',NEW.execution_owner,
      'launch_status',NEW.launch_status,'reported_clock',NEW.reported_clock,'revision',NEW.revision,
      'last_confirmed_at',NEW.last_confirmed_at,'confirmed_by',NEW.confirmed_by));
END;
