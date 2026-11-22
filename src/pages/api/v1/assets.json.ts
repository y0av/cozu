import { catalog, json } from '../../../lib/catalog.mjs';
export const GET = () => json(catalog());
