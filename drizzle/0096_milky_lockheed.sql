ALTER TABLE `users` ADD `totpSecret` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `totpEnabled` boolean DEFAULT false NOT NULL;