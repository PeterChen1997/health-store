CREATE TABLE `async_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`resource_id` text,
	`input` text NOT NULL,
	`result` text,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`started_at` text,
	`finished_at` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
