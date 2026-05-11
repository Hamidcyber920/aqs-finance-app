CREATE TABLE `conflicts_of_interest` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trusteeId` int NOT NULL,
	`trusteeName` varchar(200) NOT NULL,
	`description` text NOT NULL,
	`donorId` int,
	`donorName` varchar(200),
	`donationAmount` decimal(12,2),
	`disclosedAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	`resolution` text,
	`status` enum('open','resolved','noted') NOT NULL DEFAULT 'open',
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conflicts_of_interest_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `qr_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int,
	`campaignName` varchar(300),
	`label` varchar(200),
	`targetUrl` text NOT NULL,
	`utmSource` varchar(100),
	`utmMedium` varchar(100),
	`utmCampaign` varchar(200),
	`scanCount` int NOT NULL DEFAULT 0,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `qr_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recognition_tiers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int,
	`name` varchar(200) NOT NULL,
	`minAmount` decimal(12,2) NOT NULL,
	`maxAmount` decimal(12,2),
	`description` text,
	`benefitDescription` text,
	`color` varchar(50) DEFAULT '#4CAF50',
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recognition_tiers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saved_views` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`module` varchar(100) NOT NULL DEFAULT 'donors',
	`filters` json NOT NULL,
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saved_views_id` PRIMARY KEY(`id`)
);
