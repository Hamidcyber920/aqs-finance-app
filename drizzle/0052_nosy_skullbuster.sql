CREATE TABLE `comms_outbox` (
	`id` int AUTO_INCREMENT NOT NULL,
	`templateId` int,
	`recipientGroup` enum('trustees_all','staff_all','donors_all','donors_major','donors_monthly','donors_eid','donors_friday','students_current','suppliers','individual','custom') NOT NULL,
	`recipientIds` json,
	`subject` varchar(500),
	`body` text NOT NULL,
	`type` enum('email','sms','letter') NOT NULL DEFAULT 'email',
	`status` enum('queued','sending','sent','failed','cancelled') NOT NULL DEFAULT 'queued',
	`sentCount` int NOT NULL DEFAULT 0,
	`failCount` int NOT NULL DEFAULT 0,
	`scheduledAt` timestamp,
	`sentAt` timestamp,
	`sentByUserId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `comms_outbox_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `comms_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`category` enum('trustee_meeting','donor_thankyou','gift_aid_declaration','commission_response','staff_bulletin','supplier_query','training_invite','general') NOT NULL DEFAULT 'general',
	`type` enum('email','sms','letter') NOT NULL DEFAULT 'email',
	`subject` varchar(500),
	`body` text NOT NULL,
	`variables` json,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `comms_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `donor_segments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`donorId` int NOT NULL,
	`segment` enum('major','monthly','eid','friday','anonymous') NOT NULL,
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	`assignedByUserId` int,
	CONSTRAINT `donor_segments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `donor_thank_you_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`donorId` int NOT NULL,
	`donationId` int,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`channel` enum('email','sms','whatsapp') NOT NULL DEFAULT 'email',
	`status` enum('sent','failed','pending') NOT NULL DEFAULT 'pending',
	`message` text,
	`approvedByUserId` int,
	CONSTRAINT `donor_thank_you_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gift_aid_claims` (
	`id` int AUTO_INCREMENT NOT NULL,
	`donorId` int NOT NULL,
	`donorName` varchar(200),
	`donorAddress` text,
	`donorPostcode` varchar(20),
	`donationDate` date NOT NULL,
	`donationAmount` decimal(10,2) NOT NULL,
	`giftAidAmount` decimal(10,2),
	`taxYear` varchar(10) NOT NULL,
	`quarter` enum('Q1','Q2','Q3','Q4') NOT NULL,
	`claimStatus` enum('pending','submitted','approved','rejected') NOT NULL DEFAULT 'pending',
	`hmrcRef` varchar(100),
	`claimedAt` timestamp,
	`csvExportedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gift_aid_claims_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `meeting_agenda_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`meetingId` int NOT NULL,
	`itemNumber` int NOT NULL DEFAULT 1,
	`title` varchar(500) NOT NULL,
	`description` text,
	`ownerId` int,
	`actionRequired` boolean NOT NULL DEFAULT false,
	`linkedComplianceActionId` int,
	`linkedDecisionId` int,
	`durationMinutes` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `meeting_agenda_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `onboarding_pipeline` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`pipelineType` enum('onboarding','offboarding') NOT NULL DEFAULT 'onboarding',
	`stage` enum('contract','id_check','dbs','induction','training','payslip','notice_period','access_revoked','final_pay','exit_interview','p45') NOT NULL,
	`status` enum('pending','in_progress','completed','blocked') NOT NULL DEFAULT 'pending',
	`completedAt` timestamp,
	`documentUrl` text,
	`notes` text,
	`assignedToUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `onboarding_pipeline_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payroll_v2` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int,
	`employeeName` varchar(200) NOT NULL,
	`niNumber` varchar(20),
	`taxCode` varchar(20),
	`month` int NOT NULL,
	`year` int NOT NULL,
	`grossPay` decimal(10,2) NOT NULL,
	`incomeTax` decimal(10,2) NOT NULL DEFAULT '0',
	`nationalInsurance` decimal(10,2) NOT NULL DEFAULT '0',
	`pensionEmployee` decimal(10,2) NOT NULL DEFAULT '0',
	`pensionEmployer` decimal(10,2) NOT NULL DEFAULT '0',
	`otherDeductions` decimal(10,2) NOT NULL DEFAULT '0',
	`netPay` decimal(10,2) NOT NULL,
	`ytdGross` decimal(10,2) NOT NULL DEFAULT '0',
	`ytdTax` decimal(10,2) NOT NULL DEFAULT '0',
	`ytdNI` decimal(10,2) NOT NULL DEFAULT '0',
	`payslipUrl` text,
	`paymentMethod` enum('bank_transfer','cheque','cash') NOT NULL DEFAULT 'bank_transfer',
	`status` enum('draft','approved','paid') NOT NULL DEFAULT 'draft',
	`approvedByUserId` int,
	`approvedAt` timestamp,
	`paidAt` timestamp,
	`notes` text,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payroll_v2_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trustee_meetings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(500) NOT NULL,
	`meetingType` enum('trustee_board','finance_committee','safeguarding_committee','building_committee','agm','extraordinary','staff') NOT NULL DEFAULT 'trustee_board',
	`scheduledAt` timestamp NOT NULL,
	`location` varchar(300),
	`status` enum('scheduled','in_progress','completed','cancelled') NOT NULL DEFAULT 'scheduled',
	`agendaUrl` text,
	`minutesUrl` text,
	`transcriptUrl` text,
	`transcriptText` text,
	`aiDecisionsExtracted` boolean NOT NULL DEFAULT false,
	`attendees` json,
	`notes` text,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trustee_meetings_id` PRIMARY KEY(`id`)
);
