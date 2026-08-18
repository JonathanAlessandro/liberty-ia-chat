import { invokeLLM } from "../_core/llm";

export type DocumentChatMessage = { role: "system" | "user" | "assistant"; content: string };

function externalLlmConfiguration() {
  const baseUrl = process.env.LLM_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.LLM_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey, model: process.env.LLM_MODEL || "gpt-5-mini" };
}

export async function completeDocumentAnswer(messages: DocumentChatMessage[]) {
  const external = externalLlmConfiguration();
  if (external) {
    const response = await fetch(`${external.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${external.apiKey}` },
      body: JSON.stringify({ model: external.model, messages, temperature: 0.1 }),
    });
    if (!response.ok) throw new Error(`O provedor de IA retornou o status ${response.status}.`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content?.trim()) throw new Error("O provedor de IA não retornou uma resposta utilizável.");
    return content.trim();
  }

  const response = await invokeLLM({ model: "gpt-5-mini", messages });
  const content = response.choices[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("O serviço de IA não retornou uma resposta utilizável.");
  }
  return content.trim();
}
