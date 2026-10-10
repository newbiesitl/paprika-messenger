CREATE TABLE `recipient_conversations` (
	`board` text NOT NULL,
	`participant_id` text NOT NULL,
	`registered_thread_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`revision` integer NOT NULL,
	`observed_at` text NOT NULL,
	PRIMARY KEY(`board`, `participant_id`),
	FOREIGN KEY (`board`,`participant_id`) REFERENCES `participants`(`board`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recipient_conversation_revision" CHECK("recipient_conversations"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipient_conversation_address` ON `recipient_conversations` (`board`,`conversation_id`);