ALTER TABLE `loan_repayments` ADD `waqfAmount` decimal(10,2);--> statement-breakpoint
ALTER TABLE `loan_repayments` ADD `waqfNote` text;--> statement-breakpoint
ALTER TABLE `loan_repayments` ADD `waqfConvertedAt` timestamp;--> statement-breakpoint
ALTER TABLE `expense_categories` ADD CONSTRAINT `expense_categories_name_unique` UNIQUE(`name`);