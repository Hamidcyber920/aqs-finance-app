ALTER TABLE `fundraising_donations` ADD `donorLeadId` int;--> statement-breakpoint
ALTER TABLE `fundraising_donations` ADD `giftAidDeclared` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `fundraising_donations` ADD `giftAidAddress` text;--> statement-breakpoint
ALTER TABLE `fundraising_donations` ADD `giftAidSignedAt` timestamp;--> statement-breakpoint
ALTER TABLE `fundraising_donations` ADD `giftAidIpAddress` varchar(45);--> statement-breakpoint
ALTER TABLE `fundraising_donations` ADD `beneficiaryNames` text;--> statement-breakpoint
ALTER TABLE `fundraising_donations` ADD `referenceCode` varchar(50);