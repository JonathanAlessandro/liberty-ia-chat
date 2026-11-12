import { createHash, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { answerWithDocumentContext } from "../services/chat-context.service";
import { createChatTrace, logChatStage } from "../services/chat-observability.service";

const inputSchema = z.object({
  question: z.string().trim().min(2).max(2200),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(6000) }).strict()).max(20).default([]),
}).strict();
const digest = (value: string) => createHash("sha256").update(value).digest();

/** A separate machine credential; never accepts browser cookies or user IDs. */
export function createTestApiRouter() {
  const router = Router();
  let active = 0;
  let windowStarted = 0;
  let requests = 0;
  router.post("/ask", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const key = process.env.CHAT_TEST_API_KEY?.trim();
    if (!key || key.length < 32) {
      res.status(503).json({ error: "API de testes desativada. Configure CHAT_TEST_API_KEY com pelo menos 32 caracteres." }); return;
    }
    const authorization = req.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token || !timingSafeEqual(digest(token), digest(key))) {
      res.status(401).json({ error: "Credencial de testes inválida." }); return;
    }
    const parsed = inputSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Pergunta ou histórico inválido.", issues: parsed.error.issues }); return; }
    const now = Date.now();
    if (now - windowStarted >= 60_000) { windowStarted = now; requests = 0; }
    if (requests >= 30 || active >= 2) {
      res.setHeader("Retry-After", "60");
      res.status(429).json({ error: "Limite da API de testes: 30 perguntas por minuto e 2 simultâneas por instância." }); return;
    }
    requests++; active++;
    const trace = createChatTrace();
    logChatStage(trace, "request", "started");
    try {
      const answer = await answerWithDocumentContext(parsed.data.question, parsed.data.history, trace);
      logChatStage(trace, "request", "completed", trace.requestStartedAt, { responseMode: answer.responseMode });
      res.json({ ...answer, elapsedMs: Date.now() - now });
    } catch {
      logChatStage(trace, "request", "failed", trace.requestStartedAt);
      res.status(502).json({ error: "Não foi possível gerar a resposta. Consulte os registros da aplicação." });
    } finally { active--; }
  });
  return router;
}
