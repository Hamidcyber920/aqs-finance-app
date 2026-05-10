ALTER TABLE `accommodation_rent_payments` ADD `checkedByFaridAt` timestamp;--> statement-breakpoint
ALTER TABLE `accommodation_rent_payments` ADD `checkedByMuminAt` timestamp;--> statement-breakpoint
ALTER TABLE `accommodation_rent_payments` ADD `trusteeVerifiedBy` varchar(200);--> statement-breakpoint
ALTER TABLE `accommodation_rent_payments` ADD `trusteeVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `income_records` ADD `checkedByFaridAt` timestamp;--> statement-breakpoint
ALTER TABLE `income_records` ADD `checkedByMuminAt` timestamp;--> statement-breakpoint
ALTER TABLE `income_records` ADD `trusteeVerifiedBy` varchar(200);--> statement-breakpoint
ALTER TABLE `income_records` ADD `trusteeVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `income_records` ADD `rentalDateFrom` date;--> statement-breakpoint
ALTER TABLE `income_records` ADD `rentalDateTo` date;--> statement-breakpoint
ALTER TABLE `income_records` ADD `evidenceUrl2` text;