// Cozu's one Cloud Function: the MCP server (POST /mcp, Streamable HTTP, stateless, JSON responses),
// GET /api/v1/search, and the download redirect GET /dl/<asset>/<version>/<file> (counts the download, then
// sends the caller to the file in Storage). All read the static catalog the site publishes, cached in memory
// for five minutes. POST /_ingest/hosting takes the Hosting request log from Pub/Sub for analytics (track.js).
// Deployed by .github/workflows/deploy.yml on every push to main that changes this folder.
import { timingSafeEqual } from 'node:crypto';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { track, caller, hostingRequest, CID } from './track.js';

// GA_MP_SECRET: the Measurement Protocol key of the site's Analytics stream.
// INGEST_TOKEN: shared with the Pub/Sub push subscription that delivers the Hosting request log.
const GA_MP_SECRET = defineSecret('GA_MP_SECRET');
const INGEST_TOKEN = defineSecret('INGEST_TOKEN');
const BUCKET = 'cozu-a.firebasestorage.app';

const SITE = 'https://cozu.xyz';
const CATALOG_URL = process.env.CATALOG_URL || 'https://cozu-a.web.app/api/v1/assets.json';
const TTL = 5 * 60 * 1000;
let cache = { at: 0, data: null };

async function catalog() {
  if (cache.data && Date.now() - cache.at < TTL) return cache.data;
  // the name keeps this request out of the analytics (the Hosting log sink drops it)
  const res = await fetch(CATALOG_URL, { headers: { accept: 'application/json', 'user-agent': 'cozu-internal/1' } });
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

// download links handed out by the MCP server say so, to count downloads that came through it
const tagVia = (text, via) => text.replace(/(https:\/\/cozu\.xyz\/dl\/[^"?\s]+)/g, `$1?via=${via}`);
const viaMcp = (text) => tagVia(text, 'mcp');
const asText = (obj) => ({ content: [{ type: 'text', text: viaMcp(typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2)) }] });

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

/** What an MCP request asks for, for the analytics: one entry per JSON-RPC call in it. */
function mcpCalls(body) {
  const list = Array.isArray(body) ? body : [body];
  return list.filter((m) => m && typeof m.method === 'string' && !m.method.startsWith('notifications/')).map((m) => ({
    mcp_method: m.method,
    tool: m.method === 'tools/call' ? m.params?.name : undefined,
    query: m.params?.arguments?.query ?? m.params?.arguments?.id,
    mcp_client: m.method === 'initialize' && m.params?.clientInfo ? `${m.params.clientInfo.name || '?'} ${m.params.clientInfo.version || ''}`.trim() : undefined,
  }));
}

const VIA = new Set(['site', 'mcp', 'api', 'llms', 'md', 'skill']);
const SAFE = /^[a-z0-9][a-z0-9-]*$/;

/** GET /dl/<asset>/<version>/<path>: count the download, then redirect to the file in Storage. */
async function download(req, res, path) {
  const [, , slug, version, ...rest] = path.split('/');
  const file = rest.map((p) => { try { return decodeURIComponent(p); } catch { return ''; } }).join('/');
  if (!SAFE.test(slug || '') || !/^[0-9A-Za-z.-]+$/.test(version || '') || !file || file.split('/').some((p) => !p || p === '.' || p === '..')) {
    res.status(404).json({ error: 'Not found. File URLs are in each asset record: https://cozu.xyz/developers' });
    return;
  }
  let asset;
  try { asset = (await catalog()).assets.find((a) => a.id === slug); } catch { /* catalog down: still redirect */ }
  if (asset === undefined && cache.data) { res.status(404).json({ error: `No model with id "${slug}".` }); return; }
  const target = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(`assets/${slug}/${version}/${file}`)}?alt=media`;
  const who = caller(req);
  const via = VIA.has(req.query.via) ? req.query.via : (who.referrer || '').startsWith('https://cozu.xyz') ? 'site' : 'direct';
  const known = asset?.downloads.find((d) => d.path === file);
  // js=1 or the Analytics ids: the link was clicked on a cozu.xyz page that ran its script (Base.astro)
  const page = req.query.js === '1' || CID.test(req.query.cid || '');
  await track(GA_MP_SECRET.value(), { ...who, page, cid: req.query.cid, sid: req.query.sid }, 'download', {
    asset: slug, version, file: file.split('/').pop(), file_format: (file.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase(),
    download: known ? known.label : 'file', via, bytes: asset?.files.find((f) => f.path === file)?.bytes,
  });
  res.set('Cache-Control', 'no-store');
  res.redirect(302, target);
}

function sameToken(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
}

export const api = onRequest({ region: 'us-central1', memory: '256MiB', maxInstances: 10, concurrency: 80, timeoutSeconds: 30, invoker: 'public', secrets: [GA_MP_SECRET, INGEST_TOKEN] }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  const path = req.path.replace(/\/+$/, '') || '/';

  if (path.startsWith('/dl/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.status(405).set('Allow', 'GET, HEAD').end(); return; }
    await download(req, res, path);
    return;
  }

  if (path === '/_ingest/hosting') {
    // Pub/Sub push: always answer 204 once the token checks out, so a bad entry is not redelivered for days
    if (req.method !== 'POST' || !sameToken(req.query.token, INGEST_TOKEN.value())) { res.status(403).end(); return; }
    try {
      const data = req.body?.message?.data;
      if (data) await hostingRequest(GA_MP_SECRET.value(), JSON.parse(Buffer.from(data, 'base64').toString('utf8')));
    } catch (e) {
      console.error('ingest', e);
    }
    res.status(204).end();
    return;
  }

  if (path === '/api/v1/search') {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Use GET' }); return; }
    try {
      // a caller that names itself (via=skill) gets download URLs tagged the same way, so its downloads count too
      const via = VIA.has(req.query.via) ? req.query.via : undefined;
      const data = await catalog();
      const results = search(data, { query: req.query.q, category: req.query.category, format: req.query.format, limit: req.query.limit });
      await track(GA_MP_SECRET.value(), caller(req), 'api_search', { query: req.query.q, category: req.query.category, file_format: req.query.format, results: results.length, via }, 'agent');
      res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
      res.json(via ? JSON.parse(tagVia(JSON.stringify({ count: results.length, results }), via)) : { count: results.length, results });
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
    const who = caller(req);
    const counted = Promise.all(mcpCalls(req.body).map((c) => track(GA_MP_SECRET.value(), who, 'mcp_call', c, 'agent')));
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
    await counted;
    return;
  }

  res.status(404).json({ error: 'Not found. Docs: https://cozu.xyz/developers' });
});
