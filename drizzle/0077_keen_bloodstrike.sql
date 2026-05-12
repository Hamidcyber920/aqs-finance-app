ALTER TABLE `donors` ADD `firstName` varchar(100);--> statement-breakpoint
ALTER TABLE `donors` ADD `lastName` varchar(100);--> statement-breakpoint
ALTER TABLE `donors` ADD `title` varchar(30);--> statement-breakpoint
ALTER TABLE `donors` ADD `gender` enum('male','female','other','prefer_not_to_say');--> statement-breakpoint
ALTER TABLE `donors` ADD `dob` date;--> statement-breakpoint
ALTER TABLE `donors` ADD `emailVerified` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `donors` ADD `whatsappPhone` varchar(30);--> statement-breakpoint
ALTER TABLE `donors` ADD `addressLine1` varchar(200);--> statement-breakpoint
ALTER TABLE `donors` ADD `addressLine2` varchar(200);--> statement-breakpoint
ALTER TABLE `donors` ADD `city` varchar(100);--> statement-breakpoint
ALTER TABLE `donors` ADD `postcode` varchar(20);--> statement-breakpoint
ALTER TABLE `donors` ADD `country` varchar(100) DEFAULT 'United Kingdom';--> statement-breakpoint
ALTER TABLE `donors` ADD `status` enum('lead','active','lapsed','major','anonymous','deceased','do_not_contact') DEFAULT 'lead';--> statement-breakpoint
ALTER TABLE `donors` ADD `source` enum('friday_collection','website','restaurant','event','referral','scan','manual','import') DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE `donors` ADD `preferredChannel` enum('whatsapp','sms','email','post','none') DEFAULT 'whatsapp';--> statement-breakpoint
ALTER TABLE `donors` ADD `language` enum('en','ur','ar','bn','so','other') DEFAULT 'en';--> statement-breakpoint
ALTER TABLE `donors` ADD `salutationPreference` enum('Brother','Sister','Dr.','Hajji','Sheikh','none') DEFAULT 'none';--> statement-breakpoint
ALTER TABLE `donors` ADD `marketingConsent` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `donors` ADD `consentUpdatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `donors` ADD `donationCount` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `donors` ADD `firstGiftDate` date;--> statement-breakpoint
ALTER TABLE `donors` ADD `averageGift` decimal(10,2);--> statement-breakpoint
ALTER TABLE `donors` ADD `largestGift` decimal(10,2);--> statement-breakpoint
ALTER TABLE `donors` ADD `lapsedAt` timestamp;--> statement-breakpoint
ALTER TABLE `donors` ADD `reactivationCount` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `donors` ADD `giftAidStatus` enum('eligible','ineligible','pending','expired') DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `donors` ADD `firstTouchChannel` varchar(50);--> statement-breakpoint
ALTER TABLE `donors` ADD `firstTouchCampaign` varchar(200);--> statement-breakpoint
ALTER TABLE `donors` ADD `firstTouchUtm` varchar(500);--> statement-breakpoint
ALTER TABLE `donors` ADD `conversionChannel` varchar(50);--> statement-breakpoint
ALTER TABLE `donors` ADD `conversionCampaign` varchar(200);--> statement-breakpoint
ALTER TABLE `donors` ADD `householdId` int;--> statement-breakpoint
ALTER TABLE `donors` ADD `referredByDonorId` int;--> statement-breakpoint
ALTER TABLE `donors` ADD `employer` varchar(200);--> statement-breakpoint
ALTER TABLE `donors` ADD `pinnedNote` text;