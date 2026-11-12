import express from "express";
import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createHealthRouter } from "./health.routes";

let server: Server | undefined;
const execute = promisify(execFile);
const script = fileURLToPath(new URL("../../scripts/healthcheck.mjs", import.meta.url));
async function listen(app: ReturnType<typeof express>) {
  server = createServer(app);
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  return (server.address() as { port: number }).port;
}
afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server!.close(() => resolve()));
    server = undefined;
  }
});
const probe = (port: number) => execute(process.execPath, [script], { env: { ...process.env, PORT: String(port) } });
describe("container healthcheck", () => {
  it("checks the actual unauthenticated route with the container's probe", async () => {
    const app = express(); app.use("/api", createHealthRouter());
    const port = await listen(app);
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
    await expect(probe(port)).resolves.toMatchObject({ stderr: "" });
  });
  it.each([500, 200])("rejects an error or SPA fallback with HTTP %s", async status => {
    const app = express(); app.get("/api/health", (_req, res) => res.status(status).send("<html>Not a health response</html>"));
    await expect(probe(await listen(app))).rejects.toMatchObject({ code: 1 });
  });
});
