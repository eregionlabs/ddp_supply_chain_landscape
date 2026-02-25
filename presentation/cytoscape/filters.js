/* ── filters.js ── Filtering, KPI ── */

import { escHtml, getTightnessIndex, isCoreLayerNode, compareBtiNodesDesc, layerSortRank } from './utils.js';

/* ── Module state ── */
let companyOverlayActive = false;

/* ── Domain expansion state (progressive disclosure) ── */
const expandedDomains = new Set();
const HOTSPOT_PER_DOMAIN = 2;

export function isDomainExpanded(domainKey)    { return expandedDomains.has(domainKey); }
export function toggleDomainExpansion(domainKey) {
  if (expandedDomains.has(domainKey)) expandedDomains.delete(domainKey);
  else expandedDomains.add(domainKey);
}
export function getExpandedDomains()           { return expandedDomains; }
export function clearExpandedDomains()         { expandedDomains.clear(); }

export function getCompanyOverlayActive() { return companyOverlayActive; }
export function setCompanyOverlayActive(v){ companyOverlayActive = v; }

/* ── Helper: domain key from raw node data (mirrors layout.js laneKeyForNode) ── */
function domainKeyFromData(d) {
  const direct = (d.l1_component || '').trim();
  if (direct) return direct;
  const id = String(d.id || '');
  if (id.startsWith('n_l1_')) return id.slice('n_l1_'.length);
  return 'other';
}

/* ── Helper: BTI from raw node data (pre-cy) ── */
function rawBti(d) {
  return Number(d.bottleneck_tightness_index_v2 ?? d.bottleneck_tightness_index_v1 ?? d.bottleneck_score) || 0;
}

/* ── Visible elements (executive view with progressive disclosure) ── */
export function getVisibleElements(allNodes, allEdges) {
  const execNodes = allNodes.filter(n => n.data.visibility === 'executive');

  /* Progressive disclosure: collapsed domains show only L1 + top hotspot L3 */
  const filtered = [];
  const l3ByDomain = new Map();

  for (const n of execNodes) {
    const layer = String(n.data.layer || '').toUpperCase();
    const dk = domainKeyFromData(n.data);

    if (layer === 'L1') {
      filtered.push(n);
    } else if (isDomainExpanded(dk)) {
      filtered.push(n);
    } else if (layer === 'L3') {
      if (!l3ByDomain.has(dk)) l3ByDomain.set(dk, []);
      l3ByDomain.get(dk).push(n);
    } else if (dk === 'other') {
      filtered.push(n);
    }
  }

  /* Pick top HOTSPOT_PER_DOMAIN L3 per collapsed domain */
  for (const [, l3s] of l3ByDomain) {
    l3s.sort((a, b) => rawBti(b.data) - rawBti(a.data));
    for (let i = 0; i < Math.min(HOTSPOT_PER_DOMAIN, l3s.length); i++) {
      filtered.push(l3s[i]);
    }
  }

  const nodes = filtered;

  nodes.sort((a, b) => {
    const layerDelta = layerSortRank(a.data.layer) - layerSortRank(b.data.layer);
    if (layerDelta !== 0) return layerDelta;
    const btiA = rawBti(a.data);
    const btiB = rawBti(b.data);
    if (btiA !== btiB) return btiB - btiA;
    return String(a.data.id || '').localeCompare(String(b.data.id || ''));
  });
  const nodeIds = new Set(nodes.map(n => n.data.id));
  const edges = allEdges.filter(
    e => nodeIds.has(e.data.source) && nodeIds.has(e.data.target)
  );
  edges.sort((a, b) => String(a.data.id || '').localeCompare(String(b.data.id || '')));
  return [...nodes, ...edges];
}

