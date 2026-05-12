CREATE TABLE `donor_comms_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`donorId` int,
	`donorLeadId` int,
	`type` enum('portal_link_sent','annual_statement_sent','pledge_reminder_sent','payment_receipt_sent','thank_you_sent','manual_note','email_sent','whatsapp_sent') NOT NULL,
	`channel` enum('email','whatsapp','sms','system') NOT NULL DEFAULT 'email',
	`subject` varchar(300),
	`notes` text,
	`sentByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `donor_comms_log_id` PRIMARY KEY(`id`)
);
