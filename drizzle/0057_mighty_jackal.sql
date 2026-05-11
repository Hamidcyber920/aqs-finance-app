CREATE TABLE `bulk_message_approvals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int,
	`requestedById` int NOT NULL,
	`requestedByName` varchar(200),
	`recipientCount` int NOT NULL,
	`messageSubject` varchar(300),
	`messagePreview` text,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewedById` int,
	`reviewedByName` varchar(200),
	`reviewedAt` timestamp,
	`reviewNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bulk_message_approvals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `donor_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`donorId` int NOT NULL,
	`note` text NOT NULL,
	`isPinned` boolean NOT NULL DEFAULT false,
	`createdById` int NOT NULL,
	`createdByName` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `donor_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `donor_pipeline` (
	`id` int AUTO_INCREMENT NOT NULL,
	`donorId` int NOT NULL,
	`donorName` varchar(200),
	`stage` enum('identification','qualification','cultivation','solicitation','stewardship') NOT NULL DEFAULT 'identification',
	`targetAmount` decimal(12,2),
	`campaignId` int,
	`assignedToUserId` int,
	`assignedToName` varchar(200),
	`nextAction` text,
	`nextActionDate` date,
	`notes` text,
	`stageChangedAt` timestamp DEFAULT (now()),
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `donor_pipeline_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `major_donor_due_diligence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`donorId` int,
	`donorName` varchar(200),
	`donationAmount` decimal(12,2) NOT NULL,
	`donationSource` varchar(100),
	`donationRef` varchar(200),
	`isAnonymous` boolean NOT NULL DEFAULT false,
	`sanctionsCheckStatus` enum('pending','clear','flagged','not_required') NOT NULL DEFAULT 'pending',
	`sanctionsCheckNotes` text,
	`sanctionsCheckedAt` timestamp,
	`sanctionsCheckedById` int,
	`trusteeSignOffRequired` boolean NOT NULL DEFAULT true,
	`trusteeSignOffUserId` int,
	`trusteeSignOffAt` timestamp,
	`trusteeSignOffNotes` text,
	`sirRequired` boolean NOT NULL DEFAULT false,
	`sirFiledAt` timestamp,
	`status` enum('open','cleared','escalated','sir_filed') NOT NULL DEFAULT 'open',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `major_donor_due_diligence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pledge_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pledgeId` int NOT NULL,
	`donorId` int NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`paymentDate` date NOT NULL,
	`paymentMethod` enum('cash','card','bacs','cheque','paypal','stripe','other') NOT NULL DEFAULT 'cash',
	`reference` varchar(200),
	`notes` text,
	`recordedById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pledge_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pledges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`donorId` int NOT NULL,
	`donorName` varchar(200),
	`campaignId` int,
	`campaignName` varchar(200),
	`totalAmount` decimal(12,2) NOT NULL,
	`frequency` enum('one_off','monthly','quarterly','annual') NOT NULL DEFAULT 'one_off',
	`paidAmount` decimal(12,2) NOT NULL DEFAULT '0',
	`balanceOwing` decimal(12,2) NOT NULL,
	`status` enum('active','fulfilled','lapsed','cancelled') NOT NULL DEFAULT 'active',
	`nextDueDate` date,
	`startDate` date,
	`endDate` date,
	`isGiftAid` boolean NOT NULL DEFAULT false,
	`notes` text,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pledges_id` PRIMARY KEY(`id`)
);
