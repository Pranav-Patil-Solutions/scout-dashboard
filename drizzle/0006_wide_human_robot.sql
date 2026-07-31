ALTER TABLE `scout_jobs` ADD `fit_grade` text;--> statement-breakpoint
ALTER TABLE `scout_jobs` ADD `fit_assessment` text;--> statement-breakpoint
ALTER TABLE `scout_jobs` ADD `graded_at` integer;--> statement-breakpoint
ALTER TABLE `scout_jobs` ADD `graded_resume_v` text;--> statement-breakpoint
ALTER TABLE `scout_jobs` ADD `graded_facts_v` integer;--> statement-breakpoint
CREATE INDEX `scout_fit_grade_idx` ON `scout_jobs` (`fit_grade`);