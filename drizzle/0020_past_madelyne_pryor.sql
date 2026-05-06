ALTER TABLE `friday_collections` ADD `cashWithheld` decimal(10,2);--> statement-breakpoint
ALTER TABLE `friday_collections` ADD `cashWithheldReason` text;--> statement-breakpoint
ALTER TABLE `friday_collections` ADD `cashWithheldRecordedById` int;--> statement-breakpoint
ALTER TABLE `friday_collections` ADD `cashWithheldRecordedAt` timestamp;--> statement-breakpoint
ALTER TABLE `friday_collections` ADD `cashWithheldRecordedByName` varchar(200);--> statement-breakpoint
ALTER TABLE `friday_collections` ADD `cashWithheldConfirmedById` int;--> statement-breakpoint
ALTER TABLE `friday_collections` ADD `cashWithheldConfirmedAt` timestamp;--> statement-breakpoint
ALTER TABLE `friday_collections` ADD `cashWithheldConfirmedByName` varchar(200);