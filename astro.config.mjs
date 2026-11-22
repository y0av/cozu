import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readdirSync, readFileSync } from 'node:fs';

// the catalog, for the sitemap's last-modified dates: an asset page takes its asset's date, a category its
// newest asset's, every other page the newest date in the catalog
const dir = new URL('./src/content/assets/', import.meta.url);
const assets = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
const newest = (list) => list.reduce((m, a) => (a.updated > m ? a.updated : m), '2026-01-01');

export default defineConfig({
  site: 'https://cozu.xyz',
  // /assets/ravenhall-tractor (no trailing slash), the exact URL the credit lines link to
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'always' },
  // preview images live in Firebase Storage; the build fetches them and writes AVIF/WebP sizes
  image: { remotePatterns: [{ protocol: 'https', hostname: 'firebasestorage.googleapis.com' }] },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/404'),
      serialize(item) {
        const path = new URL(item.url).pathname;
        const asset = path.match(/^\/assets\/([^/]+)$/);
        const cat = path.match(/^\/categories\/([^/]+)$/);
        const date = asset ? assets.find((a) => a.slug === asset[1])?.updated
          : cat ? newest(assets.filter((a) => a.category === cat[1]))
          : newest(assets);
        if (date) item.lastmod = new Date(`${date}T00:00:00Z`).toISOString();
        return item;
      },
    }),
  ],
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
});
