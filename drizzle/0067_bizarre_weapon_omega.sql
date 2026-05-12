CREATE TABLE `utility_buildings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`address` varchar(300),
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `utility_buildings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `utility_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`colour` varchar(30) NOT NULL DEFAULT '#6b7280',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `utility_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `lbmw_correspondence` ADD `gmailMessageId` varchar(200);--> statement-breakpoint
ALTER TABLE `lbmw_correspondence` ADD `gmailThreadId` varchar(200);--> statement-breakpoint
ALTER TABLE `lbmw_correspondence` ADD `gmailFrom` varchar(500);--> statement-breakpoint
ALTER TABLE `lbmw_correspondence` ADD `gmailLabel` varchar(200);--> statement-breakpoint
ALTER TABLE `lbmw_correspondence` ADD `aiSummary` text;--> statement-breakpoint
ALTER TABLE `lbmw_correspondence` ADD `actionRequired` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `lbmw_correspondence` ADD `actionTaskId` int;--> statement-breakpoint
ALTER TABLE `lbmw_correspondence` ADD `isInvoice` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `lbmw_correspondence` ADD `invoiceAmount` decimal(10,2);--> statement-breakpoint
ALTER TABLE `lbmw_correspondence` ADD `invoiceLinkedExpenseId` int;--> statement-breakpoint
ALTER TABLE `utility_bills` ADD `autoExpenseLinkedId` int;