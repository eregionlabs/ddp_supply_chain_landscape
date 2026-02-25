/* ── main.js ── Application entry point (extracted from inline script) ── */

import { loadElements, loadCompanyOverlay, loadCompanyRollupL1, loadCompanyRollupL2, DOMAIN_ORDER } from './graph_data.js';
import { escHtml, isCoreLayerNode, compareBtiNodesDesc, getTightnessIndex } from './utils.js';
import { cyStyles, isLightTheme } from './styles.js';
import { runLayout, initBackdropCanvas, drawDomainBackgrounds, laneKeyForNode, getCollapsedHotspots } from './layout.js';
import { renderComponentDetail, renderCompanyDetail, closeMetricPopover, showMetricPopover } from './detail-panel.js';
import {
  getCompanyOverlayActive, setCompanyOverlayActive,
  getVisibleElements, applyFilters, clearFocusClasses,
  renderTopBottlenecksPanel, updateKPI,
  isDomainExpanded, toggleDomainExpansion, getExpandedDomains, clearExpandedDomains
} from './filters.js';

const LS_PREFIX = 'ddp.cy.';

/* ── Intro overlay ── */
const introOverlay  = document.getElementById('introOverlay');
const introCloseBtn = document.getElementById('introClose');
const introDontShow = document.getElementById('introDontShow');
const introReopen   = document.getElementById('introReopen');

function dismissIntro() {
  if (!introOverlay) return;
  introOverlay.classList.add('intro-hidden');
  setTimeout(() => { introOverlay.style.display = 'none'; }, 350);
  if (introDontShow && introDontShow.checked) {
    try { localStorage.setItem(LS_PREFIX + 'introSeen', '1'); } catch {}
  }
}

/* Hide on first load if user already dismissed permanently */
try {
  if (localStorage.getItem(LS_PREFIX + 'introSeen') && introOverlay) {
    introOverlay.style.display = 'none';
    introOverlay.classList.add('intro-hidden');
  }
} catch {}

if (introCloseBtn) introCloseBtn.addEventListener('click', dismissIntro);
if (introOverlay) introOverlay.addEventListener('click', (e) => {
  if (e.target === introOverlay) dismissIntro();
});
if (introReopen && introOverlay) {
  introReopen.addEventListener('click', () => {
    introOverlay.style.display = '';
    introOverlay.classList.remove('intro-hidden');
  });
}

/* ── DOM refs ── */
const details              = document.getElementById('details');
const searchEl             = document.getElementById('search');
const domainEl             = document.getElementById('domainFilter');
const confEl               = document.getElementById('confFilter');
const pressureEl           = document.getElementById('pressureFilter');
const kpiEl                = document.getElementById('kpi');
const companyToggleEl      = document.getElementById('companyToggle');
const companyToggleLabelEl = document.getElementById('companyToggleLabel');
const topBottlenecksPanelEl = document.getElementById('topBottlenecksPanel');
const panelResizerEl       = document.getElementById('panelResizer');
const topPanelEl           = document.getElementById('topPanel');
const topPanelResizerEl    = document.getElementById('topPanelResizer');
const panelToggleBtn       = document.getElementById('panelToggle');
const panelEl              = document.getElementById('panel');
const TOP_BOTTLENECK_LIMIT = 10;
const filterEls            = { searchEl, domainEl, confEl, pressureEl };

/* ── Mobile panel helpers ── */
function openMobilePanel() {
  if (panelEl && window.innerWidth <= 940) {
    panelEl.classList.add('panel-open');
    if (panelToggleBtn) panelToggleBtn.setAttribute('aria-expanded', 'true');
  }
}
if (panelToggleBtn && panelEl) {
  panelToggleBtn.addEventListener('click', () => {
    const open = panelEl.classList.toggle('panel-open');
    panelToggleBtn.setAttribute('aria-expanded', String(open));
  });
}

/* ── Load data ── */
let allNodes = [];
let allEdges = [];
let companyOverlay = { nodes: [], edges: [] };

