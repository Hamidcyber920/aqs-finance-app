ALTER TABLE `payroll_records` ADD `chequeIssuedAt` timestamp;--> statement-breakpoint
ALTER TABLE `payroll_records` ADD `bankingStatus` enum('unbanked','banked') DEFAULT 'unbanked';--> statement-breakpoint
ALTER TABLE `payroll_records` ADD `bankedAt` timestamp;--> statement-breakpoint
ALTER TABLE `receipts` ADD `chequeIssuedAt` timestamp;--> statement-breakpoint
ALTER TABLE `receipts` ADD `bankingStatus` enum('unbanked','banked') DEFAULT 'unbanked';--> statement-breakpoint
ALTER TABLE `receipts` ADD `bankedAt` timestamp;