// Set fields on published catalog entries without publishing a new version, for facts the package does not change
// (today `moving`). The package files, version, dates and file list stay as they are.
//
//   node scripts/patch-catalog.mjs <dir> [--dry-run] [--no-deploy]
//
// <dir> holds <slug>.json files, each an object of fields to set on catalog/<slug>.json in Storage; only the fields
// in PATCHABLE may be set. Each entry is read from Storage, changed, checked and written back, then one deploy
// starts. --dry-run prints what would change and writes nothing. Needs `gcloud` with write access to the bucket
// and `gh` for the deploy.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BUCKET } from '../src/lib/site.mjs';
import { movingProblems } from './catalog-checks.mjs';

const PATCHABLE = new Set(['moving']);
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const [dir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!dir) { console.error('usage: node scripts/patch-catalog.mjs <dir> [--dry-run] [--no-deploy]'); process.exit(1); }

const API = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-catalog-'));
let changed = 0;
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
  const slug = f.slice(0, -5);
  const patch = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const bad = Object.keys(patch).filter((k) => !PATCHABLE.has(k));
  if (bad.length) throw new Error(`${f}: only ${[...PATCHABLE].join(', ')} may be set, not ${bad.join(', ')}`);
  const res = await fetch(`${API}/${encodeURIComponent(`catalog/${slug}.json`)}?alt=media`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`catalog/${slug}.json: HTTP ${res.status}`);
  const entry = await res.json();
  if (entry.slug !== slug) throw new Error(`catalog/${slug}.json has slug "${entry.slug}"`);
  const next = { ...entry, ...patch };
  const problems = movingProblems(next.moving);
  if (problems.length) throw new Error(`${slug}: ${problems.join('; ')}`);
  if (JSON.stringify(next) === JSON.stringify(entry)) { console.log(`${slug}: unchanged`); continue; }
  console.log(`${slug}: ${Object.keys(patch).join(', ')}${next.moving ? ` (${next.moving.summary}, ${next.moving.parts.length} parts)` : ''}`);
  changed++;
  if (flags.has('--dry-run')) continue;
  const out = path.join(tmp, `${slug}.json`);
  fs.writeFileSync(out, JSON.stringify(next, null, 2) + '\n');
  execFileSync('gcloud', ['storage', 'cp', out, `gs://${BUCKET}/catalog/${slug}.json`, '--quiet',
    '--cache-control=no-cache, max-age=0', '--content-type=application/json'], { stdio: ['ignore', 'ignore', 'inherit'] });
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${changed} entries ${flags.has('--dry-run') ? 'would change' : 'changed'}`);
if (changed && !flags.has('--dry-run') && !flags.has('--no-deploy')) {
  execFileSync('gh', ['workflow', 'run', 'deploy.yml', '--repo', 'y0av/cozu', '--ref', 'main'], { stdio: 'inherit' });
  console.log('Deploy started: gh run list --repo y0av/cozu --workflow deploy.yml --limit 1');
}
