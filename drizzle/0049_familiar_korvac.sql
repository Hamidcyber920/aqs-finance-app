CREATE TABLE `compliance_actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(500) NOT NULL,
	`source` varchar(200),
	`owner` varchar(200),
	`dueDate` timestamp,
	`status` varchar(50) NOT NULL DEFAULT 'open',
	`priority` varchar(20) NOT NULL DEFAULT 'medium',
	`evidenceUrl` text,
	`notes` text,
	`completedAt` timestamp,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `compliance_actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `policy_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(500) NOT NULL,
	`category` varchar(100),
	`owner` varchar(200),
	`version` varchar(50),
	`reviewDate` timestamp,
	`approvedAt` timestamp,
	`approvedBy` varchar(200),
	`fileUrl` text,
	`status` varchar(50) NOT NULL DEFAULT 'current',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `policy_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `training_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`userName` varchar(200),
	`module` varchar(300) NOT NULL,
	`provider` varchar(200),
	`completedAt` timestamp,
	`expiresAt` timestamp,
	`certificateUrl` text,
	`status` varchar(50) NOT NULL DEFAULT 'pending',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `training_records_id` PRIMARY KEY(`id`)
);
