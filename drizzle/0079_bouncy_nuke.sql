CREATE TABLE `processed_stripe_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stripeEventId` varchar(255) NOT NULL,
	`eventType` varchar(100) NOT NULL,
	`processedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `processed_stripe_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `processed_stripe_events_stripeEventId_unique` UNIQUE(`stripeEventId`)
);
