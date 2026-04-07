CREATE TABLE `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`type` enum('email','sms','both') NOT NULL DEFAULT 'email',
	`subject` varchar(300),
	`body` text NOT NULL,
	`targetAudience` enum('all_donors','regular_donors','founding_members','custom') NOT NULL DEFAULT 'all_donors',
	`scheduledAt` timestamp,
	`isRecurring` boolean NOT NULL DEFAULT false,
	`recurringPattern` varchar(100),
	`status` enum('draft','scheduled','sending','sent','failed') NOT NULL DEFAULT 'draft',
	`sentAt` timestamp,
	`sentCount` int DEFAULT 0,
	`failedCount` int DEFAULT 0,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`color` varchar(20) NOT NULL DEFAULT '#1B4332',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `departments_id` PRIMARY KEY(`id`),
	CONSTRAINT `departments_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `donors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`email` varchar(320),
	`phone` varchar(30),
	`address` text,
	`donorboxId` varchar(100),
	`isRegular` boolean NOT NULL DEFAULT false,
	`totalGiven` decimal(12,2) NOT NULL DEFAULT '0',
	`lastGiftDate` date,
	`lastGiftAmount` decimal(10,2),
	`preferredContact` enum('email','phone','both') DEFAULT 'email',
	`notes` text,
	`tags` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `donors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `friday_collections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`collectionDate` date NOT NULL,
	`bucketTotal` decimal(10,2) NOT NULL DEFAULT '0',
	`cardTerminalTotal` decimal(10,2) NOT NULL DEFAULT '0',
	`totalAmount` decimal(10,2) NOT NULL DEFAULT '0',
	`recordedById` int NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `friday_collections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fundraising_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`targetAmount` decimal(12,2) NOT NULL,
	`currentAmount` decimal(12,2) NOT NULL DEFAULT '0',
	`startDate` date,
	`endDate` date,
	`isActive` boolean NOT NULL DEFAULT true,
	`imageUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fundraising_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fundraising_donations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`itemId` int,
	`donorName` varchar(200) NOT NULL,
	`donorEmail` varchar(320),
	`donorPhone` varchar(30),
	`amount` decimal(10,2) NOT NULL,
	`paymentMethod` enum('cash','bank_transfer','card','cheque','online') NOT NULL,
	`evidenceUrl` text,
	`isFounding` boolean NOT NULL DEFAULT false,
	`certificateUrl` text,
	`thankYouSent` boolean NOT NULL DEFAULT false,
	`notes` text,
	`donatedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fundraising_donations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fundraising_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`unitPrice` decimal(10,2) NOT NULL,
	`targetQuantity` int,
	`currentQuantity` int DEFAULT 0,
	`targetAmount` decimal(10,2),
	`currentAmount` decimal(10,2) DEFAULT '0',
	`type` enum('fixed','target') NOT NULL DEFAULT 'target',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fundraising_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `income_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`color` varchar(20) NOT NULL DEFAULT '#C9A84C',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `income_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `income_categories_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `income_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryId` int NOT NULL,
	`categoryName` varchar(100),
	`tenantName` varchar(200) NOT NULL,
	`tenantEmail` varchar(320),
	`tenantPhone` varchar(30),
	`roomNumber` varchar(50),
	`amount` decimal(10,2) NOT NULL,
	`currency` varchar(10) DEFAULT 'GBP',
	`period` enum('weekly','monthly','one_off','annual') NOT NULL DEFAULT 'monthly',
	`periodStart` date,
	`periodEnd` date,
	`paymentStatus` enum('pending','paid','overdue','partial') NOT NULL DEFAULT 'pending',
	`paymentMethod` enum('cash','bank_transfer','card','cheque'),
	`evidenceUrl` text,
	`notes` text,
	`recordedById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `income_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loan_applications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`borrowerName` varchar(200) NOT NULL,
	`borrowerEmail` varchar(320),
	`borrowerPhone` varchar(30),
	`borrowerAddress` text,
	`borrowerNiNumber` varchar(20),
	`amount` decimal(10,2) NOT NULL,
	`purpose` text NOT NULL,
	`termMonths` int NOT NULL,
	`monthlyRepayment` decimal(10,2),
	`startDate` date,
	`endDate` date,
	`status` enum('draft','pending_review','approved','active','completed','defaulted','rejected') NOT NULL DEFAULT 'draft',
	`chairSignatureUrl` text,
	`chairSignedAt` timestamp,
	`chairSignedById` int,
	`trusteeSignatureUrl` text,
	`trusteeSignedAt` timestamp,
	`trusteeSignedById` int,
	`managerSignatureUrl` text,
	`managerSignedAt` timestamp,
	`managerSignedById` int,
	`pdfUrl` text,
	`evidenceUrl` text,
	`totalRepaid` decimal(10,2) DEFAULT '0',
	`lastRepaymentDate` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `loan_applications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loan_repayments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`loanId` int NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`paymentMethod` enum('cash','bank_transfer','cheque') NOT NULL,
	`evidenceUrl` text,
	`recordedById` int NOT NULL,
	`paidAt` timestamp NOT NULL DEFAULT (now()),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `loan_repayments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payroll_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`month` int NOT NULL,
	`year` int NOT NULL,
	`grossPay` decimal(10,2) NOT NULL,
	`incomeTax` decimal(10,2) DEFAULT '0',
	`nationalInsurance` decimal(10,2) DEFAULT '0',
	`pensionContribution` decimal(10,2) DEFAULT '0',
	`otherDeductions` decimal(10,2) DEFAULT '0',
	`totalDeductions` decimal(10,2) DEFAULT '0',
	`netPay` decimal(10,2) NOT NULL,
	`paymentMethod` enum('bank_transfer','cheque','cash') DEFAULT 'bank_transfer',
	`paymentStatus` enum('pending','paid') NOT NULL DEFAULT 'pending',
	`payslipUrl` text,
	`driveFileId` varchar(200),
	`chequeImageUrl` text,
	`chequeNumber` varchar(50),
	`chequeAmount` decimal(10,2),
	`paidAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payroll_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `staff_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`niNumber` varchar(20),
	`taxCode` varchar(20),
	`bankName` varchar(100),
	`bankAccountNumber` varchar(20),
	`bankSortCode` varchar(10),
	`startDate` date,
	`contractType` enum('full_time','part_time','volunteer','contractor') DEFAULT 'full_time',
	`paymentMethod` enum('bank_transfer','cheque','cash') DEFAULT 'bank_transfer',
	`annualSalary` decimal(10,2),
	`hourlyRate` decimal(8,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_profiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `user_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`canViewDashboard` boolean NOT NULL DEFAULT false,
	`canManageExpenses` boolean NOT NULL DEFAULT true,
	`canViewAllExpenses` boolean NOT NULL DEFAULT false,
	`canManageFundraising` boolean NOT NULL DEFAULT false,
	`canManageLoans` boolean NOT NULL DEFAULT false,
	`canSignLoans` boolean NOT NULL DEFAULT false,
	`canManageIncome` boolean NOT NULL DEFAULT false,
	`canManagePayroll` boolean NOT NULL DEFAULT false,
	`canViewOwnPayslip` boolean NOT NULL DEFAULT true,
	`canManageDonors` boolean NOT NULL DEFAULT false,
	`canSendCampaigns` boolean NOT NULL DEFAULT false,
	`canManageStaff` boolean NOT NULL DEFAULT false,
	`canManageUsers` boolean NOT NULL DEFAULT false,
	`canExportReports` boolean NOT NULL DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_permissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `expense_categories` DROP INDEX `expense_categories_name_unique`;--> statement-breakpoint
