ALTER TABLE `participants` ADD `unregistered_at` text;--> statement-breakpoint
ALTER TABLE `participants` ADD `registration_changed_by` text;--> statement-breakpoint
CREATE INDEX `participant_registration` ON `participants` (`board`,`unregistered_at`,`id`);

--> statement-breakpoint
-- Preserve the participant row and foreign-key history; scope changes to its board.
CREATE TRIGGER participant_unregistered AFTER UPDATE OF unregistered_at ON participants
WHEN OLD.unregistered_at IS NULL AND NEW.unregistered_at IS NOT NULL
BEGIN
  INSERT INTO events(board,kind,entity_id,receiver_id,payload)
    VALUES(NEW.board,'participant_unregistered',NEW.id,NEW.id,
      json_object('participant_id',NEW.id,'thread_id',NEW.thread_id,'changed_by',NEW.registration_changed_by,'unregistered_at',NEW.unregistered_at));
  UPDATE event_subscriptions SET paused=1,scanned_sequence=MAX(scanned_sequence,
    (SELECT COALESCE(MAX(sequence),0) FROM events WHERE board=NEW.board))
    WHERE board=NEW.board AND receiver_id=NEW.id AND active=1;
  UPDATE event_deliveries SET state='cancelled',last_error='participant_unregistered',lease_token=NULL,lease_until=0
    WHERE state='pending' AND subscription_id IN
      (SELECT id FROM event_subscriptions WHERE board=NEW.board AND receiver_id=NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER participant_registration_restored AFTER UPDATE OF unregistered_at ON participants
WHEN OLD.unregistered_at IS NOT NULL AND NEW.unregistered_at IS NULL
BEGIN
  INSERT INTO events(board,kind,entity_id,receiver_id,payload)
    VALUES(NEW.board,'participant_registration_restored',NEW.id,NEW.id,
      json_object('participant_id',NEW.id,'changed_by',NEW.registration_changed_by));
END;
--> statement-breakpoint
-- Check routing again at insertion time, including concurrent removal. An existing
-- idempotent post may still be reconciled without creating another message.
CREATE TRIGGER message_requires_active_participants BEFORE INSERT ON messages
WHEN EXISTS(SELECT 1 FROM participants WHERE board=NEW.board AND id IN (NEW.sender_id,NEW.receiver_id) AND unregistered_at IS NOT NULL)
  AND NOT EXISTS(SELECT 1 FROM messages WHERE board=NEW.board AND authored_by=NEW.authored_by
    AND sender_id=NEW.sender_id AND idempotency_key=NEW.idempotency_key)
BEGIN
  SELECT RAISE(ABORT,'participant_unregistered');
END;
--> statement-breakpoint
CREATE TRIGGER subscription_requires_active_receiver BEFORE INSERT ON event_subscriptions
WHEN NEW.active=1 AND EXISTS(SELECT 1 FROM participants WHERE board=NEW.board AND id=NEW.receiver_id AND unregistered_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT,'participant_unregistered');
END;
--> statement-breakpoint
CREATE TRIGGER subscription_cannot_resume_removed_receiver BEFORE UPDATE OF active,paused ON event_subscriptions
WHEN NEW.active=1 AND NEW.paused=0 AND EXISTS(SELECT 1 FROM participants WHERE board=NEW.board AND id=NEW.receiver_id AND unregistered_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT,'participant_unregistered');
END;
