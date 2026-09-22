CREATE TABLE `archive_items` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`body` text NOT NULL,
	`object_key` text,
	`content_hash` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
