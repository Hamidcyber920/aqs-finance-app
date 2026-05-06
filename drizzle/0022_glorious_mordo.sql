CREATE TABLE `system_backups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(300) NOT NULL,
	`s3Key` varchar(500) NOT NULL,
	`s3Url` text NOT NULL,
	`sizeBytes` int NOT NULL DEFAULT 0,
	`tableCount` int NOT NULL DEFAULT 0,
	`recordCount` int NOT NULL DEFAULT 0,
	`triggeredBy` varchar(50) NOT NULL DEFAULT 'scheduled',
	`triggeredByUserId` int,
	`triggeredByName` varchar(200),
	`status` enum('success','failed') NOT NULL DEFAULT 'success',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `system_backups_id` PRIMARY KEY(`id`)
);
