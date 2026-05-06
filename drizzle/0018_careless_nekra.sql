ALTER TABLE `user_permissions` ADD `canViewFinanceReports` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `canExportFinanceReports` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `canTrackFinance` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `canViewAllIncome` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `canApproveExpenses` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `canManageInvoices` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `canManageCashCollection` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `canManageFridayCollection` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `canReconcileFriday` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `canViewReconciliation` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `canManageReconciliation` boolean DEFAULT false NOT NULL;