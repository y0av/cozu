// Cozu's one Cloud Function: the MCP server (POST /mcp, Streamable HTTP, stateless, JSON responses) and
// GET /api/v1/search. Both read the static catalog the site publishes, cached in memory for five minutes.
import { onRequest } from 'firebase-functions/v2/https';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const SITE = 'https://cozu.xyz';
const CATALOG_URL = process.env.CATALOG_URL || 'https://cozu-a.web.app/api/v1/assets.json';
const TTL = 5 * 60 * 1000;
let cache = { at: 0, data: null };

async function catalog() {
  if (cache.data && Date.now() - cache.at < TTL) return cache.data;
  const res = await fetch(CATALOG_URL, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    if (cache.data) return cache.data;   // serve the last good copy if the site is briefly unreachable
    throw new Error(`catalog: HTTP ${res.status}`);
  }
  cache = { at: Date.now(), data: await res.json() };
  return cache.data;
}

const norm = (s) => String(s || '').toLowerCase();

/** Rank models for a query: title words weigh most, then tags and category, then the summary. */
export function search(data, { query = '', category, format, limit = 10 } = {}) {
  const terms = norm(query).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1);
  const out = [];
  for (const a of data.assets) {
    if (category && norm(a.category) !== norm(category)) continue;
    if (format && !a.formats.some((f) => norm(f) === norm(format))) continue;
    let score = terms.length ? 0 : 1;
    for (const t of terms) {
      const hit = (s, w) => (norm(s).includes(t) ? w : 0);
      const s = hit(a.title, 6) + Math.max(0, ...a.tags.map((x) => hit(x, 3))) + hit(a.category, 3) + hit(a.summary, 1) + Math.max(0, ...a.formats.map((x) => hit(x, 2)));
      if (!s) { score = 0; break; }
      score += s;
    }
    if (score > 0) out.push({ score, a });
  }
  out.sort((x, y) => y.score - x.score || y.a.updated.localeCompare(x.a.updated));
  return out.slice(0, Math.min(Math.max(1, Number(limit) || 10), 50)).map(({ a }) => summary(a));
}

export function summary(a) {
  return {
    id: a.id, title: a.title, summary: a.summary, category: a.category, formats: a.formats, tags: a.tags,
    page: a.page, json: `${SITE}/api/v1/assets/${a.id}.json`,
    license: a.license.id, attribution: a.attribution.text,
    preview: a.previews[0]?.url,
    triangles: a.stats?.triangles, rigged: a.stats?.rigged,
    downloads: a.downloads.map((d) => ({ label: d.label, url: d.url, bytes: d.bytes })),
  };
}

const asText = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });

function mcpServer() {
  const server = new McpServer(
    { name: 'cozu', title: 'Cozu free 3D models', version: '1.0.0', websiteUrl: SITE },
    { instructions: 'Cozu hosts free, game-ready 3D models (GLB, OBJ) under CC BY 4.0. Use search_assets to find a model, get_asset for its files (direct URLs with SHA-256), and get_attribution for the credit line. When you add a model to a project, add its credit line to the project\'s credits (for example CREDITS.md), keeping the link.' },
  );
  server.registerTool('search_assets', {
    title: 'Search models',
    description: 'Find free 3D models by words, category and format. Returns each match with its page, licence, credit line and main download URLs.',
    inputSchema: {
      query: z.string().optional().describe('Words to match, for example "semi truck" or "rigged vehicle"'),
      category: z.string().optional().describe('A category id, for example "vehicles" (see list_categories)'),
      format: z.enum(['GLB', 'OBJ']).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async (args) => {
    const data = await catalog();
    const results = search(data, args);
    return asText({ count: results.length, results, note: results.length ? 'Credit each model you use with its attribution line.' : 'No match yet. New models are added often; see https://cozu.xyz.' });
  });
  server.registerTool('get_asset', {
    title: 'Get a model',
    description: 'The full record of one model: every file with its URL, size and SHA-256, stats, previews and the credit line.',
    inputSchema: { id: z.string().describe('The model id, for example "ravenhall-tractor"') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ id }) => {
    const a = (await catalog()).assets.find((x) => x.id === id);
    return a ? asText(a) : { isError: true, ...asText(`No model with id "${id}". Use search_assets to find ids.`) };
  });
  server.registerTool('get_attribution', {
    title: 'Get the credit line',
    description: 'The credit line to add to a project that uses a model, as text, HTML or Markdown. The link must be kept.',
    inputSchema: { id: z.string(), format: z.enum(['text', 'html', 'markdown']).optional() },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ id, format = 'text' }) => {
    const a = (await catalog()).assets.find((x) => x.id === id);
    if (!a) return { isError: true, ...asText(`No model with id "${id}".`) };
    return asText({ id, license: a.license.id, required: a.attribution.required, format, credit: a.attribution[format], where: 'Wherever the project lists credits: a credits screen, about page, README, CREDITS.md or site footer.' });
  });
  server.registerTool('list_categories', {
    title: 'List categories',
    description: 'The model categories and how many models each holds.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => asText((await catalog()).categories));
  return server;
}

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id, authorization');
  res.set('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');
}

export const api = onRequest({ region: 'us-central1', memory: '256MiB', maxInstances: 10, concurrency: 80, timeoutSeconds: 30, invoker: 'public' }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  const path = req.path.replace(/\/+$/, '') || '/';

  if (path === '/api/v1/search') {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Use GET' }); return; }
    try {
      const data = await catalog();
      const results = search(data, { query: req.query.q, category: req.query.category, format: req.query.format, limit: req.query.limit });
      res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
      res.json({ count: results.length, results });
    } catch (e) {
      res.status(502).json({ error: 'The catalog is unreachable; try again shortly.' });
    }
    return;
  }

  if (path === '/mcp') {
    if (req.method === 'GET') {
      // no server-to-client stream: this server is stateless
      res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. POST JSON-RPC to this URL. Docs: https://cozu.xyz/developers' }, id: null });
      return;
    }
    if (req.method !== 'POST') { res.status(405).set('Allow', 'POST').end(); return; }
    const server = mcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error('mcp', e);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
    }
    return;
  }

  res.status(404).json({ error: 'Not found. Docs: https://cozu.xyz/developers' });
});
