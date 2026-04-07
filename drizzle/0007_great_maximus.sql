ALTER TABLE `income_categories` ADD `allowedPeriods` varchar(100);--> statement-breakpoint
ALTER TABLE `income_categories` ADD `requiresSpecification` boolean DEFAULT false NOT NULL;