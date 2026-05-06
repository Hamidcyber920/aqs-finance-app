ALTER TABLE `loan_applications` ADD `agreementPdfUrl` text;--> statement-breakpoint
ALTER TABLE `loan_applications` ADD `whatsappSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `loan_repayments` ADD `whatsappSentAt` timestamp;