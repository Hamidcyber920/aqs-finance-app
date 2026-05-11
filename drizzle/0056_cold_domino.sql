CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`userName` varchar(200),
	`action` varchar(100) NOT NULL,
	`entity` varchar(100) NOT NULL,
	`entityId` int,
	`meta` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `section_reply_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sectionId` int,
	`title` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `section_reply_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `receipts` ADD `linkedExpenseId` int;--> statement-breakpoint
ALTER TABLE `receipts` ADD `linkedExpenseNote` text;