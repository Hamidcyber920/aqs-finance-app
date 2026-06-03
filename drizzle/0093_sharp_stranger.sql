ALTER TABLE `stripe_payment_sessions` ADD `stripeFeeAmount` decimal(10,2);--> statement-breakpoint
ALTER TABLE `stripe_payment_sessions` ADD `netAmount` decimal(10,2);