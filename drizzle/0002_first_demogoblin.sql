CREATE TABLE `email_events` (
	`id` text PRIMARY KEY NOT NULL,
	`gmail_message_id` text NOT NULL,
	`thread_id` text,
	`sender` text NOT NULL,
	`subject` text,
	`snippet` text,
	`received_at` integer NOT NULL,
	`direction` text DEFAULT 'inbound' NOT NULL,
	`classification` text,
	`matched_application_id` text,
	`processed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_events_gmail_message_id_unique` ON `email_events` (`gmail_message_id`);--> statement-breakpoint
CREATE INDEX `email_thread_idx` ON `email_events` (`thread_id`);--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`application_id` text,
	`payload` text NOT NULL,
	`source_email_event_id` text NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`source_email_event_id`) REFERENCES `email_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `proposal_status_idx` ON `proposals` (`status`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` text PRIMARY KEY NOT NULL,
	`last_cursor` text,
	`last_run_at` integer,
	`stats` text
);
