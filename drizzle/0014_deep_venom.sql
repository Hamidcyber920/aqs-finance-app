ALTER TABLE `loan_applications` ADD `adminApprovedById` int;--> statement-breakpoint
ALTER TABLE `loan_applications` ADD `adminApprovedByName` varchar(200);--> statement-breakpoint
ALTER TABLE `loan_applications` ADD `adminApprovedAt` timestamp;--> statement-breakpoint
ALTER TABLE `loan_applications` ADD `trusteeId` int;--> statement-breakpoint
ALTER TABLE `loan_applications` ADD `trusteeName` varchar(200);--> statement-breakpoint
ALTER TABLE `loan_applications` ADD `trusteeApprovedAt` timestamp;--> statement-breakpoint
ALTER TABLE `loan_repayments` ADD `receivedConfirmedAt` timestamp;--> statement-breakpoint
ALTER TABLE `loan_repayments` ADD `receivedConfirmedById` int;--> statement-breakpoint
ALTER TABLE `loan_repayments` ADD `adminApprovedById` int;--> statement-breakpoint
ALTER TABLE `loan_repayments` ADD `adminApprovedByName` varchar(200);--> statement-breakpoint
ALTER TABLE `loan_repayments` ADD `adminApprovedAt` timestamp;--> statement-breakpoint
ALTER TABLE `loan_repayments` ADD `trusteeId` int;--> statement-breakpoint
ALTER TABLE `loan_repayments` ADD `trusteeName` varchar(200);--> statement-breakpoint
ALTER TABLE `loan_repayments` ADD `trusteeApprovedAt` timestamp;--> statement-breakpoint
ALTER TABLE `loan_repayments` ADD `confirmationPdfUrl` text;