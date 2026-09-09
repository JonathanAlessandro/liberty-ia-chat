export type DocumentChatMessage = { role: "system" | "user" | "assistant"; content: string };

const DEFAULT_LLM_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_COMPLETION_TOKENS = 600;

export function getLlmDiagnostics() {
  const configuredTimeout = Number(process.env.LLM_TIMEOUT_MS);
  return {
    model: process.env.LLM_MODEL || "gpt-4.1-mini",
    timeoutMs: Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : DEFAULT_LLM_TIMEOUT_MS,
  };
}

function externalLlmConfiguration() {
  const baseUrl = process.env.LLM_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.LLM_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("Configure LLM_BASE_URL e LLM_API_KEY para habilitar o chat.");
  return { baseUrl, apiKey, model: process.env.LLM_MODEL || "gpt-4.1-mini" };
}

export function createChatCompletionPayload(model: string, messages: DocumentChatMessage[]) {
  const payload: { model: string; messages: DocumentChatMessage[]; temperature?: number; reasoning_effort?: string; max_completion_tokens: number } = {
    model,
    messages,
    max_completion_tokens: Number(process.env.LLM_MAX_COMPLETION_TOKENS) || DEFAULT_MAX_COMPLETION_TOKENS,
  };

  // A família GPT-5 aceita Chat Completions, mas rejeita temperature fora do
  // valor padrão. Omitir o campo preserva o padrão aceito pela OpenAI.
  if (model.trim().toLowerCase().startsWith("gpt-5")) {
    payload.reasoning_effort = process.env.LLM_REASONING_EFFORT?.trim() || "minimal";
  } else {
    payload.temperature = 0.1;
  }

  return payload;
}

export async function completeDocumentAnswer(messages: DocumentChatMessage[]) {
  const external = externalLlmConfiguration();
  const { timeoutMs } = getLlmDiagnostics();
  let response: Response;
  try {
    response = await fetch(`${external.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${external.apiKey}` },
      body: JSON.stringify(createChatCompletionPayload(external.model, messages)),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error(`O provedor de IA não respondeu em até ${Math.round(timeoutMs / 1000)} segundos.`);
    }
    throw error;
  }
  if (!response.ok) {
      const responseBody = await response.text();
      console.error("[LLM] Provedor recusou a conclusão", {
        status: response.status,
        detail: responseBody.slice(0, 1000),
      });
      throw new Error(`O provedor de IA retornou o status ${response.status}.`);
  }
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content?.trim()) throw new Error("O provedor de IA não retornou uma resposta utilizável.");
  return content.trim();
}
