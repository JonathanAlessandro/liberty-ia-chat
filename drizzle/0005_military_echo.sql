DROP INDEX `documents_source_priority_idx` ON `documents`;--> statement-breakpoint
ALTER TABLE `documents` ADD `sourceGroup` varchar(128);--> statement-breakpoint
CREATE INDEX `documents_source_priority_idx` ON `documents` (`sourceAuthority`,`sourceGroup`,`effectiveAt`);