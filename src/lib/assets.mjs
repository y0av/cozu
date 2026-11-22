// The catalog: one JSON file per asset in src/content/assets (metadata only; the files live in Storage).
const modules = import.meta.glob('../content/assets/*.json', { eager: true, import: 'default' });

export const assets = Object.values(modules)
  .filter((a) => a.files?.length)
  .sort((a, b) => b.published.localeCompare(a.published) || a.title.localeCompare(b.title));

const CATEGORY_NAMES = { vehicles: 'Vehicles', characters: 'Characters', props: 'Props', environments: 'Environments', textures: 'Textures' };
export const categoryName = (id) => CATEGORY_NAMES[id] || id.charAt(0).toUpperCase() + id.slice(1);

export const categories = [...new Set(assets.map((a) => a.category))].sort()
  .map((id) => ({ id, name: categoryName(id), count: assets.filter((a) => a.category === id).length }));

export const lastUpdated = assets.reduce((m, a) => (a.updated > m ? a.updated : m), '2026-01-01');
