// Use Node already installed in the image; no curl/wget dependency.
try {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
    signal: AbortSignal.timeout(4000), redirect: 'error',
  });
  if (!response.ok || (await response.json()).status !== 'ok') throw new Error('Unhealthy response');
} catch {
  console.error('Application healthcheck failed.');
  process.exitCode = 1;
}
