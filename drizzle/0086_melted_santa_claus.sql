CREATE TABLE `facility_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`value` text,
	`label` varchar(200),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `facility_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `facility_settings_key_unique` UNIQUE(`key`)
);
