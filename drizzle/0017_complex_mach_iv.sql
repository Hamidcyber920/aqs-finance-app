ALTER TABLE `users` MODIFY COLUMN `role` enum('superadmin','trustee','manager','deputy','assistant','volunteer','user','admin','property_manager') NOT NULL DEFAULT 'assistant';--> statement-breakpoint
ALTER TABLE `users` ADD `supervisedById` int;--> statement-breakpoint
ALTER TABLE `users` ADD `isPropertyManager` boolean DEFAULT false NOT NULL;