CREATE TABLE `photo_matches` (
	`owner_id` text NOT NULL,
	`photo_id` text NOT NULL,
	`scope` text NOT NULL,
	`body` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `photo_id`, `scope`)
);
