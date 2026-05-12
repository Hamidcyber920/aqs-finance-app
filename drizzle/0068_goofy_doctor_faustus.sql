CREATE TABLE `supplier_contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierName` varchar(200) NOT NULL,
	`contactName` varchar(200),
	`role` varchar(100),
	`phone` varchar(50),
	`email` varchar(320),
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplier_contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `receipts` ADD `expenseSource` enum('manual','auto_bill','auto_lbmw_invoice','auto_payroll') DEFAULT 'manual';