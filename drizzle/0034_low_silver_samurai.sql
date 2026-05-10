CREATE TABLE `comm_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`subject` varchar(500),
	`body` text,
	`priority` varchar(50) DEFAULT 'Normal',
	`replyBy` varchar(100),
	`actionBy` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `comm_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `trustees` ADD `seniorityOrder` int DEFAULT 99 NOT NULL;