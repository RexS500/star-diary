CREATE TABLE `children` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`family_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `redemptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`child_id` integer NOT NULL,
	`reward_id` integer NOT NULL,
	`cost` integer NOT NULL,
	`approved_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rewards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`family_id` text NOT NULL,
	`name` text NOT NULL,
	`cost` integer NOT NULL,
	`emoji` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `star_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`child_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`note` text,
	`image_key` text,
	`author` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
