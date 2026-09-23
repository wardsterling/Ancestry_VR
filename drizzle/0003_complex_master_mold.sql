CREATE TABLE `photo_augments` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`photo_id` text NOT NULL,
	`object_key` text NOT NULL,
	`body` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `photo_augments_owner_photo` ON `photo_augments` (`owner_id`,`photo_id`,`deleted`);