# Cozu

Free, game-ready 3D models for games, apps and film, at [cozu.xyz](https://cozu.xyz). No account, no key.
Models are under CC BY 4.0: use them in commercial work and credit each one with its line, which links
back to its page on cozu.xyz.

This repository is the site, the API and the MCP server. The models themselves are not here: they live
in Firebase Storage and are listed in `src/content/assets/`.

## For agents and scripts

- MCP server (Streamable HTTP): `https://cozu.xyz/mcp`
  ```
  claude mcp add --transport http cozu https://cozu.xyz/mcp
  ```
  Tools: `search_assets`, `get_asset`, `get_attribution`, `list_categories`.
- JSON API: `https://cozu.xyz/api/v1/assets.json`, `/api/v1/assets/{id}.json`, `/api/v1/search?q=`,
  OpenAPI at `/api/v1/openapi.json`.
- `https://cozu.xyz/llms.txt`, `/llms-full.txt`, and every model as Markdown at `/assets/{id}.md`.

Docs: [cozu.xyz/developers](https://cozu.xyz/developers).

## How it is built

- **Site:** [Astro](https://astro.build), static output. Pages, the JSON API, OpenAPI, Markdown and
  llms.txt are all generated at build time from `src/content/assets/*.json`. Preview renders are pulled
  from Storage at build and turned into AVIF and WebP.
- **Design:** the [design-taste-frontend](https://github.com/Leonxlnx/taste-skill) kit (MIT), copied
  unchanged into `public/kit/`, with the page's own CSS in `src/styles/site.css`. The 3D viewer
  ([model-viewer](https://modelviewer.dev), with the meshopt decoder in `public/vendor/`) loads only when
  someone asks for it.
- **Hosting:** Firebase Hosting. **Files:** Firebase Storage, public read under `assets/`, immutable
  cache headers, one folder per model version.
- **Function:** one Cloud Function (`functions/`, Node 22) serves `/mcp` and `/api/v1/search`. It reads
  the static catalog and caches it for five minutes.

```
src/content/assets/   one JSON file per model (metadata, file list with sizes and SHA-256)
src/lib/              site constants, licences, the catalog and its Markdown form
src/pages/            pages and the generated API endpoints
functions/            the MCP server and search
scripts/              publish-asset.mjs (upload a package to Storage), check-brackets.py
.github/workflows/     deploy.yml: build and deploy to Hosting on every push to main
public/kit/           the design kit (MIT, see public/kit/LICENSE.txt)
```

## Publishing a model

1. Write `src/content/assets/<id>.json` (title, summary, description, licence, stats, previews,
   downloads).
2. Upload the package and record its files:
   ```
   npm run publish-asset -- <id> <package folder> [zip file]
   ```
   This needs `gcloud` signed in to the project. It uploads to `assets/<id>/<version>/` and writes the
   file list, sizes and checksums into the JSON.
3. Commit and push to `main`. GitHub Actions builds the site and deploys it to Firebase Hosting
   (`.github/workflows/deploy.yml`); the sitemap, JSON API, Markdown pages and llms.txt are regenerated
   on every build.

The Cloud Function and Storage rules are deployed by hand: `npm run deploy`.

## Develop

```
npm install
npm run dev
```

## Licence

The code in this repository is MIT (see `LICENSE`). The models are under the licence on their own pages,
CC BY 4.0 unless stated, and are not part of this repository.
