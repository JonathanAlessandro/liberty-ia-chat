import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { completeGroundedAnswer } from "./llm.service";
const originalEnv = { ...process.env };
const fetchMock = vi.fn();
const completion = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }));
const evidence = [{ role: "system" as const, content: "TRECHOS DOCUMENTAIS PRIORITÁRIOS:\n[F1] Titular: a partir de 44 anos completos sem limite de idade." }];
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); process.env.LLM_BASE_URL = "https://api.openai.com/v1"; process.env.LLM_API_KEY = "test-key"; });
afterEach(() => { process.env = { ...originalEnv }; vi.unstubAllGlobals(); });
it("returns only validated cited source IDs after a factual audit", async () => {
  fetchMock.mockResolvedValueOnce(completion({ supported: true, answer: "A partir de 44 anos, sem limite máximo [F1].", sourceIds: ["F1"] })).mockResolvedValueOnce(completion({ supported: true }));
  expect(await completeGroundedAnswer(evidence, [{ id: "F1" }])).toEqual({ answer: "A partir de 44 anos, sem limite máximo [F1].", sourceIds: ["F1"] });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format).toEqual({ type: "json_object" });
});
it("rejects eligibility or contradictory claims not approved by the evidence audit", async () => {
  fetchMock.mockResolvedValueOnce(completion({ supported: true, answer: "Pode aderir aos 43 anos [F1].", sourceIds: ["F1"] })).mockResolvedValueOnce(completion({ supported: false }));
  expect(await completeGroundedAnswer(evidence, [{ id: "F1" }])).toBeNull();
});
it("normalizes page-qualified markers so the application uses the real source page", async () => {
  fetchMock.mockResolvedValueOnce(completion({ supported: true, answer: "Regra confirmada [F1, página 999].", sourceIds: ["F1"] })).mockResolvedValueOnce(completion({ supported: true }));
  expect(await completeGroundedAnswer(evidence, [{ id: "F1" }])).toEqual({ answer: "Regra confirmada [F1].", sourceIds: ["F1"] });
});
it("rewrites a maximum waiting period mistakenly described as a mandatory minimum", async () => {
  fetchMock.mockResolvedValueOnce(completion({ supported: true, answer: "Máximo de 24 horas; após esse período mínimo de carência [F1].", sourceIds: ["F1"] }))
    .mockResolvedValueOnce(completion({ supported: true, answer: "O prazo máximo é 24 horas [F1].", sourceIds: ["F1"] }))
    .mockResolvedValueOnce(completion({ supported: true }));
  const messages = [...evidence, { role: "user" as const, content: "Qual o prazo máximo de carência?" }];
  expect((await completeGroundedAnswer(messages, [{ id: "F1" }]))?.answer).toBe("O prazo máximo é 24 horas [F1].");
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
it("does not loop or publish the contradiction if the rewrite repeats it", async () => {
  fetchMock.mockResolvedValue(completion({ supported: true, answer: "Após o período mínimo de carência [F1].", sourceIds: ["F1"] }));
  expect(await completeGroundedAnswer([...evidence, { role: "user", content: "Qual o prazo máximo de carência?" }], [{ id: "F1" }])).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it.each([
  { supported: true, answer: "Fonte inventada [F99]", sourceIds: ["F99"] },
  { supported: true, answer: "Fonte inventada [F99]", sourceIds: ["F1"] },
  { supported: true, answer: "Fonte inventada [F1, F99]", sourceIds: ["F1"] },
  { supported: true, answer: "https://example.org/norma-inventada", sourceIds: ["F1"] },
  { supported: false, answer: "Sem evidência", sourceIds: [] },
])("rejects invalid citations or unsupported output: %j", async value => {
  fetchMock.mockResolvedValueOnce(completion(value));
  expect(await completeGroundedAnswer(evidence, [{ id: "F1" }])).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
