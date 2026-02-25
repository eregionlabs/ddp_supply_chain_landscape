/* ── filters.js ── Filtering, spotlight, KPI, mode state ── */

import { escHtml, getTightnessIndex, isCoreLayerNode, compareBtiNodesDesc, layerSortRank } from './utils.js';

/* ── Module state with getters / setters ── */
let currentMode          = 'executive';
let activeSpotlight      = null;
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

export function getCurrentMode()          { return currentMode; }
export function setCurrentMode(m)         { currentMode = m; }
export function getActiveSpotlight()      { return activeSpotlight; }
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

/* ── Visible elements for current mode ── */
export function getVisibleElements(allNodes, allEdges) {
  let nodes;
  if (currentMode === 'executive') {
    const execNodes = allNodes.filter(n => n.data.visibility === 'executive');

    /* Progressive disclosure: collapsed domains show only L1 + top hotspot L3 */
    const filtered = [];
    /* Group L3 by domain for hotspot selection */
    const l3ByDomain = new Map();

    for (const n of execNodes) {
      const layer = String(n.data.layer || '').toUpperCase();
      const dk = domainKeyFromData(n.data);

      if (layer === 'L1') {
        /* L1 always visible */
        filtered.push(n);
      } else if (isDomainExpanded(dk)) {
        /* Expanded domain: all nodes visible */
        filtered.push(n);
      } else if (layer === 'L3') {
        /* Collapsed: collect L3 for hotspot ranking */
        if (!l3ByDomain.has(dk)) l3ByDomain.set(dk, []);
        l3ByDomain.get(dk).push(n);
      }
      /* Collapsed L2: hidden (not added) */
      /* Nodes without a recognizable domain pass through */
      else if (dk === 'other') {
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

    nodes = filtered;
  } else {
    nodes = [...allNodes];
  }

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

  if (activeSpotlight) return;

  cy.elements().removeClass('dim');

  cy.nodes().forEach(n => {
    const label = String(n.data('label') || '').toLowerCase();
    const id = String(n.data('id') || '').toLowerCase();
    const isCompany = n.data('node_type') === 'company';

    let ok = true;
    if (q && !(label.includes(q) || id.includes(q))) ok = false;

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
  cy.elements().removeClass('focus focus-context focus-edge');
}

/* ── Spotlight ── */
export function buildSpotlightButtons(SPOTLIGHT_PATHS, container, onToggle) {
  for (const [key, path] of Object.entries(SPOTLIGHT_PATHS)) {
    const btn = document.createElement('button');
    btn.className = 'spotlight-btn';
    btn.dataset.idea = key;
    btn.innerHTML = `
      <span class="spotlight-color" style="background:${escHtml(path.color)}"></span>
      <div>
        <div class="spotlight-name">${escHtml(path.label)}</div>
        <div class="spotlight-desc">${escHtml(path.description)}</div>
      </div>`;
    btn.addEventListener('click', () => onToggle(key));
    container.appendChild(btn);
  }
}

export function toggleSpotlight(cy, ideaKey, SPOTLIGHT_PATHS, detailsEl) {
  if (activeSpotlight === ideaKey) { clearSpotlight(cy); return; }
  clearSpotlight(cy);
  activeSpotlight = ideaKey;
  const path     = SPOTLIGHT_PATHS[ideaKey];
  const classNum = ideaKey.replace('idea_', '');

  const matchNodes = cy.nodes().filter(n => n.data('thesis_tag') === ideaKey);

  const l1Ids = new Set();
  matchNodes.forEach(n => {
    const l1 = n.data('l1_component');
    if (l1) l1Ids.add('n_l1_' + l1);
  });
  const l1Nodes = cy.nodes().filter(n => l1Ids.has(n.id()));

  const spotlightNodes = matchNodes.union(l1Nodes);
  const spotlightEdges = spotlightNodes.edgesWith(spotlightNodes);

  cy.elements().addClass('dim');
  spotlightNodes.removeClass('dim').addClass('spotlight spotlight-' + classNum);
  spotlightEdges.removeClass('dim').addClass('spotlight-edge');

  document.querySelectorAll('.spotlight-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.idea === ideaKey);
  });

  const nodeList = matchNodes
    .sort(compareBtiNodesDesc)
    .map(n => escHtml(n.data('label')) + ' (' + getTightnessIndex(n) + ')')
    .join(', ');
  detailsEl.innerHTML = `
    <div class="detail-title">${escHtml(path.label)}</div>
    <div class="detail-note">${escHtml(path.description)}</div>
    <div class="detail-metrics-grid">
      <div class="detail-metric-card"><small>Path nodes</small><strong>${spotlightNodes.length}</strong></div>
      <div class="detail-metric-card"><small>Path edges</small><strong>${spotlightEdges.length}</strong></div>
    </div>
    <div class="detail-note">${nodeList || 'No matching nodes in current view.'}</div>
    <div class="detail-note">Click a highlighted node for full details.</div>`;
}

export function clearSpotlight(cy) {
  activeSpotlight = null;
  cy.elements().removeClass('dim spotlight spotlight-1 spotlight-2 spotlight-3 spotlight-edge');
  document.querySelectorAll('.spotlight-btn').forEach(b => b.classList.remove('active'));
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

/* ── KPI bar (bug fix: removed undefined pass/fail references) ── */
export function updateKPI(cy, { kpiEl, topBottlenecksPanelEl, TOP_BOTTLENECK_LIMIT }) {
  const componentNodes = cy.nodes().filter(n => isCoreLayerNode(n));
  const total = componentNodes.length;
  const l1 = componentNodes.filter(n => String(n.data('layer') || '').toUpperCase() === 'L1').length;
  const l2 = componentNodes.filter(n => String(n.data('layer') || '').toUpperCase() === 'L2').length;
  const l3 = componentNodes.filter(n => String(n.data('layer') || '').toUpperCase() === 'L3').length;
  const bottlenecks = Math.min(TOP_BOTTLENECK_LIMIT, total);
  const coCount = cy.nodes().filter(n => n.data('node_type') === 'company').length;
  const modeLabel = currentMode === 'executive' ? 'Exec' : 'Analyst';
  let text = `${modeLabel} \u00b7 L1 ${l1} \u00b7 L2 ${l2} \u00b7 L3 ${l3} \u00b7 ${total} total`;
  if (coCount > 0) text += ` \u00b7 ${coCount} cos`;
  kpiEl.textContent = text;

  const pmNodes = document.getElementById('pmNodes');
  const pmBot   = document.getElementById('pmBottleneck');
  if (pmNodes) pmNodes.textContent = `${l1}/${l2}/${l3}`;
  if (pmBot)   pmBot.textContent   = bottlenecks;
  renderTopBottlenecksPanel(cy, topBottlenecksPanelEl, { limit: TOP_BOTTLENECK_LIMIT });
}
