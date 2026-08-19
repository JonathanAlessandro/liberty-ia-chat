ALTER TABLE `documents` DROP FOREIGN KEY IF EXISTS `documents_createdByUserId_users_id_fk`;--> statement-breakpoint
ALTER TABLE `documents` MODIFY COLUMN `createdByUserId` int;--> statement-breakpoint
ALTER TABLE `documents` ADD `sourceKind` varchar(32) DEFAULT 'pdf' NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `sourceOrigin` varchar(32) DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `sourcePath` varchar(512);--> statement-breakpoint
ALTER TABLE `documents` ADD `sourceFingerprint` varchar(64);--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `documents_source_path_idx` ON `documents` (`sourcePath`);--> statement-breakpoint
CREATE INDEX `documents_source_origin_idx` ON `documents` (`sourceOrigin`);
