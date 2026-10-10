CREATE TABLE `recipient_activity` (
	`board` text NOT NULL,
	`participant_id` text NOT NULL,
	`activity_sequence` integer NOT NULL,
	`last_communicated_at` text NOT NULL,
	PRIMARY KEY(`board`, `participant_id`),
	FOREIGN KEY (`board`,`participant_id`) REFERENCES `participants`(`board`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- Only durable, newly posted messages affect communication recency. Reads,
-- retries, metadata refreshes, acknowledgments and restores never move a chat.
CREATE TRIGGER recipient_communication AFTER INSERT ON events
WHEN NEW.kind='message_posted' BEGIN
  INSERT INTO recipient_activity(board,participant_id,activity_sequence,last_communicated_at)
    SELECT NEW.board,id,NEW.sequence,NEW.occurred_at FROM participants
    WHERE board=NEW.board AND id IN (json_extract(NEW.payload,'$.sender_id'),json_extract(NEW.payload,'$.receiver_id'))
    ON CONFLICT(board,participant_id) DO UPDATE SET
      activity_sequence=excluded.activity_sequence,last_communicated_at=excluded.last_communicated_at
    WHERE excluded.activity_sequence>recipient_activity.activity_sequence;
END;
--> statement-breakpoint
-- Backfill existing communication without rewriting native thread bindings.
WITH endpoints AS (
  SELECT board,json_extract(payload,'$.sender_id') AS participant_id,sequence FROM events WHERE kind='message_posted'
  UNION ALL SELECT board,json_extract(payload,'$.receiver_id'),sequence FROM events WHERE kind='message_posted'
), latest AS (
  SELECT board,participant_id,MAX(sequence) AS activity_sequence FROM endpoints GROUP BY board,participant_id
)
INSERT INTO recipient_activity(board,participant_id,activity_sequence,last_communicated_at)
  SELECT latest.board,latest.participant_id,latest.activity_sequence,e.occurred_at FROM latest
  JOIN events e ON e.sequence=latest.activity_sequence
  JOIN participants p ON p.board=latest.board AND p.id=latest.participant_id;
--> statement-breakpoint
CREATE INDEX `recipient_recent` ON `recipient_activity` (`board`,`last_communicated_at`,`participant_id`);--> statement-breakpoint
CREATE TABLE `recipient_metadata` (
	`board` text NOT NULL,
	`participant_id` text NOT NULL,
	`title` text,
	`search_name` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'unknown' NOT NULL,
	`execution_mode` text DEFAULT 'unknown' NOT NULL,
	`host_id` text,
	`workspace_name` text,
	`project_status` text DEFAULT 'unknown' NOT NULL,
	`project_id` text,
	`project_name` text,
	`project_observed_at` text,
	`observed_at` text NOT NULL,
	PRIMARY KEY(`board`, `participant_id`),
	FOREIGN KEY (`board`,`participant_id`) REFERENCES `participants`(`board`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recipient_source" CHECK("recipient_metadata"."source" IN ('chatgpt','codex','dot','unknown')),
	CONSTRAINT "recipient_execution_mode" CHECK("recipient_metadata"."execution_mode" IN ('local','cloud','unknown')),
	CONSTRAINT "recipient_project_status" CHECK("recipient_metadata"."project_status" IN ('assigned','unassigned','unknown'))
);