try {
  const elements = await loadElements();
  allNodes = elements.filter(el => !el.data.source);
  allEdges = elements.filter(el => el.data.source);
} catch (err) {
  const hint = location.protocol === 'file:'
    ? 'Opened via file://. Use a local server so fetch() can load data files.'
    : 'Failed to load graph data. Serve project root and open /presentation/cytoscape/.';
  document.getElementById('cy').innerHTML =
    `<div class="graph-load-error">Graph load failed.<br><small>${hint}</small><br><small>${String(err.message||err)}</small></div>`;
  throw err;
}

try {
  companyOverlay = await loadCompanyOverlay();
  companyToggleLabelEl.textContent = `Company overlay (${companyOverlay.nodes.length})`;
} catch (err) {
  console.warn('Company overlay load failed:', err);
  companyToggleEl.disabled = true;
  companyToggleLabelEl.textContent = 'Company overlay unavailable';
}

/* ── Lazy-load company rollups (start fetch immediately, await on first use) ── */
const companyRollupByL1NodeId = new Map();
const companyRollupByL2NodeId = new Map();

const rollupL1Promise = loadCompanyRollupL1().catch(err => {
  console.warn('L1 company rollup load failed:', err);
  return null;
});
const rollupL2Promise = loadCompanyRollupL2().catch(err => {
  console.warn('L2 company rollup load failed:', err);
  return null;
});

let _rollupsReady = false;
async function ensureRollupsLoaded() {
  if (_rollupsReady) return;
  _rollupsReady = true;
  const [l1, l2] = await Promise.all([rollupL1Promise, rollupL2Promise]);
  if (l1) {
    const byNode = l1.by_l1_node_id || {};
    Object.entries(byNode).forEach(([nid, rec]) => companyRollupByL1NodeId.set(nid, rec));
  }
  if (l2) {
    const byNode = l2.by_l2_node_id || {};
    Object.entries(byNode).forEach(([nid, rec]) => companyRollupByL2NodeId.set(nid, rec));
  }
}

/* ── Company indexes for detail panel ── */
const companyEdgesByComponent = new Map();
const companyNodeById = new Map();
for (const cn of companyOverlay.nodes) companyNodeById.set(cn.data.id, cn.data);
for (const ce of companyOverlay.edges) {
  const src = ce.data.source;
  if (!companyEdgesByComponent.has(src)) companyEdgesByComponent.set(src, []);
  companyEdgesByComponent.get(src).push(ce.data);
}

/* ── Company name → component node IDs (for search) ── */
const companyNameToComponents = new Map();
for (const ce of companyOverlay.edges) {
  const compId = ce.data.target;
  const compNode = companyNodeById.get(compId);
  if (!compNode) continue;
  const name = String(compNode.label || '').toLowerCase();
  if (!companyNameToComponents.has(name)) companyNameToComponents.set(name, new Set());
  companyNameToComponents.get(name).add(ce.data.source);
}
filterEls.companyNameToComponents = companyNameToComponents;

/* ── Shared context for dependency injection ── */
const ctx = {
  get cy() { return cy; },
  detailsEl: details,
  companyEdgesByComponent,
  companyNodeById,
  companyRollupByL1NodeId,
  companyRollupByL2NodeId,
  TOP_BOTTLENECK_LIMIT
};

/* ── Pre-compute hotspot cache before first layout ── */
getCollapsedHotspots(allNodes, 2);

/* ── Remove loading spinner ── */
document.getElementById('graphSpinner')?.remove();

/* ── Cytoscape init ── */
const cy = cytoscape({
  container: document.getElementById('cy'),
  elements: getVisibleElements(allNodes, allEdges),
  layout: { name: 'preset' },
  style: cyStyles
});

/* ── Backdrop canvas for domain region backgrounds ── */
const cyContainer = document.getElementById('cy');
initBackdropCanvas(cyContainer);

