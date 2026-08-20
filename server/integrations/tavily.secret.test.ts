import { describe, expect, it } from "vitest";

describe("Tavily external search credential", () => {
  const liveTest = process.env.RUN_EXTERNAL_INTEGRATION_TESTS === "true" ? it : it.skip;

  liveTest("authenticates a minimal search request", async () => {
    const apiKey = process.env.TAVILY_API_KEY;
    expect(apiKey, "TAVILY_API_KEY deve estar configurada").toBeTruthy();

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        query: "OpenAI official website",
        max_results: 1,
        search_depth: "basic",
      }),
    });

    const responseText = await response.text();
    expect(response.ok, `Tavily respondeu com status ${response.status}: ${responseText.slice(0, 500)}`).toBe(true);
    const payload = JSON.parse(responseText) as { results?: unknown[] };
    expect(Array.isArray(payload.results)).toBe(true);
  }, 20_000);
});
