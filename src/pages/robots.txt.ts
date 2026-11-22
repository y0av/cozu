import { SITE } from '../lib/site.mjs';
import { text } from '../lib/catalog.mjs';
export const GET = () => text(`User-agent: *\nAllow: /\nDisallow: /dl/\n\nSitemap: ${SITE}/sitemap-index.xml\n`);
