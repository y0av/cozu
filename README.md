# Cozu

Free, game-ready 3D models for games, apps and film, at [cozu.xyz](https://cozu.xyz). No account, no key.
Models are under CC BY 4.0: use them in commercial work and credit each one with its line, which links
back to its page on cozu.xyz.

This repository is the site, the API and the MCP server. The models are not here: their files and their
catalog entries live in Firebase Storage, and publishing a model changes nothing in this repo.

## For agents and scripts

- MCP server (Streamable HTTP): `https://cozu.xyz/mcp`
  ```
  claude mcp add --transport http cozu https://cozu.xyz/mcp
  ```
  Tools: `search_assets`, `get_asset`, `get_attribution`, `list_categories`.
- Agent skill (`skills/cozu/SKILL.md`): when to use Cozu, which file to pick per engine, and how to credit.
  ```
  npx skills add y0av/cozu
  ```
- JSON API: `https://cozu.xyz/api/v1/assets.json`, `/api/v1/assets/{id}.json`, `/api/v1/search?q=`,
  OpenAPI at `/api/v1/openapi.json`.
- `https://cozu.xyz/llms.txt`, `/llms-full.txt`, and every model as Markdown at `/assets/{id}.md`.

Docs: [cozu.xyz/developers](https://cozu.xyz/developers).

## How it is built

- **Site:** [Astro](https://astro.build), static output. Pages, the JSON API, OpenAPI, Markdown and
  llms.txt are all generated at build time from the catalog, which `scripts/fetch-catalog.mjs` downloads
  from Storage into `src/content/assets/` (gitignored) before every build. Preview renders are pulled
  from Storage at build and turned into AVIF and WebP.
- **Design:** the [design-taste-frontend](https://github.com/Leonxlnx/taste-skill) kit (MIT), copied
  unchanged into `public/kit/`, with the page's own CSS in `src/styles/site.css`. The 3D viewer
  ([model-viewer](https://modelviewer.dev), with the meshopt decoder in `public/vendor/`) loads only when
  someone asks for it.
- **Hosting:** Firebase Hosting. **Files:** Firebase Storage, public read under `assets/` (immutable
  cache headers, one folder per model version) and `catalog/` (one JSON entry per model).
- **Function:** one Cloud Function (`functions/`, Node 22) serves `/mcp` and `/api/v1/search`. It reads
  the static catalog and caches it for five minutes.

```
src/content/assets/   generated: the catalog from Storage, one JSON file per model
src/lib/              site constants, licences, the catalog and its Markdown form
src/pages/            pages and the generated API endpoints
functions/            the MCP server and search
scripts/              publish-asset.mjs (publish a model), fetch-catalog.mjs (catalog for the build), check-brackets.py
.github/workflows/     deploy.yml: deploy Hosting and the Cloud Function on every push to main
public/kit/           the design kit (MIT, see public/kit/LICENSE.txt)
```

## Publishing a model

Nothing is committed. The model's catalog entry (title, summary, description, licence, stats, previews,
downloads) stays with the model's own files, and one command publishes it:

```
npm run publish-asset -- <entry.json> <package folder> [zip file]
```

It uploads the package to `assets/<id>/<version>/` (a version already in Storage is refused: bump it),
fills the entry's file list with sizes and checksums, writes the entry to `catalog/<id>.json`, and starts
the deploy workflow. That needs `gcloud` signed in with write access to the bucket and `gh` signed in.

GitHub Actions (`.github/workflows/deploy.yml`) builds and deploys the site on every push to `main` and on
demand, and deploys the Cloud Function when its code changed. The sitemap, JSON API, Markdown pages and
llms.txt are regenerated on every build. The build stops if the catalog cannot be read or is empty.

To take a model down, delete `catalog/<id>.json` and run the workflow (`gh workflow run deploy.yml`).
Storage rules are deployed by hand: `npm run deploy`.

## Analytics

One Google Analytics property sees people, agents and bots, each hit labelled with a `traffic` user
property (`human`, `agent` or `bot`) and a `client_type` (browser, ai_agent, ai_crawler, search_crawler,
script, headless, link_preview, ...).

- **Pages:** the Google Analytics tag in `src/layouts/Base.astro`, loaded after the page finishes. Events:
  `search`, `view_3d`, `copy_credit`. Cookies are off by default in the EEA, the UK and Switzerland.
- **Downloads, API, MCP:** the Cloud Function counts each call and sends it with the Measurement Protocol
  (`functions/track.js`): `download` (every file URL goes through `/dl/`, which redirects to Storage),
  `api_search`, `mcp_call`.
- **Crawlers and agents reading pages or files:** Hosting request logging is on; the log sink
  `hosting-to-analytics` sends entries to the Pub/Sub topic `hosting-requests`, whose push subscription
  `hosting-requests-to-api` delivers them to the function (`/_ingest/hosting`), which sends
  `server_request` for everything except people's page views (the tag counts those).

Secrets in Secret Manager: `GA_MP_SECRET` (Measurement Protocol key) and `INGEST_TOKEN` (shared with the
push subscription). Every event is also written to Cloud Logging as a `track <event>` line.

## Develop

```
npm install
npm run dev
```

## Licence

The code in this repository is MIT (see `LICENSE`). The models are under the licence on their own pages,
CC BY 4.0 unless stated, and are not part of this repository.
