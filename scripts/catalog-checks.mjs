// Checks shared by the scripts that write catalog entries (publish-asset.mjs, patch-catalog.mjs).

/** `moving`: what moves without a skeleton rig. Returns a list of problems, empty when the field is right. */
export function movingProblems(m) {
  if (m === undefined) return [];
  if (!m || typeof m !== 'object') return ['"moving" must be an object with summary and parts'];
  const out = [];
  if (typeof m.summary !== 'string' || !m.summary || m.summary.length > 48) out.push('"moving.summary" must be text of 1 to 48 characters');
  if (!Array.isArray(m.parts)) return [...out, '"moving.parts" must be a list'];
  if ((m.summary === 'None') !== (m.parts.length === 0)) out.push('"moving.summary" is "None" exactly when "moving.parts" is empty');
  m.parts.forEach((p, i) => {
    for (const k of ['name', 'motion', 'range']) if (typeof p?.[k] !== 'string' || !p[k]) out.push(`"moving.parts[${i}].${k}" missing`);
    if (!Array.isArray(p?.nodes) || !p.nodes.length || !p.nodes.every((n) => typeof n === 'string' && n)) out.push(`"moving.parts[${i}].nodes" must list node names`);
  });
  return out;
}
