ALTER TABLE `income_records` ADD `bucketCollection` decimal(10,2);--> statement-breakpoint
ALTER TABLE `income_records` ADD `cardPayment` decimal(10,2);--> statement-breakpoint
ALTER TABLE `income_records` ADD `cashWithheld` decimal(10,2);--> statement-breakpoint
ALTER TABLE `income_records` ADD `cashWithheldReason` varchar(300);--> statement-breakpoint
ALTER TABLE `income_records` ADD `totalBanked` decimal(10,2);--> statement-breakpoint
ALTER TABLE `income_records` ADD `totalBankedDate` varchar(50);--> statement-breakpoint
ALTER TABLE `income_records` ADD `signedByManager` varchar(200);--> statement-breakpoint
ALTER TABLE `income_records` ADD `signedByTrustee` varchar(200);--> statement-breakpoint
ALTER TABLE `income_records` ADD `signedAt` timestamp;