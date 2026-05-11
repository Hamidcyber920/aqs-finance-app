CREATE TABLE `email_activity_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`emailId` int NOT NULL,
	`userId` int NOT NULL,
	`action` enum('received','read','moved_section','assigned','actioned','archived','replied','forwarded','ocr_processed','ai_summarised') NOT NULL,
	`fromSectionId` int,
	`toSectionId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_activity_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`emailId` int NOT NULL,
	`filename` varchar(255) NOT NULL,
	`mimeType` varchar(100),
	`sizeBytes` int,
	`s3Url` text NOT NULL,
	`s3Key` varchar(500) NOT NULL,
	`ocrText` text,
	`ocrSummary` text,
	`ocrProcessedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_sections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`color` varchar(20) DEFAULT '#6366f1',
	`icon` varchar(50),
	`sortOrder` int NOT NULL DEFAULT 0,
	`isSystem` boolean NOT NULL DEFAULT false,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_sections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inbound_emails` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gmailMessageId` varchar(255),
	`gmailThreadId` varchar(255),
	`fromEmail` varchar(255) NOT NULL,
	`fromName` varchar(255),
	`toEmail` varchar(255),
	`ccEmails` json DEFAULT ('[]'),
	`subject` varchar(500) NOT NULL,
	`bodyText` text,
	`bodyHtml` text,
	`snippet` varchar(500),
	`sectionId` int,
	`priority` enum('urgent','high','normal','low') NOT NULL DEFAULT 'normal',
	`status` enum('unread','read','actioned','archived') NOT NULL DEFAULT 'unread',
	`aiSummary` text,
	`aiKeyPoints` json DEFAULT ('[]'),
	`aiActionRequired` boolean NOT NULL DEFAULT false,
	`aiProcessedAt` timestamp,
	`assignedToUserId` int,
	`assignedAt` timestamp,
	`receivedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inbound_emails_id` PRIMARY KEY(`id`)
);
