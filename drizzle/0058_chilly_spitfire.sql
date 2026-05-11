ALTER TABLE `donors` ADD `rfmScore` varchar(5);--> statement-breakpoint
ALTER TABLE `donors` ADD `rfmSegment` varchar(50);--> statement-breakpoint
ALTER TABLE `donors` ADD `rfmLastCalculated` timestamp;--> statement-breakpoint
ALTER TABLE `donors` ADD `lawfulBasis` enum('consent','legitimate_interest','contract','legal_obligation') DEFAULT 'legitimate_interest';