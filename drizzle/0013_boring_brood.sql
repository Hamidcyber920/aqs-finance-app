CREATE TABLE `trustees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fullName` varchar(200) NOT NULL,
	`email` varchar(320),
	`phone` varchar(30),
	`role` varchar(100) NOT NULL DEFAULT 'Trustee',
	`isActive` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trustees_id` PRIMARY KEY(`id`)
);
