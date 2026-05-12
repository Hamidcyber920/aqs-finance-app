CREATE TABLE `voice_cost_tracking` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`date` date NOT NULL,
	`tokenCount` int NOT NULL DEFAULT 0,
	`estimatedCostPence` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `voice_cost_tracking_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `voice_feature_flags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`toolName` varchar(100) NOT NULL,
	`enabledRoles` text NOT NULL DEFAULT ('[]'),
	`phase` int NOT NULL DEFAULT 1,
	`enabled` boolean NOT NULL DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `voice_feature_flags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `voice_review_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int,
	`transcriptId` int,
	`flaggedByUserId` int NOT NULL,
	`agentStatement` text NOT NULL,
	`userCorrection` text,
	`status` enum('pending','reviewed','dismissed') NOT NULL DEFAULT 'pending',
	`reviewedByUserId` int,
	`reviewNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`reviewedAt` timestamp,
	CONSTRAINT `voice_review_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `voice_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`conversationId` varchar(100) NOT NULL,
	`language` varchar(10) NOT NULL DEFAULT 'en',
	`device` varchar(50),
	`screenContext` varchar(200),
	`tokenCount` int NOT NULL DEFAULT 0,
	`status` enum('active','completed','error','timeout') NOT NULL DEFAULT 'active',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`endedAt` timestamp,
	CONSTRAINT `voice_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `voice_tool_calls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`toolName` varchar(100) NOT NULL,
	`params` text,
	`resultSummary` text,
	`success` boolean NOT NULL DEFAULT true,
	`errorMessage` text,
	`latencyMs` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `voice_tool_calls_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `voice_transcripts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`role` enum('user','assistant','system','tool') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `voice_transcripts_id` PRIMARY KEY(`id`)
);
