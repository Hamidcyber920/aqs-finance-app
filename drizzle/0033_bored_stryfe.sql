ALTER TABLE `comm_messages` ADD `isReplied` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `comm_messages` ADD `repliedAt` timestamp;