import { SITE } from '../../../lib/site.mjs';
import { json } from '../../../lib/catalog.mjs';

const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Cozu API',
    version: '1.0.0',
    description: 'Free 3D models for games and apps. No key. Models are free for commercial use under the licence in each record (CC BY 4.0 unless stated); credit each one with attribution.text, keeping the link.',
    license: { name: 'CC BY 4.0 (models)', url: 'https://creativecommons.org/licenses/by/4.0/' },
  },
  servers: [{ url: SITE }],
  paths: {
    '/api/v1/assets.json': { get: { operationId: 'listAssets', summary: 'The whole catalog', responses: { 200: { description: 'Every model', content: { 'application/json': { schema: ref('Catalog') } } } } } },
    '/api/v1/assets/{id}.json': { get: { operationId: 'getAsset', summary: 'One model', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'semi-truck' }], responses: { 200: { description: 'The model', content: { 'application/json': { schema: ref('Asset') } } }, 404: { description: 'No such model' } } } },
    '/api/v1/search': { get: { operationId: 'searchAssets', summary: 'Search models', parameters: [
      { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Words to match in the title, summary, tags and category' },
      { name: 'category', in: 'query', schema: { type: 'string' } },
      { name: 'format', in: 'query', schema: { type: 'string', enum: ['GLB', 'OBJ'] } },
      { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 } },
    ], responses: { 200: { description: 'Matches, best first', content: { 'application/json': { schema: { type: 'object', properties: { count: { type: 'integer' }, results: { type: 'array', items: ref('AssetSummary') } } } } } } } } },
  },
  components: {
    schemas: {
      File: { type: 'object', required: ['path', 'url'], properties: { path: { type: 'string' }, url: { type: 'string', format: 'uri' }, bytes: { type: 'integer' }, sha256: { type: 'string' } } },
      Attribution: { type: 'object', properties: { required: { type: 'boolean' }, text: { type: 'string' }, html: { type: 'string' }, markdown: { type: 'string' } } },
      License: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, url: { type: 'string' }, attributionRequired: { type: 'boolean' }, commercialUse: { type: 'boolean' } } },
      AssetSummary: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, summary: { type: 'string' }, category: { type: 'string' }, formats: { type: 'array', items: { type: 'string' } }, page: { type: 'string' }, json: { type: 'string' }, license: { type: 'string' }, attribution: { type: 'string' }, preview: { type: 'string' }, downloads: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, url: { type: 'string' }, bytes: { type: 'integer' } } } } } },
      Asset: { type: 'object', properties: {
        id: { type: 'string' }, title: { type: 'string' }, summary: { type: 'string' }, description: { type: 'array', items: { type: 'string' } },
        type: { type: 'string' }, category: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, version: { type: 'string' },
        published: { type: 'string', format: 'date' }, updated: { type: 'string', format: 'date' }, page: { type: 'string', format: 'uri' },
        license: ref('License'), attribution: ref('Attribution'), formats: { type: 'array', items: { type: 'string' } }, engines: { type: 'array', items: { type: 'string' } },
        stats: { type: 'object' }, previews: { type: 'array', items: ref('File') }, viewer: ref('File'), readme: ref('File'),
        downloads: { type: 'array', items: { allOf: [ref('File'), { type: 'object', properties: { label: { type: 'string' }, description: { type: 'string' } } }] } },
        files: { type: 'array', items: ref('File') },
      } },
      Catalog: { type: 'object', properties: { name: { type: 'string' }, updated: { type: 'string' }, count: { type: 'integer' }, license_note: { type: 'string' }, assets: { type: 'array', items: ref('Asset') } } },
    },
  },
};
export const GET = () => json(spec);
