// Server-side analytics: who is calling (a person, an agent or a bot, told apart by the User-Agent) and
// what they did, sent to the site's Google Analytics property through the Measurement Protocol, and
// written to Cloud Logging as one structured line per event.
// Browsers running the page are counted by the page's own tag; this covers everything that never runs it:
// the MCP server, the search API, downloads, and (through the Hosting request log) crawlers and agents
// fetching pages, llms.txt, the JSON catalog and the Markdown pages.
import { createHash } from 'node:crypto';

export const MEASUREMENT_ID = 'G-XHC8V9PXXD';

// First match wins, so the specific names come before the generic library names. Each rule:
// [client_type, traffic, names]. traffic is the coarse split: human, agent or bot.
const RULES = [
  // an AI assistant fetching a page live for a person, or a coding agent at work
  ['ai_agent', 'agent', ['ChatGPT-User', 'ChatGPT-Agent', 'Claude-User', 'Claude-Code', 'claude-code', 'Perplexity-User',
    'MistralAI-User', 'meta-externalfetcher', 'Google-Agent', 'Gemini-User', 'Manus', 'Devin', 'Cursor', 'GitHubCopilot', 'Copilot',
    'Codex', 'Windsurf', 'Cline', 'aider', 'Kilo-Code']],
  // AI companies indexing or collecting pages
  ['ai_crawler', 'bot', ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'Claude-SearchBot', 'Claude-Web', 'anthropic-ai', 'PerplexityBot',
    'Bytespider', 'CCBot', 'meta-externalagent', 'Amazonbot', 'cohere-training-data-crawler', 'cohere-ai', 'Diffbot', 'YouBot',
    'AI2Bot', 'Ai2Bot', 'Timpibot', 'ImagesiftBot', 'omgili', 'DuckAssistBot', 'GoogleOther', 'Google-CloudVertexBot',
    'Applebot-Extended', 'PanguBot', 'FirecrawlAgent', 'TavilyBot', 'Exabot-AI', 'iaskspider', 'Webzio']],
  ['search_crawler', 'bot', ['Googlebot', 'Google-InspectionTool', 'Storebot-Google', 'AdsBot-Google', 'bingbot', 'BingPreview',
    'Applebot', 'YandexBot', 'YandexImages', 'Baiduspider', 'DuckDuckBot', 'Slurp', 'SeznamBot', 'Qwantbot', 'MojeekBot', 'Yeti',
    'Sogou', 'Exabot', 'PetalBot', 'archive.org_bot', 'ia_archiver']],
  ['seo_crawler', 'bot', ['AhrefsBot', 'AhrefsSiteAudit', 'SemrushBot', 'SiteAuditBot', 'MJ12bot', 'DotBot', 'DataForSeoBot',
    'BLEXBot', 'serpstatbot', 'Screaming Frog', 'rogerbot', 'barkrowler', 'Sitebulb']],
  ['link_preview', 'bot', ['facebookexternalhit', 'Facebot', 'Twitterbot', 'Slackbot', 'Slack-ImgProxy', 'Discordbot',
    'LinkedInBot', 'TelegramBot', 'WhatsApp', 'redditbot', 'Pinterestbot', 'Embedly', 'SkypeUriPreview', 'Iframely', 'Mastodon',
    'Cardyb', 'Bluesky']],
  ['monitor', 'bot', ['UptimeRobot', 'Pingdom', 'StatusCake', 'BetterStack', 'Better Uptime', 'Site24x7',
    'GoogleStackdriverMonitoring', 'Checkly', 'Uptime-Kuma', 'Datadog']],
  ['headless', 'agent', ['HeadlessChrome', 'PhantomJS', 'Puppeteer', 'Playwright', 'Selenium', 'Chrome-Lighthouse', 'PTST', 'GTmetrix']],
  // HTTP libraries and command-line tools: scripts, MCP clients, agents' fetch tools
  ['script', 'agent', ['curl', 'Wget', 'python-requests', 'python-httpx', 'aiohttp', 'Python-urllib', 'Scrapy', 'node-fetch',
    'undici', 'axios', 'Go-http-client', 'okhttp', 'Apache-HttpClient', 'libwww-perl', 'PostmanRuntime', 'insomnia', 'HTTPie',
    'reqwest', 'Deno', 'Bun', 'Dart', 'Java', 'Ruby', 'PHP', 'Python', 'node']],
];
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const COMPILED = RULES.map(([type, traffic, names]) => [type, traffic, new RegExp(`(?:^|[^A-Za-z0-9])(${names.map(escape).join('|')})(?![A-Za-z])`, 'i')]);
const GENERIC_BOT = /bot\b|bot\/|crawl|spider|scrap|fetcher|monitor|checker|validator|preview/i;
const BROWSERS = [['Edge', /Edg(?:e|A|iOS)?\//], ['Opera', /OPR\//], ['Samsung', /SamsungBrowser\//], ['Firefox', /Firefox\/|FxiOS\//],
  ['Chrome', /Chrome\/|CriOS\//], ['Safari', /Safari\//]];

/** Tells a person, an agent and a bot apart by the User-Agent. Spoofed browser strings pass as people. */
export function classify(ua = '') {
  if (!ua) return { traffic: 'bot', client_type: 'unknown', agent: '(none)' };
  for (const [client_type, traffic, re] of COMPILED) {
    const m = ua.match(re);
    if (m) return { traffic, client_type, agent: m[1] };
  }
  if (GENERIC_BOT.test(ua)) return { traffic: 'bot', client_type: 'other_bot', agent: (ua.match(/[\w.-]*(?:bot|crawler|spider)[\w.-]*/i) || [ua])[0].slice(0, 60) };
  if (/^Mozilla\/5\.0 /.test(ua)) {
    const b = BROWSERS.find(([, re]) => re.test(ua));
    if (b) return { traffic: 'human', client_type: 'browser', agent: b[0] };
  }
  return { traffic: 'bot', client_type: 'unknown', agent: ua.split(/[\s/;(]/)[0].slice(0, 60) || '(none)' };
}

// A stable pseudonymous id for a caller without the page's cookie: a hash of address and User-Agent,
// salted with a server secret. The address itself never leaves the function.
function pseudoId(salt, ip, ua) {
  const h = createHash('sha256').update(`${salt}|${ip}|${ua}`).digest();
  return `${h.readUInt32BE(0)}.${h.readUInt32BE(4)}`;
}
const session30 = () => Math.floor(Date.now() / 1_800_000) * 1800;   // a 30-minute bucket stands in for a session
const CID = /^\d{1,12}\.\d{1,12}$/;
const SID = /^\d{1,12}$/;

function params(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = typeof v === 'number' ? v : String(v).slice(0, 100);   // Analytics truncates longer values
  }
  return out;
}

/**
 * Record one event. `who` describes the caller: ua, ip, and the page's Analytics ids (cid, sid) when a
 * browser passed them along (download links do), so the event joins that visitor's session.
 * `force` overrides the traffic class (an MCP call is an agent even when it carries a browser string).
 */
export async function track(secret, who, name, extra = {}, force) {
  const c = classify(who.ua);
  if (force && c.traffic === 'human') c.traffic = force;
  const ev = params({ traffic: c.traffic, client_type: c.client_type, agent: c.agent, page_location: who.url, page_referrer: who.referrer, ...extra });
  console.log(JSON.stringify({ severity: 'INFO', message: `track ${name}`, event: name, ...ev, ua: (who.ua || '').slice(0, 300) }));
  if (!secret || secret === 'unset') return;
  const body = {
    client_id: CID.test(who.cid || '') ? who.cid : pseudoId(secret, who.ip || '', who.ua || ''),
    user_properties: { traffic: { value: c.traffic }, client_type: { value: c.client_type } },
    events: [{ name, params: { ...ev, session_id: SID.test(who.sid || '') ? Number(who.sid) : session30(), engagement_time_msec: 1 } }],
  };
  // awaited, with a cap: a Cloud Function may be paused as soon as it has answered
  await Promise.race([
    fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${encodeURIComponent(secret)}`, { method: 'POST', body: JSON.stringify(body) }).catch(() => {}),
    new Promise((r) => setTimeout(r, 1500)),
  ]);
}

/** The caller of an HTTP request reaching the function through Hosting. */
export function caller(req) {
  return {
    ua: req.get('user-agent') || '',
    ip: (req.get('x-forwarded-for') || req.ip || '').split(',')[0].trim(),
    referrer: req.get('referer') || undefined,
    url: `https://cozu.xyz${req.originalUrl.split('?')[0]}`,
  };
}

const FILE = /\.(txt|json|md|xml)$/;

/**
 * One Hosting request-log entry (delivered by Pub/Sub). People's page views are skipped: the page tag
 * counts those with far more detail. Everyone's fetches of the text files (llms.txt, JSON, Markdown,
 * sitemap, robots) are kept, as are bots' and agents' page fetches.
 */
export async function hostingRequest(secret, entry) {
  const h = entry?.httpRequest;
  if (!h?.requestUrl) return;
  const status = Number(h.status) || 0;
  if (status >= 300 && status < 400 && status !== 304) return;   // redirects: the request that follows is logged too
  const url = new URL(h.requestUrl);
  const kind = FILE.test(url.pathname) ? 'file' : 'page';
  const who = { ua: h.userAgent || '', ip: h.remoteIp || '', referrer: h.referer || undefined, url: `https://cozu.xyz${url.pathname}` };
  if (kind === 'page' && classify(who.ua).traffic === 'human') return;
  await track(secret, who, 'server_request', { path: url.pathname, kind, status, host: url.hostname });
}
