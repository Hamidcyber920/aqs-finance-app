CREATE TABLE `trustee_decisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(500) NOT NULL,
	`motionText` text,
	`proposer` varchar(200),
	`seconder` varchar(200),
	`votesFor` int NOT NULL DEFAULT 0,
	`votesAgainst` int NOT NULL DEFAULT 0,
	`abstentions` int NOT NULL DEFAULT 0,
	`outcome` varchar(50) NOT NULL DEFAULT 'pending',
	`meetingDate` timestamp,
	`minutesUrl` text,
	`notes` text,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trustee_decisions_id` PRIMARY KEY(`id`)
);