/* ── Rebuild graph (mode switch / company toggle / expand-collapse) ── */
function rebuildGraph() {
  const desired = getVisibleElements(allNodes, allEdges);
  if (getCompanyOverlayActive()) {
    desired.push(...companyOverlay.nodes, ...companyOverlay.edges);
  }
  const desiredIds = new Set(desired.map(e => e.data.id));

  /* Incremental diff: remove stale, add missing — avoids full remove+add
     which can corrupt Cytoscape's event dispatch when called during tap. */
  const stale = cy.elements().filter(ele => !desiredIds.has(ele.id()));
  if (stale.length) stale.remove();

  const presentIds = new Set();
  cy.elements().forEach(ele => presentIds.add(ele.id()));
  const toAdd = desired.filter(e => !presentIds.has(e.data.id));
  if (toAdd.length) cy.add(toAdd);

  runLayout(cy);
  drawDomainBackgrounds(cy);
  applyFilters(cy, filterEls);
  updateKPI(cy, { kpiEl, topBottlenecksPanelEl, TOP_BOTTLENECK_LIMIT, allNodes });
}

/* ── Active filter highlight ── */
function syncFilterHighlights() {
  domainEl.classList.toggle('filter-active', domainEl.value !== 'all');
  confEl.classList.toggle('filter-active', confEl.value !== 'all');
  pressureEl.classList.toggle('filter-active', pressureEl.value !== 'all');
}

/* ── Filter listeners ── */
searchEl.addEventListener('input', () => { applyFilters(cy, filterEls); syncFilterHighlights(); });
domainEl.addEventListener('change', () => { applyFilters(cy, filterEls); syncFilterHighlights(); });
confEl.addEventListener('change', () => { applyFilters(cy, filterEls); syncFilterHighlights(); });
pressureEl.addEventListener('change', () => { applyFilters(cy, filterEls); syncFilterHighlights(); });

/* ── Theme toggle ── */
const themeToggleEl = document.getElementById('themeToggle');
if (themeToggleEl) {
  themeToggleEl.addEventListener('click', () => {
    const isLight = document.documentElement.dataset.theme === 'light';
    const newTheme = isLight ? 'dark' : 'light';
    document.documentElement.dataset.theme = newTheme === 'dark' ? '' : newTheme;
    if (newTheme === 'dark') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = 'light';
    try { localStorage.setItem(LS_PREFIX + 'theme', newTheme === 'dark' ? '' : 'light'); } catch {}
    /* Re-render: force Cytoscape to re-evaluate all style functions */
    cy.style().update();
    drawDomainBackgrounds(cy);
  });
}

companyToggleEl.addEventListener('change', () => {
  setCompanyOverlayActive(companyToggleEl.checked);
  rebuildGraph();
});

/* ── Expand All toggle ── */
let _allExpanded = false;
const expandAllBtn = document.getElementById('expandAll');

function setExpandAllState(expanded) {
  _allExpanded = expanded;
  if (expandAllBtn) expandAllBtn.textContent = expanded ? 'Collapse All' : 'Expand All';
}

expandAllBtn.addEventListener('click', () => {
  clearChainHighlight();
  clearFocusClasses(cy);
  if (_allExpanded) {
    /* Collapse all */
    clearExpandedDomains();
  } else {
    /* Expand all */
    for (const dk of DOMAIN_ORDER) {
      if (!isDomainExpanded(dk)) toggleDomainExpansion(dk);
    }
  }
  setExpandAllState(!_allExpanded);
  rebuildGraph();
});

document.getElementById('showTop10').addEventListener('click', () => {
  clearChainHighlight();
  clearFocusClasses(cy);

  /* Ensure all domains are expanded so every node is visible */
  if (!_allExpanded) {
    for (const dk of DOMAIN_ORDER) {
      if (!isDomainExpanded(dk)) toggleDomainExpansion(dk);
    }
    setExpandAllState(true);
    rebuildGraph();
  }

  /* Find the top bottleneck nodes from the full graph */
  cy.nodes().removeClass('top10');
  const topNodes = cy.nodes()
    .filter(n => isCoreLayerNode(n))
    .sort(compareBtiNodesDesc)
    .slice(0, TOP_BOTTLENECK_LIMIT);

  /* Dim everything, then highlight the top bottlenecks */
  cy.elements().addClass('focus-dim');
  topNodes.forEach(n => {
    n.removeClass('focus-dim').addClass('top10');
    n.connectedEdges().removeClass('focus-dim');
    n.neighborhood('node').removeClass('focus-dim');
  });

  const selectedId = topNodes.length > 0 ? topNodes[0].id() : '';
  renderTopBottlenecksPanel(cy, topBottlenecksPanelEl, { limit: TOP_BOTTLENECK_LIMIT, selectedId });
  openMobilePanel();
});

