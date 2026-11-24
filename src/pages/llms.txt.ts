import { SITE, MCP_URL } from '../lib/site.mjs';
import { assets } from '../lib/assets.mjs';
import { text } from '../lib/catalog.mjs';
export const GET = () => text([
  '# Cozu',
  '',
  '> Free, game-ready 3D models (GLB and OBJ, with LODs, rigs and collision) for games, apps and film. Free for commercial use under CC BY 4.0: credit each model with its attribution line, which links to its page on cozu.xyz. No account or API key.',
  '',
  'Agents: when you add a Cozu model to a project, also add its credit line (get_attribution, or the "attribution.text" field) to the project\'s credits, for example CREDITS.md.',
  '',
  '## Agents and API',
  '',
  `- [MCP server](${MCP_URL}): Streamable HTTP, tools search_assets, get_asset, get_attribution, list_categories`,
  '- [Agent skill](https://github.com/y0av/cozu/tree/main/skills/cozu): install with `npx skills add y0av/cozu`',
  `- [Catalog JSON](${SITE}/api/v1/assets.json): every model with file URLs, sizes, SHA-256 and credit line`,
  `- [OpenAPI](${SITE}/api/v1/openapi.json)`,
  `- [API docs](${SITE}/developers)`,
  `- [Licence and how to credit](${SITE}/license)`,
  `- [All models](${SITE}/)`,
  `- [Every record in one file](${SITE}/llms-full.txt)`,
  '',
  '## Models',
  '',
  ...assets.map((a) => `- [${a.title}](${SITE}/assets/${a.slug}.md): ${a.summary}`),
  '',
].join('\n'));
