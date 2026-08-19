import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type ComposeDocument = {
  services?: Record<string, { build?: string; image?: string; depends_on?: Record<string, unknown>; volumes?: unknown[]; mem_limit?: string }>;
  volumes?: Record<string, unknown>;
};

describe("Docker Compose deployment", () => {
  it("defines the application, database and persistent document storage services", async () => {
    const source = await readFile(new URL("../../docker-compose.yml", import.meta.url), "utf8");
    const compose = parse(source) as ComposeDocument;

    expect(compose.services?.app?.build).toBe(".");
    expect(compose.services?.database?.image).toContain("mariadb");
    expect(compose.services?.minio?.image).toContain("minio");
    expect(compose.services?.app?.depends_on).toHaveProperty("database");
    expect(compose.services?.app?.depends_on).not.toHaveProperty("minio-init");
    expect(compose.services?.app?.mem_limit).toBe("640m");
    expect(compose.services?.database?.mem_limit).toBe("384m");
    expect(compose.services?.minio?.mem_limit).toBe("256m");
    expect(compose.services?.app?.volumes).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "/data/liberty-ai/knowledge", target: "/app/knowledge", is_directory: true }),
    ]));
    expect(compose.volumes).toHaveProperty("mariadb_data");
    expect(compose.volumes).toHaveProperty("minio_data");
  });

  it("starts migrations before the production server", async () => {
    const source = await readFile(new URL("../../scripts/start.sh", import.meta.url), "utf8");
    const dockerfile = await readFile(new URL("../../Dockerfile", import.meta.url), "utf8");
    expect(dockerfile).toContain('CMD ["sh", "scripts/start.sh"]');
    expect(source).toContain("pnpm drizzle-kit migrate");
    expect(source).toContain("exec node dist/index.js");
  });
});
