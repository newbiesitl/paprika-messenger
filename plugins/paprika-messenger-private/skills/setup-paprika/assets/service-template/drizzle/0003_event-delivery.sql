CREATE TABLE `event_deliveries` (
	`subscription_id` text NOT NULL,
	`event_sequence` integer NOT NULL,
	`event_id` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt` integer NOT NULL,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`http_status` integer,
	`last_error` text,
	`accepted_at` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`subscription_id`, `event_sequence`),
	FOREIGN KEY (`subscription_id`) REFERENCES `event_subscriptions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_sequence`) REFERENCES `events`(`sequence`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "event_delivery_state" CHECK("event_deliveries"."state" IN ('pending','accepted','failed','cancelled'))
);
--> statement-breakpoint
CREATE INDEX `event_delivery_due` ON `event_deliveries` (`state`,`next_attempt`,`lease_until`);--> statement-breakpoint
CREATE TABLE `event_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`board` text NOT NULL,
	`receiver_id` text NOT NULL,
	`owner_subject` text NOT NULL,
	`owner_email` text,
	`event_name` text NOT NULL,
	`arguments_json` text NOT NULL,
	`callback_url` text NOT NULL,
	`secret_box` text NOT NULL,
	`previous_secret_box` text,
	`rotate_until` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`paused` integer DEFAULT 0 NOT NULL,
	`notification_mode` text DEFAULT 'notify_only' NOT NULL,
	`wake_limit` integer DEFAULT 30 NOT NULL,
	`window_start` integer NOT NULL,
	`wake_count` integer DEFAULT 0 NOT NULL,
	`verified_at` integer NOT NULL,
	`scanned_sequence` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`board`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`board`,`receiver_id`) REFERENCES `participants`(`board`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "event_subscription_active" CHECK("event_subscriptions"."active" IN (0,1)),
	CONSTRAINT "event_subscription_paused" CHECK("event_subscriptions"."paused" IN (0,1)),
	CONSTRAINT "event_subscription_mode" CHECK("event_subscriptions"."notification_mode" IN ('notify_only','process_inbox')),
	CONSTRAINT "event_subscription_budget" CHECK("event_subscriptions"."wake_limit" BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE INDEX `event_subscription_owner` ON `event_subscriptions` (`owner_subject`,`board`);