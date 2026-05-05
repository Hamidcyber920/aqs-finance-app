ALTER TABLE `loan_applications` ADD `termValue` int;--> statement-breakpoint
ALTER TABLE `loan_applications` ADD `termUnit` varchar(10) DEFAULT 'months';--> statement-breakpoint
ALTER TABLE `loan_applications` ADD `termNotes` text;