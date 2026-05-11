CREATE TABLE `scan_merge_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tableName` varchar(100) NOT NULL,
	`recordId` int NOT NULL,
	`snapshotJson` text NOT NULL,
	`mergedByUserId` int,
	`mergedByName` varchar(200),
	`mergedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scan_merge_snapshots_id` PRIMARY KEY(`id`)
);
