ALTER TABLE `fundraising_campaigns` ADD `isRestricted` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `fundraising_campaigns` ADD `restrictedPurpose` varchar(500);--> statement-breakpoint
ALTER TABLE `gift_aid_certificates` ADD CONSTRAINT `uq_gift_aid_cert_donor_from` UNIQUE(`donorId`,`coversFrom`);--> statement-breakpoint
ALTER TABLE `stripe_payment_sessions` ADD CONSTRAINT `stripe_payment_sessions_stripePaymentIntentId_unique` UNIQUE(`stripePaymentIntentId`);