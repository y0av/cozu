import { assets } from '../lib/assets.mjs';
import { assetMarkdown, text } from '../lib/catalog.mjs';
const demote = (md) => md.replace(/^## /gm, '### ').replace(/^# /gm, '## ');
export const GET = () => text(['# Cozu: every model', '', 'Free 3D models under CC BY 4.0. Credit each one with its line, keeping the link.', '', ...assets.map((a) => demote(assetMarkdown(a)))].join('\n'));
