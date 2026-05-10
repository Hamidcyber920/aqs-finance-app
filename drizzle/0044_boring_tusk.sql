ALTER TABLE `gift_aid_declarations` ADD `donorTitle` varchar(20);--> statement-breakpoint
ALTER TABLE `gift_aid_declarations` ADD `donorFirstName` varchar(100);--> statement-breakpoint
ALTER TABLE `gift_aid_declarations` ADD `donorSurname` varchar(100);--> statement-breakpoint
ALTER TABLE `gift_aid_declarations` ADD `donorHouseNumber` varchar(100);--> statement-breakpoint
ALTER TABLE `gift_aid_declarations` ADD `donorPostcode` varchar(20);--> statement-breakpoint
ALTER TABLE `gift_aid_declarations` ADD `uniqueReferenceNumber` varchar(255);--> statement-breakpoint
ALTER TABLE `gift_aid_declarations` ADD `donorIpAddress` varchar(45);--> statement-breakpoint
ALTER TABLE `gift_aid_declarations` ADD `consentTimestamp` timestamp;--> statement-breakpoint
ALTER TABLE `gift_aid_declarations` ADD `consentStatement` text;