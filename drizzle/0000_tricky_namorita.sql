CREATE TABLE `photo_research` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`body` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