topBottlenecksPanelEl.addEventListener('click', async (evt) => {
  const row = evt.target.closest('[data-node-id]');
  if (!row) return;
  const nodeId = row.getAttribute('data-node-id') || '';
  if (!nodeId) return;
  const node = cy.getElementById(nodeId);
  if (!node || node.empty()) return;
  clearChainHighlight();
  clearFocusClasses(cy);
  cy.elements().addClass('focus-dim');
  node.removeClass('focus-dim').addClass('focus');
  node.neighborhood('node').removeClass('focus-dim').addClass('focus-context');
  node.connectedEdges().removeClass('focus-dim').addClass('focus-edge');
  renderTopBottlenecksPanel(cy, topBottlenecksPanelEl, { limit: TOP_BOTTLENECK_LIMIT, selectedId: node.id() });
  await ensureRollupsLoaded();
  if (node.data('node_type') === 'company') renderCompanyDetail(node, ctx);
  else renderComponentDetail(node, ctx);
  openMobilePanel();
});

/* ── Bottleneck panel hover → chain highlight ── */
let _chainActive = false;
let _chainNodeId = null;

function highlightChain(nodeId) {
  if (_chainNodeId === nodeId) return;
  const node = cy.getElementById(nodeId);
  if (!node || node.empty()) return;

  /* Collect full upstream + downstream chain via directed edges */
  const chain = node.union(node.predecessors()).union(node.successors());
  const chainNodes = chain.nodes();
  const chainEdges = chain.edges();

  cy.elements().addClass('chain-dim');
  chainNodes.removeClass('chain-dim').addClass('chain-node');
  chainEdges.removeClass('chain-dim').addClass('chain-edge');
  node.addClass('chain-source');

  _chainActive = true;
  _chainNodeId = nodeId;
}

function clearChainHighlight() {
  if (!_chainActive) return;
  cy.elements().removeClass('chain-dim chain-node chain-source chain-edge');
  _chainActive = false;
  _chainNodeId = null;
}

topBottlenecksPanelEl.addEventListener('mouseover', (evt) => {
  const row = evt.target.closest('.top-bottleneck-row[data-node-id]');
  if (!row) {
    clearChainHighlight();
    return;
  }
  highlightChain(row.getAttribute('data-node-id') || '');
});

topBottlenecksPanelEl.addEventListener('mouseleave', () => {
  clearChainHighlight();
});

document.getElementById('reset').addEventListener('click', () => {
  searchEl.value = '';
  domainEl.value = 'all';
  confEl.value   = 'all';
  pressureEl.value = 'all';
  syncFilterHighlights();
  clearFocusClasses(cy);
  clearChainHighlight();
  clearExpandedDomains();
  setExpandAllState(false);
  cy.elements().removeClass('dim top10 hover collapsed hotspot');
  rebuildGraph();
  renderTopBottlenecksPanel(cy, topBottlenecksPanelEl, { limit: TOP_BOTTLENECK_LIMIT });
});

