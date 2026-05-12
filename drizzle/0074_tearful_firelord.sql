CREATE TABLE `facility_bookings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`bookedByUserId` int,
	`bookerName` varchar(200) NOT NULL,
	`bookerEmail` varchar(320),
	`bookerPhone` varchar(30),
	`organisation` varchar(200),
	`title` varchar(300) NOT NULL,
	`purpose` text,
	`startDatetime` timestamp NOT NULL,
	`endDatetime` timestamp NOT NULL,
	`attendeeCount` int,
	`rateType` enum('hourly','half_day','full_day','custom','free') NOT NULL DEFAULT 'hourly',
	`agreedAmount` decimal(10,2) NOT NULL DEFAULT '0',
	`depositAmount` decimal(10,2) DEFAULT '0',
	`depositPaid` boolean NOT NULL DEFAULT false,
	`status` enum('enquiry','confirmed','cancelled','completed') NOT NULL DEFAULT 'enquiry',
	`cancellationReason` text,
	`paymentStatus` enum('unpaid','partial','paid') NOT NULL DEFAULT 'unpaid',
	`paymentMethod` enum('cash','bank_transfer','card','invoice'),
	`invoiceUrl` text,
	`internalNotes` text,
	`incomeRecordId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `facility_bookings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `facility_rooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`building` varchar(100) NOT NULL DEFAULT 'QLH',
	`capacity` int,
	`description` text,
	`amenities` text,
	`hourlyRate` decimal(8,2),
	`halfDayRate` decimal(8,2),
	`fullDayRate` decimal(8,2),
	`isActive` boolean NOT NULL DEFAULT true,
	`imageUrl` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `facility_rooms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `income_records` ADD `isRestricted` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `income_records` ADD `restrictedPurpose` varchar(255);