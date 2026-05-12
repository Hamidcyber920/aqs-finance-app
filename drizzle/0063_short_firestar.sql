CREATE TABLE `annual_returns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`financialYear` varchar(20) NOT NULL,
	`yearEndDate` date NOT NULL,
	`submissionDeadline` date NOT NULL,
	`submittedAt` timestamp,
	`submittedByUserId` int,
	`status` enum('not_started','in_progress','submitted','overdue') NOT NULL DEFAULT 'not_started',
	`totalIncome` decimal(12,2),
	`totalExpenditure` decimal(12,2),
	`charityCommissionRef` varchar(100),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `annual_returns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `serious_incidents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`incidentDate` date NOT NULL,
	`reportedAt` timestamp NOT NULL DEFAULT (now()),
	`reportedByUserId` int NOT NULL,
	`title` varchar(300) NOT NULL,
	`description` text NOT NULL,
	`category` enum('financial_crime','safeguarding','data_breach','fraud','terrorism','money_laundering','governance','other') NOT NULL,
	`severity` enum('critical','high','medium','low') NOT NULL DEFAULT 'medium',
	`status` enum('draft','reported_to_cc','under_investigation','closed') NOT NULL DEFAULT 'draft',
	`charityCommissionRef` varchar(100),
	`reportedToCC` boolean DEFAULT false,
	`reportedToCCDate` date,
	`actionsTaken` text,
	`outcome` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `serious_incidents_id` PRIMARY KEY(`id`)
);
