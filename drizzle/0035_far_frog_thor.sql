ALTER TABLE `comm_messages` ADD `scheduledAt` timestamp;--> statement-breakpoint
ALTER TABLE `comm_messages` ADD `sendStatus` enum('pending','sent','failed') DEFAULT 'sent' NOT NULL;--> statement-breakpoint
ALTER TABLE `comm_messages` ADD `replyStatus` enum('awaiting','replied','none') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `comm_templates` ADD `category` varchar(100) DEFAULT 'General' NOT NULL;