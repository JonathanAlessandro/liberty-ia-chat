import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../_core/llm", () => ({ invokeLLM: vi.fn() }));

import { completeDocumentAnswer, createChatCompletionPayload } from "./llm.service";

const messages = [{ role: "user" as const, content: "Olá" }];
const originalEnv = { ...process.env };

describe("GPT-5 chat completion compatibility", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("omits custom temperature for GPT-5 models", () => {
    expect(createChatCompletionPayload("gpt-5-mini", messages)).toEqual({ model: "gpt-5-mini", messages, reasoning_effort: "minimal", max_completion_tokens: 800 });
  });

  it("keeps the focused temperature for non-GPT-5 providers", () => {
    expect(createChatCompletionPayload("gpt-4o-mini", messages)).toEqual({ model: "gpt-4o-mini", messages, temperature: 0.1 });
  });

  it("sends a GPT-5-compatible payload to the external provider", async () => {
    process.env.LLM_BASE_URL = "https://api.openai.com/v1";
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_MODEL = "gpt-5-mini";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Resposta" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeDocumentAnswer(messages)).resolves.toBe("Resposta");

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({ model: "gpt-5-mini", messages, reasoning_effort: "minimal", max_completion_tokens: 800 });
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("accepts latency controls through environment variables", () => {
    process.env.LLM_REASONING_EFFORT = "low";
    process.env.LLM_MAX_COMPLETION_TOKENS = "500";
    expect(createChatCompletionPayload("gpt-5-mini", messages)).toMatchObject({ reasoning_effort: "low", max_completion_tokens: 500 });
  });
});