/* ── Top panel vertical resize ── */
if (topPanelEl && topPanelResizerEl) {
  const DEFAULT_H = Math.max(110, topPanelEl.scrollHeight);
  const MIN_H = 92;
  const MAX_H = () => Math.min(window.innerHeight * 0.42, 360);
  const applyTopH = (h) => {
    const clamped = Math.max(MIN_H, Math.min(MAX_H(), Number(h) || DEFAULT_H));
    document.documentElement.style.setProperty('--top-panel-height', `${clamped}px`);
    try { localStorage.setItem(LS_PREFIX + 'topPanel.height', String(clamped)); } catch {}
  };
  try {
    const saved = Number(localStorage.getItem(LS_PREFIX + 'topPanel.height') || DEFAULT_H);
    applyTopH(saved);
  } catch { applyTopH(DEFAULT_H); }

  let startY = 0;
  let startH = DEFAULT_H;
  const onMove = (evt) => {
    const dy = evt.clientY - startY;
    applyTopH(startH + dy);
  };
  const onUp = () => {
    document.body.classList.remove('resizing-top-panel');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  topPanelResizerEl.addEventListener('pointerdown', (evt) => {
    evt.preventDefault();
    startY = evt.clientY;
    const current = getComputedStyle(document.documentElement).getPropertyValue('--top-panel-height').trim();
    startH = Number((current || `${DEFAULT_H}px`).replace('px', '')) || DEFAULT_H;
    document.body.classList.add('resizing-top-panel');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  });
  topPanelResizerEl.addEventListener('dblclick', () => applyTopH(DEFAULT_H));
}

/* ── Side panel resize ── */
if (panelResizerEl) {
  const DEFAULT_W = 460;
  const MIN_W = 360;
  const MAX_W = () => Math.min(window.innerWidth * 0.72, 920);

  const applyWidth = (w) => {
    const clamped = Math.max(MIN_W, Math.min(MAX_W(), Number(w) || DEFAULT_W));
    document.documentElement.style.setProperty('--panel-width', `${clamped}px`);
    try { localStorage.setItem(LS_PREFIX + 'panel.width', String(clamped)); } catch {}
  };

  try {
    const saved = Number(localStorage.getItem(LS_PREFIX + 'panel.width') || DEFAULT_W);
    applyWidth(saved);
  } catch { applyWidth(DEFAULT_W); }

  let startX = 0;
  let startW = DEFAULT_W;
  const onPointerMove = (evt) => {
    const dx = startX - evt.clientX;
    applyWidth(startW + dx);
  };
  const onPointerUp = () => {
    document.body.classList.remove('resizing-panel');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };
  panelResizerEl.addEventListener('pointerdown', (evt) => {
    evt.preventDefault();
    panelResizerEl.setPointerCapture?.(evt.pointerId);
    startX = evt.clientX;
    const current = getComputedStyle(document.documentElement).getPropertyValue('--panel-width').trim();
    startW = Number((current || `${DEFAULT_W}px`).replace('px', '')) || DEFAULT_W;
    document.body.classList.add('resizing-panel');
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  });
  panelResizerEl.addEventListener('dblclick', () => applyWidth(DEFAULT_W));
  window.addEventListener('resize', () => {
    const current = Number((getComputedStyle(document.documentElement).getPropertyValue('--panel-width') || '').replace('px', '')) || DEFAULT_W;
    applyWidth(current);
  });
}

/* ── Metric popover wiring ── */
document.addEventListener('click', (evt) => {
  const card = evt.target.closest('.detail-metric-card[data-metric]');
  if (card) {
    const metric = card.getAttribute('data-metric') || '';
    const host = card.closest('[data-node-id]');
    const nid = host ? host.getAttribute('data-node-id') : '';
    const nodeData = nid ? cy.getElementById(nid).data() : null;
    showMetricPopover(card, metric, nodeData || {});
    evt.stopPropagation();
    return;
  }
  if (!evt.target.closest('.metric-popover')) closeMetricPopover();
});
window.addEventListener('scroll', closeMetricPopover, true);
window.addEventListener('resize', closeMetricPopover);

/* ── Cytoscape tap handlers ── */
cy.on('tap', 'node', async (evt) => {
  const node = evt.target;
  const layer = String(node.data('layer') || '').toUpperCase();

  /* ── L1 tap → toggle expand/collapse (accordion) ── */
  if (layer === 'L1') {
    const domainKey = laneKeyForNode(node);

    /* Dismiss onboarding on first L1 click */
    try { localStorage.setItem('ddp.cy.onboarded', '1'); } catch {}
    const tip = document.querySelector('.onboard-tooltip');
    if (tip) tip.remove();

    /* Accordion: if expanding a new domain, collapse all others first */
    if (!isDomainExpanded(domainKey)) {
      for (const k of [...getExpandedDomains()]) {
        if (k !== domainKey) toggleDomainExpansion(k);
      }
    }

    /* Toggle the clicked domain */
    toggleDomainExpansion(domainKey);

    /* Defer rebuild to next tick to let Cytoscape finish event dispatch */
    setTimeout(() => rebuildGraph(), 0);
    return; /* skip detail panel for L1 */
  }

  /* ── Normal tap: detail panel ── */
  clearFocusClasses(cy);
  /* Dim everything first, then highlight selected + connected */
  cy.elements().addClass('focus-dim');
  node.removeClass('focus-dim').addClass('focus');
  node.neighborhood('node').removeClass('focus-dim').addClass('focus-context');
  node.connectedEdges().removeClass('focus-dim').addClass('focus-edge');
  renderTopBottlenecksPanel(cy, topBottlenecksPanelEl, { limit: TOP_BOTTLENECK_LIMIT, selectedId: node.id() });
  await ensureRollupsLoaded();
  if (node.data('node_type') === 'company') renderCompanyDetail(node, ctx);
  else renderComponentDetail(node, ctx);
  openMobilePanel();
});

cy.on('tap', 'edge', evt => {
  clearFocusClasses(cy);
  evt.target.addClass('focus-edge');
  evt.target.source().addClass('focus-context');
  evt.target.target().addClass('focus-context');
  renderTopBottlenecksPanel(cy, topBottlenecksPanelEl, { limit: TOP_BOTTLENECK_LIMIT });
  const e = evt.target.data();
  const depType = e.dependency_type || 'depends_on';
  let extra = '';
  if (e.composite_score != null) {
    extra += `<small>composite: ${e.composite_score} \u00b7 penalty: ${e.confidence_penalty ?? 'n/a'}</small>`;
  }
  if (e.source_count != null) {
    extra += `<small>sources: ${e.source_count}</small>`;
  }
  details.innerHTML = `
    <div class="detail-title">Edge</div>
    <div class="detail-note">${escHtml(e.source)} \u2192 ${escHtml(e.target)}</div>
    <div class="detail-note">type: ${escHtml(depType)} \u00b7 confidence: ${e.confidence || 'n/a'}</div>
    ${extra}`;
  openMobilePanel();
});

cy.on('mouseover', 'node', evt => evt.target.addClass('hover'));
cy.on('mouseout',  'node', evt => evt.target.removeClass('hover'));

/* ── Init ── */
runLayout(cy);
drawDomainBackgrounds(cy);
updateKPI(cy, { kpiEl, topBottlenecksPanelEl, TOP_BOTTLENECK_LIMIT, allNodes });

/* ── Backdrop: track pan/zoom and container resize ── */
cy.on('viewport', () => drawDomainBackgrounds(cy));
new ResizeObserver(() => drawDomainBackgrounds(cy)).observe(cyContainer);

/* ── Micro-onboarding (one-time) ── */
setTimeout(() => {
  try {
    if (localStorage.getItem('ddp.cy.onboarded')) return;
  } catch { /* proceed */ }

  /* Find first L1 node */
  const firstL1 = cy.nodes().filter(n => String(n.data('layer') || '').toUpperCase() === 'L1')[0];
  if (!firstL1) return;

  /* Pulse border animation (3 cycles) — use animation().play().promise() API */
  let pulseCount = 0;
  const doPulse = () => {
    if (pulseCount >= 3) return;
    pulseCount++;
    firstL1.animation({ style: { 'border-color': 'rgba(255,255,255,0.50)', 'border-width': 3.5 }, duration: 300 })
      .play().promise('complete').then(() =>
        firstL1.animation({ style: { 'border-color': 'rgba(255,255,255,0.18)', 'border-width': 2.8 }, duration: 300 }).play().promise('complete')
      ).then(doPulse);
  };
  doPulse();

  /* Tooltip near first L1 */
  const rp = firstL1.renderedPosition();
  const tooltip = document.createElement('div');
  tooltip.className = 'onboard-tooltip';
  tooltip.textContent = 'Click to explore subsystem';
  tooltip.style.left = (rp.x + 10) + 'px';
  tooltip.style.top = (rp.y + 40) + 'px';
  cyContainer.appendChild(tooltip);
  requestAnimationFrame(() => tooltip.classList.add('onboard-tooltip-visible'));

  /* Fade after 3s */
  setTimeout(() => {
    tooltip.classList.remove('onboard-tooltip-visible');
    setTimeout(() => tooltip.remove(), 500);
  }, 3000);
}, 1500);

/* ── Debug helpers (localhost only) ── */
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  window.__cy = cy;
  window.__layoutDiagnostics = function () {
    const nodes = cy.nodes(':visible');
    const edges = cy.edges(':visible');
    const canvasW = cy.width();
    const canvasH = cy.height();
    const canvasArea = Math.max(1, canvasW * canvasH);
    const bbox = nodes.renderedBoundingBox({ includeLabels: false });
    const occupiedArea = Math.max(1, bbox.w * bbox.h);
    const occupiedPct = (occupiedArea / canvasArea) * 100;
    const layerCounts = { L1: 0, L2: 0, L3: 0, L4: 0, OTHER: 0 };
    nodes.forEach(n => {
      const layer = String(n.data('layer') || '').toUpperCase();
      if (layerCounts[layer] != null) layerCounts[layer] += 1;
      else layerCounts.OTHER += 1;
    });
    const labelBoxes = [];
    nodes.forEach(n => {
      if (Number(n.style('text-opacity')) < 0.2 || Number(n.style('opacity')) < 0.18) return;
      const p = n.renderedPosition();
      const text = String(n.data('short_label') || '');
      const w = Math.max(22, text.length * 6.2);
      const h = 13;
      const y = p.y + (n.renderedHeight() * 0.5) + 8;
      labelBoxes.push({ x: p.x, y, w, h });
    });
    let labelCollisions = 0;
    for (let i = 0; i < labelBoxes.length; i++) {
      for (let j = i + 1; j < labelBoxes.length; j++) {
        const a = labelBoxes[i];
        const b = labelBoxes[j];
        if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2) labelCollisions += 1;
      }
    }
    const segs = [];
    edges.forEach(e => {
      const s = e.source(); const t = e.target();
      if (s.id() === t.id()) return;
      segs.push({ x1: s.position().x, y1: s.position().y, x2: t.position().x, y2: t.position().y, sid: s.id(), tid: t.id() });
    });
    let crossingsEstimate = 0;
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const a = segs[i]; const b = segs[j];
        if (a.sid === b.sid || a.sid === b.tid || a.tid === b.sid || a.tid === b.tid) continue;
        const d1x = a.x2 - a.x1, d1y = a.y2 - a.y1, d2x = b.x2 - b.x1, d2y = b.y2 - b.y1;
        const det = d1x * d2y - d1y * d2x;
        if (Math.abs(det) < 0.001) continue;
        const dx = b.x1 - a.x1, dy = b.y1 - a.y1;
        const t = (dx * d2y - dy * d2x) / det;
        const u = (dx * d1y - dy * d1x) / det;
        if (t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98) crossingsEstimate += 1;
      }
    }
    return {
      occupiedBboxPct: Number(occupiedPct.toFixed(2)),
      nodeCountVisible: nodes.length, edgeCountVisible: edges.length,
      layerCountsVisible: layerCounts, labelCollisions, crossingsEstimate,
      canvasW: Math.round(canvasW), canvasH: Math.round(canvasH),
      bboxW: Math.round(bbox.w), bboxH: Math.round(bbox.h)
    };
  };
}