/* ── Filters (search, domain, confidence, pressure) ── */
export function applyFilters(cy, { searchEl, domainEl, confEl, pressureEl }) {
  const q = (searchEl.value || '').trim().toLowerCase();
  const domain = domainEl.value;
  const conf = confEl.value;
  const pressure = pressureEl.value;

  cy.elements().removeClass('dim');

  cy.nodes().forEach(n => {
    const label = String(n.data('label') || '').toLowerCase();
    const id = String(n.data('id') || '').toLowerCase();
    const isCompany = n.data('node_type') === 'company';

    let ok = true;
    if (q && !(label.includes(q) || id.includes(q))) {
      const cos = n.data('top_companies');
      const coMatch = Array.isArray(cos) && cos.some(c =>
        String(c.company_name || '').toLowerCase().includes(q));
      if (!coMatch) ok = false;
    }

    if (!isCompany) {
      if (domain !== 'all' && String(n.data('l1_component') || '').toLowerCase() !== domain) ok = false;
      if (pressure !== 'all') {
        const b = getTightnessIndex(n);
        if (pressure === 'high' && b < 70) ok = false;
        if (pressure === 'med' && (b < 40 || b >= 70)) ok = false;
        if (pressure === 'low' && b >= 40) ok = false;
      }
    }

    if (conf !== 'all') {
      const ct = String(n.data('confidence') || n.data('confidence_tier') || '').toLowerCase();
      if (!ct.includes(conf)) ok = false;
    }

    if (!ok) n.addClass('dim');
  });

  cy.edges().forEach(e => {
    if (e.source().hasClass('dim') || e.target().hasClass('dim')) e.addClass('dim');
  });
}

export function clearFocusClasses(cy) {
  cy.elements().removeClass('focus focus-context focus-edge focus-dim');
}

/* ── Top Bottlenecks panel ── */
export function renderTopBottlenecksPanel(cy, panelEl, { limit = 10, selectedId = '' } = {}) {
  if (!panelEl) return;
  const top = cy.nodes()
    .filter(n => isCoreLayerNode(n))
    .sort(compareBtiNodesDesc)
    .slice(0, limit);
  if (!top || top.length === 0) {
    panelEl.innerHTML = '<small>No L1/L2/L3 nodes available.</small>';
    return;
  }
  const header = `<div class="top-bottleneck-header">
    <span>Rank</span>
    <span>Component</span>
    <span>Pressure</span>
  </div>`;
  panelEl.innerHTML = header + '<div class="top-bottleneck-list">' + top.map((n, idx) => {
    const id = n.id();
    const rowCls = id === selectedId ? 'top-bottleneck-row selected' : 'top-bottleneck-row';
    const label = escHtml(String(n.data('label') || id));
    const bti = getTightnessIndex(n);
    return `<div class="${rowCls}" data-node-id="${escHtml(id)}">
      <span class="top-bottleneck-rank">${idx + 1}</span>
      <span class="top-bottleneck-name">${label}</span>
      <span class="top-bottleneck-score">${bti}</span>
    </div>`;
  }).join('') + '</div>';
}

/* ── KPI bar — counts from full dataset, not just visible cy nodes ── */
export function updateKPI(cy, { kpiEl, topBottlenecksPanelEl, TOP_BOTTLENECK_LIMIT, allNodes }) {
  /* Count from full dataset so progressive disclosure doesn't deflate totals */
  const sourceNodes = allNodes || [];
  const coreNodes = sourceNodes.filter(n => {
    const layer = String(n.data.layer || '').toUpperCase();
    if (layer !== 'L1' && layer !== 'L2' && layer !== 'L3') return false;
    if (n.data.visibility !== 'executive') return false;
    return true;
  });
  const total = coreNodes.length;
  const l1 = coreNodes.filter(n => String(n.data.layer || '').toUpperCase() === 'L1').length;
  const l2 = coreNodes.filter(n => String(n.data.layer || '').toUpperCase() === 'L2').length;
  const l3 = coreNodes.filter(n => String(n.data.layer || '').toUpperCase() === 'L3').length;
  const coCount = sourceNodes.filter(n => n.data.node_type === 'company').length;
  let text = `L1 ${l1} \u00b7 L2 ${l2} \u00b7 L3 ${l3} \u00b7 ${total} total`;
  if (coCount > 0) text += ` \u00b7 ${coCount} cos`;
  kpiEl.textContent = text;

  renderTopBottlenecksPanel(cy, topBottlenecksPanelEl, { limit: TOP_BOTTLENECK_LIMIT });
}
