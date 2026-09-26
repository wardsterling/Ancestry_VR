CREATE TABLE `archive_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `archive_sessions_expiry` ON `archive_sessions` (`expires_at`);