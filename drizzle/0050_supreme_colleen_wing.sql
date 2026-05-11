ALTER TABLE `receipts` ADD `imageHash` varchar(64);--> statement-breakpoint
ALTER TABLE `receipts` ADD `secondApproverRequired` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `receipts` ADD `secondApprovedById` int;--> statement-breakpoint
ALTER TABLE `receipts` ADD `secondApprovedByName` varchar(200);--> statement-breakpoint
ALTER TABLE `receipts` ADD `secondApprovedAt` timestamp;--> statement-breakpoint
ALTER TABLE `receipts` ADD `fundAllocation` json;