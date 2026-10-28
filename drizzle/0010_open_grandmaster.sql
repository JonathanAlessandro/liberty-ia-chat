ALTER TABLE `messages` MODIFY COLUMN `retentionPolicy` enum('legacy_7_days','permanent') NOT NULL DEFAULT 'permanent';
--> statement-breakpoint
UPDATE `messages` SET `retentionPolicy` = 'permanent' WHERE `retentionPolicy` = 'legacy_7_days';
