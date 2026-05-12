ALTER TABLE `fundraising_donations` ADD `isRefund` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `fundraising_donations` ADD `refundedDonationId` int;--> statement-breakpoint
ALTER TABLE `fundraising_donations` ADD `refundReason` varchar(500);--> statement-breakpoint
ALTER TABLE `fundraising_donations` ADD `refundedAt` timestamp;--> statement-breakpoint
ALTER TABLE `fundraising_donations` ADD `refundedById` int;--> statement-breakpoint
ALTER TABLE `fundraising_donations` ADD `giftAidReversed` boolean DEFAULT false NOT NULL;