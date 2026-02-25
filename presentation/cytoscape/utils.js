/* ── utils.js ── Pure helper functions (no DOM / cy dependency) ── */

export function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function fmtScenario(s) {
  if (!s || typeof s !== 'object') return String(s || 'n/a');
  const parts = [];
  if (s.tariff_penalty_pct != null) parts.push('tariff ' + s.tariff_penalty_pct + '%');
  if (s.regulatory_delay_weeks != null) parts.push('delay ' + s.regulatory_delay_weeks + 'w');
  if (s.narrative) parts.push(s.narrative.slice(0, 100));
  return parts.join(' \u00b7 ') || 'n/a';
}

export function getLayerValue(v) {
  return String(v || '').toUpperCase();
}

export function isEvidenceNodeData(data) {
  const nt = String((data && data.node_type) || '').toLowerCase();
  const layer = getLayerValue(data && data.layer);
  return nt === 'source' || nt === 'gap' || nt === 'source_ref' || layer === 'L4_SOURCE_REF';
}

export function normalizeToken(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/[`']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Read BTI score from a Cytoscape element (tries v2, v1, legacy). */
export function getTightnessIndex(nodeOrEle) {
  const fromV2 = Number(nodeOrEle.data('bottleneck_tightness_index_v2'));
  if (Number.isFinite(fromV2)) return fromV2;
  const fromV1 = Number(nodeOrEle.data('bottleneck_tightness_index_v1'));
  if (Number.isFinite(fromV1)) return fromV1;
  const fromLegacy = Number(nodeOrEle.data('bottleneck_score'));
  return Number.isFinite(fromLegacy) ? fromLegacy : 0;
}

export function getTightnessTier(nodeOrEle) {
  const fromV2 = Number(nodeOrEle.data('bottleneck_tightness_tier_v2'));
  if (Number.isFinite(fromV2)) return fromV2;
  const fromV1 = Number(nodeOrEle.data('bottleneck_tightness_tier_v1'));
  if (Number.isFinite(fromV1)) return fromV1;
  const fromLegacy = Number(nodeOrEle.data('bottleneck_tier'));
  return Number.isFinite(fromLegacy) ? fromLegacy : 0;
}

export function isCoreLayerNode(nodeOrEle) {
  const layer = getLayerValue(nodeOrEle.data('layer'));
  return layer === 'L1' || layer === 'L2' || layer === 'L3';
}

export function layerSortRank(layer) {
  const l = getLayerValue(layer);
  if (l === 'L1') return 1;
  if (l === 'L2') return 2;
  if (l === 'L3') return 3;
  return 4;
}

export function compareBtiNodesDesc(a, b) {
  const btiA = getTightnessIndex(a);
  const btiB = getTightnessIndex(b);
  if (btiA !== btiB) return btiB - btiA;
  const layerDelta = layerSortRank(a.data('layer')) - layerSortRank(b.data('layer'));
  if (layerDelta !== 0) return layerDelta;
  const idA = String(a.data('id') || a.id() || '');
  const idB = String(b.data('id') || b.id() || '');
  return idA.localeCompare(idB);
}
