CREATE TABLE `utility_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`building` varchar(100) NOT NULL,
	`supplier` varchar(150) NOT NULL,
	`accountNumber` varchar(100),
	`category` enum('electricity','gas','water','broadband','telephone','insurance','other') NOT NULL,
	`tariff` varchar(200),
	`contractStartDate` date,
	`contractEndDate` date,
	`mpan` varchar(50),
	`directDebitAmount` decimal(10,2),
	`lastBillDate` date,
	`lastBillAmount` decimal(10,2),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `utility_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `utility_bills` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`billDate` date NOT NULL,
	`periodStart` date,
	`periodEnd` date,
	`amount` decimal(10,2) NOT NULL,
	`consumptionUnits` decimal(10,3),
	`unitType` varchar(20),
	`billUrl` varchar(500),
	`notes` text,
	`uploadedById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `utility_bills_id` PRIMARY KEY(`id`)
);
