/**
 * Runs the real worker locally against the real flows, without Cloudflare.
 *
 *   node worker/dev-server.mjs        ->  http://localhost:8787
 *
 * Reads worker/.dev.vars for the flow URLs, so it behaves exactly like the
 * deployed worker. Use it to see the app with live SharePoint data before
 * anything is deployed. `wrangler dev` does the same thing but needs an
 * account and a login.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from './src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 8787;

const env = {};
for (const line of readFileSync(join(HERE, '.dev.vars'), 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq > 0) env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}
if (!env.ALLOWED_ORIGINS) env.ALLOWED_ORIGINS = 'http://localhost:5173';

createServer(async (req, res) => {
  const url = `http://localhost:${PORT}${req.url}`;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  const request = new Request(url, { method: req.method, headers: req.headers, body });
  const response = await worker.fetch(request, env);

  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
  console.log(req.method, req.url, '->', response.status);
}).listen(PORT, () => {
  console.log(`worker on http://localhost:${PORT}, using the real flows`);
  console.log(`allowed origins: ${env.ALLOWED_ORIGINS}`);
});
