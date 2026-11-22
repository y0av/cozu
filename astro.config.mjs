import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://cozu.xyz',
  // /assets/ravenhall-tractor (no trailing slash), the exact URL the credit lines link to
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'always' },
  // preview images live in Firebase Storage; the build fetches them and writes AVIF/WebP sizes
  image: { remotePatterns: [{ protocol: 'https', hostname: 'firebasestorage.googleapis.com' }] },
  integrations: [sitemap({ filter: (page) => !page.includes('/404') })],
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
});
