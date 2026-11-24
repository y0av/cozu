// Tells IndexNow (Bing, and the engines it shares with) which pages a deploy changed, so new and updated
// models are crawled within hours instead of whenever the sitemap is next read.
//
//   node scripts/indexnow.mjs snapshot <file>   before the deploy: save the live sitemap's URLs and dates
//   node scripts/indexnow.mjs notify <file>     after the deploy: send every URL that is new, has a newer
//                                               date, or was removed, compared with the snapshot
//
// The key is public by design: IndexNow checks that https://cozu.xyz/<key>.txt holds it.
// Neither step fails the deploy: errors are printed and the script exits 0.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';

const HOST = 'cozu.xyz';
const KEY = '70c87900ebb7907d0d8370d3d2d3e29e';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

const urls = (xml) => new Map(
  [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)].map((m) => [m[1], m[2] ?? '']),
);

async function liveSitemap() {
  const index = await (await fetch(`https://${HOST}/sitemap-index.xml`)).text();
  const all = new Map();
  for (const [, loc] of index.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>/g)) {
    const res = await fetch(loc);
    if (!res.ok) throw new Error(`${loc}: HTTP ${res.status}`);
    for (const [u, d] of urls(await res.text())) all.set(u, d);
  }
  return all;
}

function builtSitemap() {
  const all = new Map();
  for (const f of readdirSync('dist').filter((f) => /^sitemap-\d+\.xml$/.test(f))) {
    for (const [u, d] of urls(readFileSync(`dist/${f}`, 'utf8'))) all.set(u, d);
  }
  return all;
}

async function main() {
  const [cmd, file] = process.argv.slice(2);
  if (!file || !['snapshot', 'notify'].includes(cmd)) throw new Error('usage: indexnow.mjs snapshot|notify <file>');

  if (cmd === 'snapshot') {
    const live = await liveSitemap();
    writeFileSync(file, JSON.stringify(Object.fromEntries(live)));
    console.log(`indexnow: saved ${live.size} live URLs`);
    return;
  }

  if (!existsSync(file)) return console.log('indexnow: no snapshot, nothing sent');
  if (!existsSync(`public/${KEY}.txt`)) throw new Error(`public/${KEY}.txt is missing`);
  const before = new Map(Object.entries(JSON.parse(readFileSync(file, 'utf8'))));
  const after = builtSitemap();
  if (after.size === 0) return console.log('indexnow: built sitemap is empty, nothing sent');

  const changed = [...after].filter(([u, d]) => before.get(u) !== d).map(([u]) => u);
  const removed = [...before.keys()].filter((u) => !after.has(u));
  const urlList = [...changed, ...removed];
  if (urlList.length === 0) return console.log('indexnow: no page changed');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urlList.slice(0, 10000) }),
  });
  console.log(`indexnow: HTTP ${res.status} for ${urlList.length} URLs (${changed.length} new or updated, ${removed.length} removed)`);
  for (const u of urlList) console.log(`  ${u}`);
  if (res.status >= 400) console.log(await res.text());
}

main().catch((e) => console.log(`indexnow: ${e.message}`));
