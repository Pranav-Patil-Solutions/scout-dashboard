CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text,
	`body` text,
	`occurred_at` integer NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `act_app_idx` ON `activities` (`application_id`);--> statement-breakpoint
CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`company` text NOT NULL,
	`role_title` text NOT NULL,
	`source` text DEFAULT 'scraper' NOT NULL,
	`fit_score` integer,
	`fit_band` text,
	`german_req` text DEFAULT 'unknown' NOT NULL,
	`location` text,
	`work_mode` text,
	`seniority` text,
	`apply_url` text,
	`jd_url` text,
	`status` text DEFAULT 'to_apply' NOT NULL,
	`is_kit_ready` integer DEFAULT false NOT NULL,
	`resume_variant` text,
	`cover_path` text,
	`salary_range` text,
	`applied_at` integer,
	`first_response_at` integer,
	`last_activity_at` integer,
	`next_action` text,
	`next_action_due` integer,
	`closed_reason` text,
	`closed_at` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `app_status_idx` ON `applications` (`status`);--> statement-breakpoint
CREATE INDEX `app_source_idx` ON `applications` (`source`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`name` text,
	`role` text,
	`email` text,
	`linkedin` text,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `scout_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text,
	`title` text,
	`company` text,
	`url` text,
	`score` integer,
	`reason` text,
	`language_flag` text,
	`first_seen` integer,
	`status` text DEFAULT 'new' NOT NULL,
	`promoted_application_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scout_jobs_url_unique` ON `scout_jobs` (`url`);