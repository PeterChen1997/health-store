CREATE TABLE `pipeline_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`document_id` text,
	`stage` text NOT NULL,
	`status` text NOT NULL,
	`mode` text,
	`model` text,
	`input_chars` integer,
	`output_chars` integer,
	`duration_ms` integer,
	`error` text,
	`metadata` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
