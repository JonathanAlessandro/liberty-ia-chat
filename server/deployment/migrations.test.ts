import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Drizzle migrations", () => {
  it("preserves existing history and makes retention permanent", async () => {
    const migration = await readFile(new URL("../../drizzle/0010_open_grandmaster.sql", import.meta.url), "utf8");
    expect(migration).toContain("DEFAULT 'permanent'");
    expect(migration).toContain("UPDATE `messages` SET `retentionPolicy` = 'permanent'");
    expect(migration).not.toMatch(/DELETE|DROP/i);
  });
  it("ships every migration referenced by the journal", async () => {
    const journal = await readFile(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8");
    const tags = Array.from(journal.matchAll(/"tag":\s*"([^"]+)"/g), match => match[1]);

    await Promise.all(tags.map(async tag => {
      const migration = await readFile(new URL(`../../drizzle/${tag}.sql`, import.meta.url), "utf8");
      expect(migration.trim().length).toBeGreaterThan(0);
    }));
  });

  it("can reapply the documents foreign-key adaptation when the legacy key is absent", async () => {
    const migration = await readFile(new URL("../../drizzle/0002_flat_wrecker.sql", import.meta.url), "utf8");
    expect(migration).toContain("DROP FOREIGN KEY IF EXISTS `documents_createdByUserId_users_id_fk`");
    expect(migration).not.toContain("DROP FOREIGN KEY `documents_createdByUserId_users_id_fk`");
    expect(migration.trimStart()).not.toMatch(/^--> statement-breakpoint/);
    expect(migration.split("--> statement-breakpoint").every(statement => statement.trim().length > 0)).toBe(true);
  });
});
