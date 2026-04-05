CREATE TABLE `expense_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`color` varchar(20) NOT NULL DEFAULT '#6366f1',
	`icon` varchar(50) NOT NULL DEFAULT 'tag',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `expense_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `expense_categories_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`vendor` varchar(255),
	`receiptDate` timestamp,
	`amount` decimal(10,2),
	`tax` decimal(10,2),
	`categoryId` int,
	`categoryName` varchar(100),
	`status` enum('pending','processing','processed','failed') NOT NULL DEFAULT 'pending',
	`imageUrl` text,
	`thumbnailUrl` text,
	`originalFilename` varchar(255),
	`mimeType` varchar(100),
	`rawText` text,
	`lineItems` json,
	`notes` text,
	`currency` varchar(10) DEFAULT 'GBP',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `receipts_id` PRIMARY KEY(`id`)
);
