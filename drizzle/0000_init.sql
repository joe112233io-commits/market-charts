CREATE TABLE `alert_events` (
	`id` text PRIMARY KEY NOT NULL,
	`alert_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`bar_time` integer NOT NULL,
	`price` real NOT NULL,
	`message` text NOT NULL,
	`fired_at` text NOT NULL,
	FOREIGN KEY (`alert_id`) REFERENCES `alerts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `alert_events_owner` ON `alert_events` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `alert_events_once_per_bar` ON `alert_events` (`alert_id`,`bar_time`);--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`symbol_id` text NOT NULL,
	`condition` text NOT NULL,
	`value` real NOT NULL,
	`value2` real,
	`frequency` text NOT NULL,
	`expires_at` text,
	`status` text NOT NULL,
	`message` text NOT NULL,
	`notify_email` integer DEFAULT false NOT NULL,
	`last_fired_bar_time` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`symbol_id`) REFERENCES `symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `alerts_owner` ON `alerts` (`owner_id`);--> statement-breakpoint
CREATE INDEX `alerts_symbol` ON `alerts` (`symbol_id`,`status`);--> statement-breakpoint
CREATE TABLE `bars` (
	`symbol_id` text NOT NULL,
	`time` integer NOT NULL,
	`open` real NOT NULL,
	`high` real NOT NULL,
	`low` real NOT NULL,
	`close` real NOT NULL,
	`volume` real NOT NULL,
	PRIMARY KEY(`symbol_id`, `time`),
	FOREIGN KEY (`symbol_id`) REFERENCES `symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chart_layouts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`symbol_id` text NOT NULL,
	`interval` text NOT NULL,
	`chart_type` text NOT NULL,
	`indicators` text NOT NULL,
	`drawings` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`symbol_id`) REFERENCES `symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chart_layouts_owner` ON `chart_layouts` (`owner_id`);--> statement-breakpoint
CREATE TABLE `paper_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`currency` text NOT NULL,
	`starting_balance` real NOT NULL,
	`commission_pct` real NOT NULL,
	`cash` real NOT NULL,
	`realized_pnl` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `paper_accounts_owner` ON `paper_accounts` (`owner_id`);--> statement-breakpoint
CREATE TABLE `paper_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`symbol_id` text NOT NULL,
	`side` text NOT NULL,
	`type` text NOT NULL,
	`qty` real NOT NULL,
	`price` real,
	`status` text NOT NULL,
	`reason` text,
	`filled_price` real,
	`commission` real,
	`created_at` text NOT NULL,
	`filled_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `paper_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`symbol_id`) REFERENCES `symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `paper_orders_account` ON `paper_orders` (`account_id`);--> statement-breakpoint
CREATE INDEX `paper_orders_working` ON `paper_orders` (`symbol_id`,`status`);--> statement-breakpoint
CREATE TABLE `paper_positions` (
	`account_id` text NOT NULL,
	`symbol_id` text NOT NULL,
	`qty` real NOT NULL,
	`avg_price` real NOT NULL,
	PRIMARY KEY(`account_id`, `symbol_id`),
	FOREIGN KEY (`account_id`) REFERENCES `paper_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`symbol_id`) REFERENCES `symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `screens` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`filters` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `screens_owner` ON `screens` (`owner_id`);--> statement-breakpoint
CREATE TABLE `symbols` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`ticker` text NOT NULL,
	`name` text NOT NULL,
	`exchange` text NOT NULL,
	`asset_type` text NOT NULL,
	`currency` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `symbols_org_ticker` ON `symbols` (`org_id`,`ticker`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `watchlist_items` (
	`watchlist_id` text NOT NULL,
	`symbol_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`watchlist_id`, `symbol_id`),
	FOREIGN KEY (`watchlist_id`) REFERENCES `watchlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`symbol_id`) REFERENCES `symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `watchlists` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `watchlists_owner` ON `watchlists` (`owner_id`);