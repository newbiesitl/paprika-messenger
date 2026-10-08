CREATE TABLE `acknowledgments` (
	`board` text NOT NULL,
	`message_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`acknowledged_by` text NOT NULL,
	`acknowledged_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`board`, `message_id`, `participant_id`),
	FOREIGN KEY (`board`,`message_id`) REFERENCES `messages`(`board`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`board`,`participant_id`) REFERENCES `participants`(`board`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `boards` (
	`id` text PRIMARY KEY NOT NULL,
	CONSTRAINT "board_id_length" CHECK(length("boards"."id") BETWEEN 1 AND 64)
);
--> statement-breakpoint
CREATE TABLE `coordination` (
	`board` text PRIMARY KEY NOT NULL,
	`queue_reference` text DEFAULT 'Not agreed' NOT NULL,
	`execution_owner` text DEFAULT 'Unassigned' NOT NULL,
	`launch_status` text DEFAULT 'HOLD' NOT NULL,
	`reported_clock` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`last_confirmed_at` text,
	`confirmed_by` text,
	FOREIGN KEY (`board`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "coordination_status" CHECK("coordination"."launch_status" IN ('HOLD','RELEASE'))
);
--> statement-breakpoint
CREATE TABLE `events` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`board` text NOT NULL,
	`kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`receiver_id` text,
	`topic` text,
	`payload` text NOT NULL,
	`occurred_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`board`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "event_payload_json" CHECK(json_valid("events"."payload"))
);
--> statement-breakpoint
CREATE INDEX `event_feed` ON `events` (`board`,`sequence`);--> statement-breakpoint
CREATE INDEX `event_message` ON `events` (`board`,`entity_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`board` text NOT NULL,
	`sender_id` text NOT NULL,
	`sender_label` text NOT NULL,
	`receiver_id` text NOT NULL,
	`topic` text NOT NULL,
	`body` text NOT NULL,
	`reply_to_id` text,
	`authored_by` text NOT NULL,
	`idempotency_key` text,
	`fingerprint` text NOT NULL,
	`deleted_at` text,
	`deleted_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`board`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`board`,`sender_id`) REFERENCES `participants`(`board`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`board`,`receiver_id`) REFERENCES `participants`(`board`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`board`,`reply_to_id`) REFERENCES `messages`(`board`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "message_sender_label_length" CHECK(length("messages"."sender_label") BETWEEN 1 AND 120),
	CONSTRAINT "message_topic_length" CHECK(length("messages"."topic") BETWEEN 1 AND 120),
	CONSTRAINT "message_body_length" CHECK(length("messages"."body") BETWEEN 1 AND 16000),
	CONSTRAINT "message_idempotency_length" CHECK(length("messages"."idempotency_key") BETWEEN 1 AND 128)
);
--> statement-breakpoint
CREATE INDEX `message_inbox` ON `messages` (`board`,`receiver_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `message_replies` ON `messages` (`board`,`reply_to_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `message_board_id` ON `messages` (`board`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `message_idempotency` ON `messages` (`board`,`authored_by`,`sender_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `participants` (
	`board` text NOT NULL,
	`id` text NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`thread_id` text,
	`registered_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`board`, `id`),
	FOREIGN KEY (`board`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "participant_id_length" CHECK(length("participants"."id") BETWEEN 1 AND 96),
	CONSTRAINT "participant_label_length" CHECK(length("participants"."label") BETWEEN 1 AND 120),
	CONSTRAINT "participant_kind" CHECK("participants"."kind" IN ('human','agent','thread')),
	CONSTRAINT "participant_thread_length" CHECK(length("participants"."thread_id") <= 160)
);
