CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`due_date` text NOT NULL,
	`related_metric_id` text,
	`related_document_id` text,
	`note` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`related_metric_id`) REFERENCES `metric_catalog`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`related_document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null
);
