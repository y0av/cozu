// Publish a model: upload its package to Firebase Storage, write its catalog entry to Storage, and start a deploy.
//
//   node scripts/publish-asset.mjs <entry.json> <packageDir> [zipFile] [--no-deploy] [--force]
//
// <entry.json> is the model's catalog entry, kept with the model (for example <asset>/release/catalog-entry.json),
// with the hand-written fields (slug, title, summary, version, downloads, previews, ...). Nothing is written to
// this repo: the repo holds the site only.
//
// 1. Every file under <packageDir> goes to assets/<slug>/<version>/<path>, the zip (if given) as
//    assets/<slug>/<version>/<slug>-<version>.zip. Uploads are cached as immutable, so a version that is already
//    in Storage is refused; bump the version instead (--force re-uploads, only for a run that broke halfway).
// 2. The entry's `files` (path, bytes, sha256) and `storagePrefix` are filled in, saved back to <entry.json>, and
//    uploaded to catalog/<slug>.json, which the site build reads (scripts/fetch-catalog.mjs).
// 3. Unless --no-deploy, the GitHub Actions deploy workflow is started, which rebuilds the site with the new entry.
// Needs `gcloud` signed in with write access to the bucket, and `gh` signed in for the deploy.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { BUCKET } from '../src/lib/site.mjs';
import { movingProblems } from './catalog-checks.mjs';

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const [entryPath, pkgDir, zipFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!entryPath || !pkgDir) {
  console.error('usage: node scripts/publish-asset.mjs <entry.json> <packageDir> [zipFile] [--no-deploy] [--force]');
  process.exit(1);
}
const entry = JSON.parse(fs.readFileSync(entryPath, 'utf8'));
const { slug, version } = entry;
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug || '')) throw new Error(`bad slug "${slug}"`);
if (!/^\d+\.\d+\.\d+$/.test(version || '')) throw new Error(`bad version "${version}"`);
const prefix = `assets/${slug}/${version}/`;
const movingBad = movingProblems(entry.moving);
if (movingBad.length) throw new Error(movingBad.join('; '));

const ls = spawnSync('gcloud', ['storage', 'ls', `gs://${BUCKET}/${prefix}`], { encoding: 'utf8' });
if (ls.status === 0 && ls.stdout.trim() && !flags.has('--force')) {
  console.error(`gs://${BUCKET}/${prefix} already exists. Published versions are immutable: bump the version, the "updated" date and the CHANGELOG.`);
  process.exit(1);
}

const TYPES = {
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.obj': 'model/obj', '.mtl': 'text/plain; charset=utf-8',
  '.fbx': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.zip': 'application/zip',
};

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  return d.isDirectory() ? walk(p) : [p];
});

const upload = (src, object, cache = 'public, max-age=31536000, immutable') => {
  const ext = path.extname(src).toLowerCase();
  const args = ['storage', 'cp', src, `gs://${BUCKET}/${object}`, '--quiet',
    `--cache-control=${cache}`, `--content-type=${TYPES[ext] || 'application/octet-stream'}`];
  // downloads of whole files save under their own name instead of opening in the browser
  if (['.zip', '.glb', '.obj', '.fbx'].includes(ext)) args.push(`--content-disposition=attachment; filename="${path.basename(object)}"`);
  execFileSync('gcloud', args, { stdio: ['ignore', 'ignore', 'inherit'] });
};

const record = (src, rel) => {
  const buf = fs.readFileSync(src);
  return { path: rel, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
};

const files = [];
for (const src of walk(pkgDir).sort()) {
  const rel = path.relative(pkgDir, src).split(path.sep).join('/');
  process.stdout.write(`${rel} ... `);
  upload(src, prefix + rel);
  files.push(record(src, rel));
  console.log('ok');
}
if (zipFile) {
  const rel = `${slug}-${version}.zip`;
  process.stdout.write(`${rel} ... `);
  upload(zipFile, prefix + rel);
  files.push(record(zipFile, rel));
  console.log('ok');
}

const missing = [...(entry.downloads || []).map((d) => d.file), ...(entry.previews || []).map((p) => p.file), entry.viewer, entry.readme]
  .filter(Boolean).filter((f) => !files.some((x) => x.path === f));
if (missing.length) {
  console.error('ERROR: the entry names files that were not uploaded:', missing.join(', '));
  console.error('The catalog entry was not published. Fix the entry or the package and run again with --force.');
  process.exit(1);
}

entry.storagePrefix = prefix;
entry.files = files;
const json = JSON.stringify(entry, null, 2) + '\n';
fs.writeFileSync(entryPath, json);
// a local copy for `npm run preview` (src/content/assets/ is generated and gitignored)
const local = new URL(`../src/content/assets/${slug}.json`, import.meta.url);
fs.mkdirSync(new URL('.', local), { recursive: true });
fs.writeFileSync(local, json);
upload(entryPath, `catalog/${slug}.json`, 'no-cache, max-age=0');
console.log(`${files.length} files in gs://${BUCKET}/${prefix}; catalog entry at gs://${BUCKET}/catalog/${slug}.json`);

if (!flags.has('--no-deploy')) {
  execFileSync('gh', ['workflow', 'run', 'deploy.yml', '--repo', 'y0av/cozu', '--ref', 'main'], { stdio: 'inherit' });
  console.log('Deploy started: gh run list --repo y0av/cozu --workflow deploy.yml --limit 1');
}
