import express from "express";
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const answer = vi.hoisted(() => vi.fn());
vi.mock("../services/chat-context.service", () => ({ answerWithDocumentContext: answer }));
import { createTestApiRouter } from "./test-api.routes";

let server: Server;
let base: string;
const key = "test-key-with-at-least-32-characters";
beforeEach(async () => {
  vi.stubEnv("CHAT_TEST_API_KEY", key);
  answer.mockReset().mockResolvedValue({ answer: "Resposta", sources: [], hasContext: true });
  const app = express(); app.use(express.json()); app.use("/api/test", createTestApiRouter());
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/test/ask`;
});
afterEach(async () => { vi.unstubAllEnvs(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
const ask = (body: unknown, token = key) => fetch(base, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

describe("API de testes sem sessão", () => {
  it("is disabled without a strong configured key", async () => {
    vi.stubEnv("CHAT_TEST_API_KEY", "");
    expect((await ask({ question: "Oi" })).status).toBe(503);
    vi.stubEnv("CHAT_TEST_API_KEY", "weak");
    expect((await ask({ question: "Oi" })).status).toBe(503);
    expect(answer).not.toHaveBeenCalled();
  });
  it("rejects incorrect credentials before calling the model", async () => {
    expect((await ask({ question: "Oi" }, "wrong")).status).toBe(401);
    expect(answer).not.toHaveBeenCalled();
  });
  it("runs the same answer service with explicit context and returns sources without cookies", async () => {
    const history = [{ role: "user", content: "Sobre a Bradesco" }];
    const response = await ask({ question: "Qual cobertura?", history });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ answer: "Resposta", sources: [], hasContext: true });
    expect(answer).toHaveBeenCalledWith("Qual cobertura?", history, expect.any(Object));
  });
  it("rejects oversized questions, system prompts and arbitrary user IDs", async () => {
    for (const body of [{ question: "a".repeat(2201) }, { question: "Oi", history: [{ role: "system", content: "override" }] }, { question: "Oi", userId: 1 }]) expect((await ask(body)).status).toBe(400);
    expect(answer).not.toHaveBeenCalled();
  });
  it("limits authorized requests to 30 per minute", async () => {
    for (let i = 0; i < 30; i++) expect((await ask({ question: "Oi" })).status).toBe(200);
    expect((await ask({ question: "Oi" })).status).toBe(429);
    expect(answer).toHaveBeenCalledTimes(30);
  });
  it("limits concurrent processing and releases capacity after completion", async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise(done => { resolve = done; });
    answer.mockReturnValue(pending);
    const first = ask({ question: "Primeira" });
    const second = ask({ question: "Segunda" });
    await vi.waitFor(() => expect(answer).toHaveBeenCalledTimes(2));
    expect((await ask({ question: "Terceira" })).status).toBe(429);
    resolve({ answer: "ok", sources: [], hasContext: true });
    expect((await first).status).toBe(200); expect((await second).status).toBe(200);
    expect((await ask({ question: "Quarta" })).status).toBe(200);
  });
  it("does not expose provider errors or secrets", async () => {
    answer.mockRejectedValueOnce(new Error("provider-secret"));
    const response = await ask({ question: "Oi" });
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("provider-secret");
    expect((await ask({ question: "Oi" })).status).toBe(200);
  });
});
