CREATE TABLE `volunteer_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`recipientName` varchar(200) NOT NULL,
	`recipientEmail` varchar(320),
	`month` int NOT NULL,
	`year` int NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`description` text,
	`paymentMethod` enum('cash','cheque','bank_transfer') NOT NULL DEFAULT 'cash',
	`paymentStatus` enum('pending','paid','withheld') NOT NULL DEFAULT 'pending',
	`paidAt` timestamp,
	`withheldAt` timestamp,
	`withheldReason` text,
	`chequeNumber` varchar(50),
	`chequeImageUrl` text,
	`invoiceUrl` text,
	`bankingStatus` enum('unbanked','banked') DEFAULT 'unbanked',
	`bankedAt` timestamp,
	`emailSentAt` timestamp,
	`emailSentTo` varchar(320),
	`notes` text,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `volunteer_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `payroll_records` MODIFY COLUMN `paymentStatus` enum('pending','paid','withheld') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `payroll_records` ADD `withheldAt` timestamp;--> statement-breakpoint
ALTER TABLE `payroll_records` ADD `withheldReason` text;--> statement-breakpoint
ALTER TABLE `payroll_records` ADD `emailSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `payroll_records` ADD `emailSentTo` varchar(320);--> statement-breakpoint
ALTER TABLE `payroll_records` ADD `invoiceUrl` text;--> statement-breakpoint
ALTER TABLE `receipts` ADD `paymentHeld` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `receipts` ADD `heldAt` timestamp;--> statement-breakpoint
ALTER TABLE `receipts` ADD `heldReason` text;--> statement-breakpoint
ALTER TABLE `receipts` ADD `paidAt` timestamp;--> statement-breakpoint
ALTER TABLE `receipts` ADD `emailSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `receipts` ADD `emailSentTo` varchar(320);--> statement-breakpoint
ALTER TABLE `receipts` ADD `invoiceUrl` text;