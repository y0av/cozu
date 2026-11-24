// Who is calling cozu.xyz: groups the last days of Hosting and Cloud Function requests by network.
// Reads the request logs from Cloud Logging (needs gcloud signed in with read access to the project),
// resolves each address to its network (AS number and owner) through Team Cymru's public DNS service,
// and labels each caller with the same classifier the analytics uses (functions/track.js).
// Addresses are printed only to this terminal; nothing is stored or sent anywhere else.
//
//   node scripts/who-is-calling.mjs [days=7] [--ips]
//
// --ips lists the busiest addresses of each network too.
import { execFileSync } from 'node:child_process';
import { promises as dns } from 'node:dns';
import { classify } from '../functions/track.js';

const days = Number(process.argv.find((a) => /^\d+$/.test(a)) || 7);
const showIps = process.argv.includes('--ips');
const since = new Date(Date.now() - days * 864e5).toISOString();

const raw = execFileSync('gcloud', ['logging', 'read', `httpRequest.remoteIp:* AND timestamp>="${since}"`,
  '--project', 'cozu-a', '--limit', '200000', '--format', 'json(timestamp,httpRequest.remoteIp,httpRequest.userAgent,httpRequest.requestUrl)'],
  { maxBuffer: 1 << 30, encoding: 'utf8' });
const rows = JSON.parse(raw).map((x) => ({ t: x.timestamp, ip: x.httpRequest.remoteIp, ua: x.httpRequest.userAgent || '', url: x.httpRequest.requestUrl || '' }))
  // the site's own checks, and Pub/Sub delivering the Hosting log to the function
  .filter((r) => !/^cozu-/i.test(r.ua) && !r.url.includes('/_ingest/'));

// Team Cymru: <reversed ip>.origin.asn.cymru.com -> "ASN | prefix | CC | ...", AS<n>.asn.cymru.com -> "... | name"
const asnCache = new Map();
// a public resolver: some local resolvers refuse these TXT lookups
const resolver = new dns.Resolver({ timeout: 3000, tries: 2 });
resolver.setServers(['1.1.1.1', '8.8.8.8']);
async function txt(name) {
  for (let i = 0; i < 3; i++) {
    try { return (await resolver.resolveTxt(name)).map((r) => r.join(''))[0] || ''; }
    catch (e) { if (e.code === 'ENOTFOUND' || e.code === 'ENODATA') return ''; }
  }
  return '';
}
async function network(ip) {
  const q = ip.includes(':')
    ? (() => { const full = ip.split('::').length === 2 ? (() => { const [a, b] = ip.split('::').map((s) => (s ? s.split(':') : [])); return [...a, ...Array(8 - a.length - b.length).fill('0'), ...b]; })() : ip.split(':');
      return full.map((h) => h.padStart(4, '0')).join('').split('').reverse().join('.') + '.origin6.asn.cymru.com'; })()
    : ip.split('.').reverse().join('.') + '.origin.asn.cymru.com';
  const [asn, , cc] = (await txt(q)).split('|').map((s) => s.trim());
  if (!asn) return { asn: '?', name: 'unknown network', cc: '' };
  const first = asn.split(' ')[0];
  if (!asnCache.has(first)) asnCache.set(first, ((await txt(`AS${first}.asn.cymru.com`)).split('|')[4] || '').trim());
  return { asn: first, name: asnCache.get(first) || '?', cc };
}

const ips = [...new Set(rows.map((r) => r.ip))];
const net = new Map();
for (let i = 0; i < ips.length; i += 8) {
  const batch = ips.slice(i, i + 8);
  (await Promise.all(batch.map(network))).forEach((n, j) => net.set(batch[j], n));
}

const groups = new Map();
for (const r of rows) {
  const n = net.get(r.ip);
  const key = `AS${n.asn}`;
  const g = groups.get(key) || { n, count: 0, files: 0, ips: new Map(), uas: new Map(), first: r.t, last: r.t };
  g.count++;
  if (r.url.includes('/dl/')) g.files++;
  g.ips.set(r.ip, (g.ips.get(r.ip) || 0) + 1);
  const c = classify(r.ua);
  const label = `${c.traffic}/${c.client_type}/${c.agent}`;
  const u = g.uas.get(label) || { n: 0, ua: r.ua };
  u.n++; g.uas.set(label, u);
  if (r.t < g.first) g.first = r.t;
  if (r.t > g.last) g.last = r.t;
  groups.set(key, g);
}

const top = (m, k) => [...m.entries()].sort((a, b) => (b[1].n ?? b[1]) - (a[1].n ?? a[1])).slice(0, k);
console.log(`${rows.length} requests from ${ips.length} addresses in ${groups.size} networks, last ${days} days\n`);
for (const [key, g] of [...groups.entries()].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`${String(g.count).padStart(6)} req  ${String(g.files).padStart(5)} files  ${key} ${g.n.name} ${g.n.cc}  (${g.ips.size} addresses, ${g.first.slice(0, 16)} to ${g.last.slice(0, 16)})`);
  for (const [label, u] of top(g.uas, 3)) console.log(`         ${String(u.n).padStart(5)}  ${label}  ${u.ua.slice(0, 110)}`);
  if (showIps) for (const [ip, n] of top(g.ips, 5)) console.log(`         ${String(n).padStart(5)}  ${ip}  ${(await resolver.reverse(ip).catch(() => []))[0] || ''}`);
}
