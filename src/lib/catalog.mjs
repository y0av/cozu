// The machine-readable catalog: the JSON API, Markdown pages and llms.txt are all built from here.
import { SITE, NAME, MCP_URL, LICENSES, toApi, attribution, formatBytes, fileUrl, dlUrl, fileOf, assetUrl } from './site.mjs';
import { assets, categories, lastUpdated } from './assets.mjs';

export const API_VERSION = '1';

export function catalog() {
  return {
    name: NAME,
    site: SITE,
    api: `${SITE}/api/v1`,
    mcp: MCP_URL,
    updated: lastUpdated,
    count: assets.length,
    license_note: 'Assets are free for commercial use under the licence in each record (CC BY 4.0 unless stated). Credit each one with its attribution text, keeping the link.',
    categories,
    assets: assets.map(toApi),
  };
}

export const json = (data) => new Response(JSON.stringify(data, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
export const text = (body, type = 'text/plain') => new Response(body, { headers: { 'Content-Type': `${type}; charset=utf-8` } });

/** One asset as Markdown: what an agent needs to pick, fetch and credit it. */
export function assetMarkdown(a) {
  const lic = LICENSES[a.license];
  const credit = attribution(a);
  const s = a.stats || {};
  const rows = a.downloads.map((d) => {
    const f = fileOf(a, d.file);
    return `| ${d.label} | ${formatBytes(f.bytes)} | ${dlUrl(a, d.file)} |`;
  });
  return [
    `# ${a.title}`,
    '',
    `> ${a.summary}`,
    '',
    `- Page: ${assetUrl(a.slug)}`,
    `- JSON: ${SITE}/api/v1/assets/${a.slug}.json`,
    `- Licence: ${lic.name} (${lic.url})${lic.commercialUse ? ', commercial use allowed' : ''}`,
    `- Version: ${a.version}, updated ${a.updated}`,
    `- Formats: ${a.formats.join(', ')}`,
    s.triangles ? `- Triangles: ${s.triangles.toLocaleString('en-US')}${s.lods ? ` (LODs: ${s.lods.map((n) => n.toLocaleString('en-US')).join(', ')})` : ''}` : null,
    s.rigged !== undefined ? `- Rigged: ${s.rigged ? 'yes' : 'no'}` : null,
    s.size_m ? `- Size: ${s.size_m.join(' x ')} m (width x height x length), ${s.up} up, front ${s.front}` : null,
    `- Works in: ${a.engines.join(', ')}`,
    '',
    '## Credit (required)',
    '',
    'Add this line where the project lists its credits, keeping the link:',
    '',
    '```',
    credit.text,
    '```',
    '',
    'HTML:',
    '',
    '```html',
    credit.html,
    '```',
    '',
    '## Downloads',
    '',
    '| File | Size | URL |',
    '|---|---|---|',
    ...rows,
    '',
    `All ${a.files.length} files with SHA-256 checksums are in the JSON record.`,
    '',
    '## About',
    '',
    ...a.description.flatMap((p) => [p, '']),
    `Tags: ${a.tags.join(', ')}`,
    '',
  ].filter((l) => l !== null).join('\n');
}
