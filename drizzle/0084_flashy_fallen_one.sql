ALTER TABLE `facility_enquiries` ADD `foodPreferences` text;--> statement-breakpoint
ALTER TABLE `facility_enquiries` ADD `halalRequired` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `facility_enquiries` ADD `vegetarianRequired` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `facility_enquiries` ADD `veganRequired` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `facility_enquiries` ADD `allergyNotes` text;--> statement-breakpoint
ALTER TABLE `facility_enquiries` ADD `menuChoices` text;--> statement-breakpoint
ALTER TABLE `facility_enquiries` ADD `linenHireRequired` enum('hire','own') DEFAULT 'hire' NOT NULL;--> statement-breakpoint
ALTER TABLE `facility_enquiries` ADD `linenHireNotes` text;--> statement-breakpoint
ALTER TABLE `facility_enquiries` ADD `pdfUrl` text;--> statement-breakpoint
ALTER TABLE `facility_enquiries` ADD `pdfGeneratedAt` timestamp;--> statement-breakpoint
ALTER TABLE `facility_enquiries` ADD `driveFileId` varchar(200);--> statement-breakpoint
ALTER TABLE `facility_enquiries` ADD `driveFileUrl` text;--> statement-breakpoint
ALTER TABLE `facility_enquiries` ADD `driveSyncedAt` timestamp;--> statement-breakpoint
ALTER TABLE `facility_enquiries` ADD `lastReplyAt` timestamp;--> statement-breakpoint
ALTER TABLE `facility_enquiries` ADD `replyCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `facility_enquiries` ADD `commChannelId` int;--> statement-breakpoint
ALTER TABLE `facility_enquiries` ADD `commMessageIds` text;