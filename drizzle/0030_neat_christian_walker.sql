CREATE TABLE `comm_channels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`icon` varchar(50) NOT NULL DEFAULT 'hash',
	`color` varchar(30) NOT NULL DEFAULT '#635BFF',
	`sortOrder` int NOT NULL DEFAULT 0,
	`isEditable` boolean NOT NULL DEFAULT true,
	`memberRoles` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `comm_channels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `comm_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`channelId` int NOT NULL,
	`direction` enum('sent','received') NOT NULL DEFAULT 'sent',
	`fromName` varchar(200),
	`fromEmail` varchar(320),
	`toEmailsJson` text,
	`whatsappNumbersJson` text,
	`subject` varchar(500),
	`body` text,
	`isRead` boolean NOT NULL DEFAULT true,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `comm_messages_id` PRIMARY KEY(`id`)
);
