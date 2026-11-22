// Fetches the catalog from Firebase Storage into src/content/assets/ before every build and dev run.
//
// The catalog lives in Storage, not in this repo: one JSON entry per model at catalog/<id>.json, written by
// scripts/publish-asset.mjs. The folder src/content/assets/ is generated and gitignored.
// The build fails when the catalog cannot be read or is empty, so a deploy never ships a site without models.
// Offline work: OFFLINE_CATALOG=1 keeps whatever is already in src/content/assets/.
import fs from 'node:fs';
import { BUCKET } from '../src/lib/site.mjs';

const dir = new URL('../src/content/assets/', import.meta.url);
fs.mkdirSync(dir, { recursive: true });
if (process.env.OFFLINE_CATALOG) {
  console.log('catalog: OFFLINE_CATALOG set, using the local copy');
  process.exit(0);
}

const API = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o`;
const names = [];
let page = '';
do {
  const res = await fetch(`${API}?prefix=catalog%2F&delimiter=%2F${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`);
  if (!res.ok) throw new Error(`catalog: listing failed with HTTP ${res.status}`);
  const body = await res.json();
  names.push(...(body.items || []).map((i) => i.name).filter((n) => /^catalog\/[a-z0-9-]+\.json$/.test(n)));
  page = body.nextPageToken || '';
} while (page);
if (!names.length) throw new Error('catalog: no entries in Storage under catalog/; refusing to build an empty site');

const entries = await Promise.all(names.map(async (name) => {
  const res = await fetch(`${API}/${encodeURIComponent(name)}?alt=media`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`catalog: ${name} returned HTTP ${res.status}`);
  const entry = await res.json();
  const id = name.slice('catalog/'.length, -'.json'.length);
  if (entry.slug !== id) throw new Error(`catalog: ${name} has slug "${entry.slug}"`);
  return [id, entry];
}));

for (const f of fs.readdirSync(dir)) if (f.endsWith('.json')) fs.rmSync(new URL(f, dir));
for (const [id, entry] of entries) fs.writeFileSync(new URL(`${id}.json`, dir), JSON.stringify(entry, null, 2) + '\n');
console.log(`catalog: ${entries.length} entries from gs://${BUCKET}/catalog/ (${entries.map(([id]) => id).join(', ')})`);
