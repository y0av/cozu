// Upload an asset package to Firebase Storage and record its files in the catalog.
//
//   node scripts/publish-asset.mjs <slug> <packageDir> [zipFile]
//
// src/content/assets/<slug>.json must exist first, with the hand-written fields (title, summary, version,
// downloads, previews, ...). Every file under <packageDir> is uploaded to
// assets/<slug>/<version>/<path>, the zip (if given) as assets/<slug>/<version>/<slug>-<version>.zip,
// and the entry's `files` list (path, bytes, sha256) is rewritten. Needs `gcloud` logged in to the project.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { BUCKET } from '../src/lib/site.mjs';

const [slug, pkgDir, zipFile] = process.argv.slice(2);
if (!slug || !pkgDir) {
  console.error('usage: node scripts/publish-asset.mjs <slug> <packageDir> [zipFile]');
  process.exit(1);
}
const entryPath = path.join('src/content/assets', `${slug}.json`);
const entry = JSON.parse(fs.readFileSync(entryPath, 'utf8'));
const prefix = `assets/${slug}/${entry.version}/`;

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

const upload = (src, object) => {
  const ext = path.extname(src).toLowerCase();
  const args = ['storage', 'cp', src, `gs://${BUCKET}/${object}`, '--quiet',
    '--cache-control=public, max-age=31536000, immutable', `--content-type=${TYPES[ext] || 'application/octet-stream'}`];
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
  const rel = `${slug}-${entry.version}.zip`;
  process.stdout.write(`${rel} ... `);
  upload(zipFile, prefix + rel);
  files.push(record(zipFile, rel));
  console.log('ok');
}

const missing = [...(entry.downloads || []).map((d) => d.file), ...(entry.previews || []).map((p) => p.file), entry.viewer, entry.readme]
  .filter(Boolean).filter((f) => !files.some((x) => x.path === f));
if (missing.length) console.warn('WARNING: the entry names files that were not uploaded:', missing.join(', '));

entry.storagePrefix = prefix;
entry.files = files;
fs.writeFileSync(entryPath, JSON.stringify(entry, null, 2) + '\n');
console.log(`${files.length} files in gs://${BUCKET}/${prefix}; ${entryPath} updated`);
