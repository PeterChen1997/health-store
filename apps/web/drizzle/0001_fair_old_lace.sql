ALTER TABLE `documents` ADD `image_md5` text;--> statement-breakpoint
CREATE UNIQUE INDEX `documents_image_md5_unique` ON `documents` (`image_md5`);