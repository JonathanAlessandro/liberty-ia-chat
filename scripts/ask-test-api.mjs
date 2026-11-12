// Usage: node scripts/ask-test-api.mjs "Na Bradesco, qual cobertura em Schengen?"
// Set LIBERTY_API_URL and CHAT_TEST_API_KEY in the caller environment.
const base = process.env.LIBERTY_API_URL;
const key = process.env.CHAT_TEST_API_KEY;
const question = process.argv.slice(2).join(" ");
if (!base || !key || !question) {
  console.error("Defina LIBERTY_API_URL e CHAT_TEST_API_KEY e informe a pergunta como argumento.");
  process.exit(1);
}
const endpoint = new URL("/api/test/ask", base);
if (endpoint.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)) {
  throw new Error("Use HTTPS para proteger a credencial de testes.");
}
const response = await fetch(endpoint, {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
  body: JSON.stringify({ question }), signal: AbortSignal.timeout(180000),
});
console.log(JSON.stringify(await response.json(), null, 2));
if (!response.ok) process.exitCode = 1;
