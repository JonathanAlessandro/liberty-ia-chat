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
it.each([
  { supported: true, answer: "Fonte inventada [F99]", sourceIds: ["F99"] },
  { supported: true, answer: "Fonte inventada [F99]", sourceIds: ["F1"] },
  { supported: true, answer: "https://example.org/norma-inventada", sourceIds: ["F1"] },
  { supported: false, answer: "Sem evidência", sourceIds: [] },
])("rejects invalid citations or unsupported output: %j", async value => {
  fetchMock.mockResolvedValueOnce(completion(value));
  expect(await completeGroundedAnswer(evidence, [{ id: "F1" }])).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
