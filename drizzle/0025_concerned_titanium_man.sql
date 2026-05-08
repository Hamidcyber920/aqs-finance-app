CREATE TABLE `income_donors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`incomeRecordId` int NOT NULL,
	`donorId` int NOT NULL,
	`amount` decimal(10,2),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `income_donors_id` PRIMARY KEY(`id`)
);
