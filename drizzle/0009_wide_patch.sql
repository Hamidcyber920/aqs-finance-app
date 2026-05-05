CREATE TABLE `reconciliation_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`month` int NOT NULL,
	`year` int NOT NULL,
	`bankBalance` decimal(12,2) NOT NULL DEFAULT '0',
	`status` enum('draft','finalised') NOT NULL DEFAULT 'draft',
	`notes` text,
	`finalisedAt` timestamp,
	`finalisedById` int,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reconciliation_sessions_id` PRIMARY KEY(`id`)
);
