CREATE TABLE `knowledgeFolders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(80) NOT NULL,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledgeFolders_id` PRIMARY KEY(`id`),
	CONSTRAINT `knowledgeFolders_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `documents` ADD `folderId` int;--> statement-breakpoint
ALTER TABLE `knowledgeFolders` ADD CONSTRAINT `knowledgeFolders_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_folderId_knowledgeFolders_id_fk` FOREIGN KEY (`folderId`) REFERENCES `knowledgeFolders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `documents_folder_idx` ON `documents` (`folderId`);