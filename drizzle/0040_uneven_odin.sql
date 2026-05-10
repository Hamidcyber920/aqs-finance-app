CREATE TABLE `campaign_milestones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`title` varchar(300) NOT NULL,
	`description` text,
	`imageUrl` varchar(500),
	`milestoneDate` date NOT NULL,
	`isPublished` boolean NOT NULL DEFAULT false,
	`notifyDonors` boolean NOT NULL DEFAULT false,
	`notifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaign_milestones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `donor_leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`whatsapp` varchar(30) NOT NULL,
	`email` varchar(320),
	`title` varchar(20),
	`dateOfBirth` date,
	`address` text,
	`postcode` varchar(20),
	`isUkTaxpayer` boolean DEFAULT false,
	`giftAidConsent` boolean DEFAULT false,
	`marketingConsent` boolean DEFAULT false,
	`profileComplete` boolean NOT NULL DEFAULT false,
	`incompleteProfileFlaggedAt` timestamp,
	`welcomeMessageSentAt` timestamp,
	`convertedToDonorId` int,
	`source` enum('quickcapture','stripe','manual','portal') NOT NULL DEFAULT 'quickcapture',
	`campaignId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `donor_leads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `donor_portal_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(128) NOT NULL,
	`donorId` int,
	`donorLeadId` int,
	`email` varchar(320),
	`whatsapp` varchar(30),
	`purpose` enum('profile_complete','donation_history','gift_aid_sign','annual_summary') NOT NULL DEFAULT 'donation_history',
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `donor_portal_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `donor_portal_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `gift_aid_certificates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`donorId` int,
	`donorLeadId` int,
	`donorName` varchar(200) NOT NULL,
	`donorAddress` text NOT NULL,
	`donorPostcode` varchar(20),
	`declarationText` text NOT NULL,
	`signatureMethod` enum('click_to_sign','typed_name','checkbox') NOT NULL DEFAULT 'click_to_sign',
	`signedAt` timestamp,
	`signedIp` varchar(45),
	`coversFrom` date,
	`coversTo` date,
	`isActive` boolean NOT NULL DEFAULT true,
	`revokedAt` timestamp,
	`certificateUrl` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gift_aid_certificates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sadaqah_jariyah_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`donorId` int,
	`donorLeadId` int,
	`campaignId` int NOT NULL,
	`donationId` int,
	`stripeSessionId` int,
	`beneficiaryName` varchar(200) NOT NULL,
	`beneficiaryRelation` varchar(100),
	`beneficiaryNotes` text,
	`impactTitle` varchar(300),
	`impactDescription` text,
	`impactImageUrl` varchar(500),
	`impactDate` date,
	`displayOnDonorWall` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sadaqah_jariyah_entries_id` PRIMARY KEY(`id`)
);