ALTER TABLE `receipts` MODIFY COLUMN `status` enum('pending','processing','processed','failed','approved','rejected') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('superadmin','trustee','manager','assistant','volunteer','user','admin') NOT NULL DEFAULT 'assistant';--> statement-breakpoint
ALTER TABLE `expense_categories` ADD `departmentId` int;--> statement-breakpoint
ALTER TABLE `receipts` ADD `departmentId` int;--> statement-breakpoint
ALTER TABLE `receipts` ADD `departmentName` varchar(100);--> statement-breakpoint
ALTER TABLE `receipts` ADD `approvedById` int;--> statement-breakpoint
ALTER TABLE `receipts` ADD `approvedAt` timestamp;--> statement-breakpoint
ALTER TABLE `receipts` ADD `isChequePayment` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `receipts` ADD `chequeImageUrl` text;--> statement-breakpoint
ALTER TABLE `receipts` ADD `chequeNumber` varchar(50);--> statement-breakpoint
ALTER TABLE `users` ADD `status` enum('pending','active','suspended') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `approvedById` int;--> statement-breakpoint
ALTER TABLE `users` ADD `approvedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `delegateApproverId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(30);--> statement-breakpoint
ALTER TABLE `users` ADD `jobTitle` varchar(100);--> statement-breakpoint
ALTER TABLE `users` ADD `department` varchar(100);--> statement-breakpoint
ALTER TABLE `users` ADD `avatarUrl` text;