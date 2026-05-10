CREATE TABLE `succession_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventType` enum('delegate_assigned','delegate_removed','inactivity_alert','succession_triggered','manual_succession','owner_resumed') NOT NULL,
	`triggeredByUserId` int,
	`delegateUserId` int,
	`delegateTrusteeId` int,
	`notes` text,
	`notifiedTrusteesJson` text,
	`triggeredAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `succession_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `isOwnerDelegate` boolean DEFAULT false NOT NULL;