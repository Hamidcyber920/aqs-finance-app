CREATE TABLE `lbmw_correspondence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactName` varchar(200) NOT NULL,
	`contactRole` varchar(200),
	`direction` enum('inbound','outbound') NOT NULL DEFAULT 'inbound',
	`channel` enum('email','letter','phone','meeting','portal') NOT NULL DEFAULT 'email',
	`subject` varchar(500) NOT NULL,
	`summary` text,
	`dateReceived` date NOT NULL,
	`responseDeadline` date,
	`respondedAt` timestamp,
	`status` enum('pending','responded','awaiting_reply','closed') NOT NULL DEFAULT 'pending',
	`priority` enum('critical','high','medium','low') NOT NULL DEFAULT 'medium',
	`fileUrl` text,
	`internalNotes` text,
	`handledByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lbmw_correspondence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `policy_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`policyId` int NOT NULL,
	`version` varchar(20) NOT NULL,
	`changedAt` timestamp NOT NULL DEFAULT (now()),
	`changedByUserId` int NOT NULL,
	`changeSummary` text,
	`fileUrl` text,
	`trusteesApproved` boolean DEFAULT false,
	`approvalDate` date,
	`approvalMinutesRef` varchar(200),
	CONSTRAINT `policy_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `trustees` ADD `appointmentDate` date;--> statement-breakpoint
ALTER TABLE `trustees` ADD `termExpiryDate` date;--> statement-breakpoint
ALTER TABLE `trustees` ADD `declarationsOfInterest` text;--> statement-breakpoint
ALTER TABLE `trustees` ADD `dbs_check_date` date;