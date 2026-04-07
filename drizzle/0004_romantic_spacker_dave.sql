ALTER TABLE `payroll_records` MODIFY COLUMN `userId` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `payroll_records` ADD `employeeName` varchar(200);