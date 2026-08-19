CREATE TABLE `localUserAccounts` (
	`userId` int NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`isActive` int NOT NULL DEFAULT 1,
	`mustChangePassword` int NOT NULL DEFAULT 1,
	`passwordUpdatedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `localUserAccounts_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `localUserSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `localUserSessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `localUserSessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `conversations` ADD `ownerUserId` int;--> statement-breakpoint
ALTER TABLE `localUserAccounts` ADD CONSTRAINT `localUserAccounts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `localUserSessions` ADD CONSTRAINT `localUserSessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `local_user_accounts_active_idx` ON `localUserAccounts` (`isActive`);--> statement-breakpoint
CREATE INDEX `local_user_sessions_user_idx` ON `localUserSessions` (`userId`);--> statement-breakpoint
CREATE INDEX `local_user_sessions_expires_idx` ON `localUserSessions` (`expiresAt`);--> statement-breakpoint
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_ownerUserId_users_id_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `conversations_owner_user_idx` ON `conversations` (`ownerUserId`);