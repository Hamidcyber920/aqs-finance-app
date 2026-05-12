CREATE TABLE `bistro_daily_totals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` date NOT NULL,
	`totalOrders` int NOT NULL DEFAULT 0,
	`totalRevenue` decimal(10,2) NOT NULL DEFAULT '0',
	`cashRevenue` decimal(10,2) NOT NULL DEFAULT '0',
	`cardRevenue` decimal(10,2) NOT NULL DEFAULT '0',
	`dineInOrders` int NOT NULL DEFAULT 0,
	`takeawayOrders` int NOT NULL DEFAULT 0,
	`cateringOrders` int NOT NULL DEFAULT 0,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bistro_daily_totals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bistro_menu_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`category` varchar(100) NOT NULL DEFAULT 'Main',
	`description` text,
	`price` decimal(10,2) NOT NULL,
	`costPrice` decimal(10,2),
	`isAvailable` boolean NOT NULL DEFAULT true,
	`isHalal` boolean NOT NULL DEFAULT true,
	`allergens` text,
	`imageUrl` text,
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bistro_menu_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bistro_order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`menuItemId` int NOT NULL,
	`itemName` varchar(200) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`unitPrice` decimal(10,2) NOT NULL,
	`lineTotal` decimal(10,2) NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bistro_order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bistro_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderRef` varchar(20) NOT NULL,
	`tableNumber` varchar(20),
	`customerName` varchar(200),
	`orderType` enum('dine_in','takeaway','delivery','event_catering') NOT NULL DEFAULT 'dine_in',
	`status` enum('pending','preparing','ready','served','cancelled') NOT NULL DEFAULT 'pending',
	`subtotal` decimal(10,2) NOT NULL DEFAULT '0',
	`tax` decimal(10,2) NOT NULL DEFAULT '0',
	`total` decimal(10,2) NOT NULL DEFAULT '0',
	`paymentMethod` enum('cash','card','online','account'),
	`paymentStatus` enum('unpaid','paid','refunded') NOT NULL DEFAULT 'unpaid',
	`notes` text,
	`staffId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bistro_orders_id` PRIMARY KEY(`id`)
);
