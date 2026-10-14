CREATE TABLE `collaboration_policies` (
	`board` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`max_handoff_depth` integer DEFAULT 5 NOT NULL,
	`participant_ids_json` text DEFAULT '[]' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_by` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`board`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "collaboration_enabled" CHECK("collaboration_policies"."enabled" IN (0,1)),
	CONSTRAINT "collaboration_max_depth" CHECK("collaboration_policies"."max_handoff_depth" BETWEEN 1 AND 100),
	CONSTRAINT "collaboration_participants_json" CHECK(json_valid("collaboration_policies"."participant_ids_json"))
);
--> statement-breakpoint
CREATE TABLE `collaboration_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`board` text NOT NULL,
	`initiator_id` text NOT NULL,
	`current_participant_id` text NOT NULL,
	`goal` text NOT NULL,
	`participant_ids_json` text NOT NULL,
	`max_handoff_depth` integer DEFAULT 5 NOT NULL,
	`policy_revision` integer NOT NULL,
	`handoffs_used` integer DEFAULT 0 NOT NULL,
	`last_message_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`started_by` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`board`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`board`,`initiator_id`) REFERENCES `participants`(`board`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`board`,`current_participant_id`) REFERENCES `participants`(`board`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "collaboration_run_depth" CHECK("collaboration_runs"."max_handoff_depth" BETWEEN 1 AND 100 AND "collaboration_runs"."handoffs_used" BETWEEN 0 AND "collaboration_runs"."max_handoff_depth"),
	CONSTRAINT "collaboration_run_status" CHECK("collaboration_runs"."status" IN ('active','stopped')),
	CONSTRAINT "collaboration_run_participants_json" CHECK(json_valid("collaboration_runs"."participant_ids_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collaboration_board_id` ON `collaboration_runs` (`board`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `collaboration_idempotency` ON `collaboration_runs` (`board`,`started_by`,`idempotency_key`);--> statement-breakpoint
ALTER TABLE `messages` ADD `collaboration_id` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `handoff_depth` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `handoff_limit` integer;
--> statement-breakpoint
-- Guard and advance the chain inside the message INSERT. Concurrent senders
-- cannot reserve the same turn, exceed the cap or consume a slot on rollback.
CREATE TRIGGER collaboration_message_guard BEFORE INSERT ON messages
WHEN NEW.collaboration_id IS NOT NULL OR NEW.handoff_depth IS NOT NULL OR NEW.handoff_limit IS NOT NULL BEGIN
  SELECT RAISE(ABORT,'collaboration_blocked') WHERE NOT EXISTS (
    SELECT 1 FROM collaboration_runs r JOIN collaboration_policies p ON p.board=r.board
    WHERE r.id=NEW.collaboration_id AND r.board=NEW.board AND r.status='active' AND p.enabled=1
      AND r.current_participant_id=NEW.sender_id AND r.last_message_id IS NEW.reply_to_id
      AND NEW.sender_id<>NEW.receiver_id AND NEW.idempotency_key IS NOT NULL
      AND NEW.handoff_depth=r.handoffs_used+1
      AND NEW.handoff_limit=MIN(r.max_handoff_depth,p.max_handoff_depth)
      AND NEW.handoff_depth<=NEW.handoff_limit
      AND EXISTS(SELECT 1 FROM json_each(r.participant_ids_json) WHERE value=NEW.sender_id)
      AND EXISTS(SELECT 1 FROM json_each(r.participant_ids_json) WHERE value=NEW.receiver_id)
      AND EXISTS(SELECT 1 FROM json_each(p.participant_ids_json) WHERE value=NEW.sender_id)
      AND EXISTS(SELECT 1 FROM json_each(p.participant_ids_json) WHERE value=NEW.receiver_id)
      AND 2=(SELECT COUNT(*) FROM participants t JOIN recipient_metadata m ON m.board=t.board AND m.participant_id=t.id
        WHERE t.board=NEW.board AND t.id IN (NEW.sender_id,NEW.receiver_id)
          AND t.kind='thread' AND t.thread_id IS NOT NULL AND t.unregistered_at IS NULL AND m.source='codex')
  );
END;
--> statement-breakpoint
CREATE TRIGGER collaboration_message_advance AFTER INSERT ON messages
WHEN NEW.collaboration_id IS NOT NULL BEGIN
  UPDATE collaboration_runs SET handoffs_used=NEW.handoff_depth,current_participant_id=NEW.receiver_id,
    last_message_id=NEW.id,updated_at=NEW.created_at WHERE board=NEW.board AND id=NEW.collaboration_id;
END;
--> statement-breakpoint
-- Preserve ordinary event payloads while adding server-confirmed chain data.
DROP VIEW message_json;
--> statement-breakpoint
CREATE VIEW message_json AS SELECT id,board,receiver_id,topic,
  json_patch(json_object('id',id,'board',board,'sender_id',sender_id,'sender_label',sender_label,
    'receiver_id',receiver_id,'topic',topic,'body',body,'reply_to_id',reply_to_id,
    'authored_by',authored_by,'created_at',created_at,'updated_at',updated_at,
    'deleted_at',deleted_at,'deleted_by',deleted_by),
    CASE WHEN collaboration_id IS NULL THEN '{}' ELSE json_object('collaboration_id',collaboration_id,'handoff_depth',handoff_depth,'handoff_limit',handoff_limit) END) AS payload FROM messages;
