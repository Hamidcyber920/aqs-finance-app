ALTER TABLE `gift_aid_claims` ADD `submittedToHmrc` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `gift_aid_claims` ADD `submittedAt` timestamp;--> statement-breakpoint
ALTER TABLE `trustee_meetings` ADD `quorumRequired` int DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `trustee_meetings` ADD `quorumMet` boolean DEFAULT false NOT NULL;