// Shared by the pages, the static API and scripts/publish-asset.mjs (plain Node, so no Vite-only imports here).

export const SITE = 'https://cozu.xyz';
export const NAME = 'Cozu';
export const BUCKET = 'cozu-a.firebasestorage.app';
export const REPO = 'https://github.com/y0av/cozu';
export const MCP_URL = `${SITE}/mcp`;
/** Google Analytics (GA4) web stream of the site; the Cloud Function reports to it as well (functions/track.js). */
export const GA_ID = 'G-XHC8V9PXXD';

export const LICENSES = {
  'CC-BY-4.0': {
    id: 'CC-BY-4.0', short: 'CC BY 4.0', name: 'Creative Commons Attribution 4.0 International',
    url: 'https://creativecommons.org/licenses/by/4.0/', attributionRequired: true, commercialUse: true,
  },
  'CC0-1.0': {
    id: 'CC0-1.0', short: 'CC0 1.0', name: 'Creative Commons Zero 1.0 (public domain)',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/', attributionRequired: false, commercialUse: true,
  },
};

export const assetPath = (slug) => `/assets/${slug}`;
export const assetUrl = (slug) => SITE + assetPath(slug);

/** Public download URL of a file in an asset's Storage folder. */
export const fileUrl = (entry, rel) =>
  `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(entry.storagePrefix + rel)}?alt=media`;

/** Download URL of a file: through the site's /dl/ redirect, which counts the download (functions/index.js). */
export const dlUrl = (entry, rel) => `${SITE}/dl/${entry.slug}/${entry.version}/${rel.split('/').map(encodeURIComponent).join('/')}`;

export const fileOf = (entry, rel) => entry.files.find((f) => f.path === rel);

export function formatBytes(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`;
  return `${n} B`;
}

/** The credit line a user must copy, in three forms. */
export function attribution(entry) {
  const lic = LICENSES[entry.license];
  const url = assetUrl(entry.slug);
  return {
    required: lic.attributionRequired,
    text: `${entry.title} by ${NAME} (${url}), ${lic.short}`,
    html: `<a href="${url}">${entry.title}</a> by <a href="${SITE}">${NAME}</a>, <a href="${lic.url}">${lic.short}</a>`,
    markdown: `[${entry.title}](${url}) by [${NAME}](${SITE}), [${lic.short}](${lic.url})`,
  };
}

/** The public JSON form of a catalog entry (API, MCP, llms-full.txt). */
export function toApi(entry) {
  const lic = LICENSES[entry.license];
  // previews, the web viewer model and the README are for display: direct Storage URLs. Downloads go through /dl/.
  const file = (rel) => ({ path: rel, url: fileUrl(entry, rel), ...pick(fileOf(entry, rel), ['bytes', 'sha256']) });
  const dl = (rel) => ({ path: rel, url: dlUrl(entry, rel), ...pick(fileOf(entry, rel), ['bytes', 'sha256']) });
  return {
    id: entry.slug,
    title: entry.title,
    summary: entry.summary,
    description: entry.description,
    type: entry.type,
    category: entry.category,
    tags: entry.tags,
    version: entry.version,
    published: entry.published,
    updated: entry.updated,
    page: assetUrl(entry.slug),
    license: { id: lic.id, name: lic.name, url: lic.url, attributionRequired: lic.attributionRequired, commercialUse: lic.commercialUse },
    attribution: attribution(entry),
    formats: entry.formats,
    engines: entry.engines,
    stats: entry.stats,
    previews: entry.previews.map((p) => ({ ...file(p.file), alt: p.alt })),
    viewer: entry.viewer ? file(entry.viewer) : null,
    readme: entry.readme ? file(entry.readme) : null,
    downloads: entry.downloads.map((d) => ({ label: d.label, description: d.note, ...dl(d.file) })),
    files: entry.files.map((f) => ({ path: f.path, url: dlUrl(entry, f.path), bytes: f.bytes, sha256: f.sha256 })),
  };
}

function pick(o, keys) {
  return o ? Object.fromEntries(keys.map((k) => [k, o[k]])) : {};
}
