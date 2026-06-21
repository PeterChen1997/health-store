CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`image_path` text NOT NULL,
	`document_type` text NOT NULL,
	`institution` text,
	`measured_at` text NOT NULL,
	`ocr_markdown` text,
	`ocr_json` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `health_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`note` text,
	`measured_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `insights` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`period` text,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`source_refs` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text,
	`metric_id` text,
	`raw_name` text NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`ref_low` real,
	`ref_high` real,
	`flag` text DEFAULT 'normal' NOT NULL,
	`measured_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`metric_id`) REFERENCES `metric_catalog`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `metric_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`standard_name` text NOT NULL,
	`aliases` text NOT NULL,
	`standard_unit` text NOT NULL,
	`category` text NOT NULL,
	`ref_low` real,
	`ref_high` real,
	`loinc` text,
	`description` text
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`ai_tags` text,
	`ai_summary` text,
	`related_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tag_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`tag_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`color` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `wearable_samples` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`type` text NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`ts` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
