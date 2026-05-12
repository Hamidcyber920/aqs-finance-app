CREATE TABLE `bank_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accessToken` text NOT NULL,
	`refreshToken` text NOT NULL,
	`bankName` varchar(200),
	`accountId` varchar(200),
	`accountName` varchar(200),
	`currency` varchar(10) DEFAULT 'GBP',
	`expiresAt` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`lastSyncedAt` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bank_connections_id` PRIMARY KEY(`id`)
);
