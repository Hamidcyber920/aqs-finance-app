ALTER TABLE `email_activity_log` MODIFY COLUMN `action` enum('received','read','moved_section','assigned','actioned','archived','replied','forwarded','ocr_processed','ai_summarised','linked_receipt') NOT NULL;--> statement-breakpoint
ALTER TABLE `inbound_emails` ADD `linkedReceiptId` int;--> statement-breakpoint
ALTER TABLE `inbound_emails` ADD `linkedReceiptNote` varchar(255);