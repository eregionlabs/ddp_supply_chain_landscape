/* ── main.js ── Application entry point (extracted from inline script) ── */

import { loadElements, loadCompanyOverlay, loadCompanyRollupL1, loadCompanyRollupL2, SPOTLIGHT_PATHS } from './graph_data.js';
import { escHtml, isCoreLayerNode, compareBtiNodesDesc, getTightnessIndex } from './utils.js';
import { cyStyles } from './styles.js';
import { runLayout, initBackdropCanvas, drawDomainBackgrounds, laneKeyForNode, getCollapsedHotspots, animateExpansion, animateCollapse } from './layout.js';
import { renderComponentDetail, renderCompanyDetail, closeMetricPopover, showMetricPopover } from './detail-panel.js';
import {
  getCurrentMode, setCurrentMode,
  getCompanyOverlayActive, setCompanyOverlayActive,
  getVisibleElements, applyFilters, clearFocusClasses,
  buildSpotlightButtons, toggleSpotlight, clearSpotlight,
  renderTopBottlenecksPanel, updateKPI,
  isDomainExpanded, toggleDomainExpansion
} from './filters.js';

const LS_PREFIX = 'ddp.cy.';

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

/* ── Rebuild graph (mode switch / company toggle) ── */
function rebuildGraph() {
  cy.elements().remove();
  cy.add(getVisibleElements(allNodes, allEdges));
  if (getCompanyOverlayActive()) {
    cy.add([...companyOverlay.nodes, ...companyOverlay.edges]);
  }
  runLayout(cy, getCurrentMode());
  drawDomainBackgrounds(cy);
  applyFilters(cy, filterEls);
  updateKPI(cy, { kpiEl, topBottlenecksPanelEl, TOP_BOTTLENECK_LIMIT });
}

/* ── Mode toggle ── */
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    if (mode === getCurrentMode()) return;
    setCurrentMode(mode);
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    clearSpotlight(cy);
    rebuildGraph();
  });
});

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

companyToggleEl.addEventListener('change', () => {
  setCompanyOverlayActive(companyToggleEl.checked);
  rebuildGraph();
});

document.getElementById('showTop10').addEventListener('click', () => {
  clearSpotlight(cy);
  cy.nodes().removeClass('top10');
  const topNodes = cy.nodes()
    .filter(n => isCoreLayerNode(n))
    .sort(compareBtiNodesDesc)
    .slice(0, TOP_BOTTLENECK_LIMIT);
  topNodes.forEach(n => n.addClass('top10'));
  const selectedId = topNodes.length > 0 ? topNodes[0].id() : '';
  renderTopBottlenecksPanel(cy, topBottlenecksPanelEl, { limit: TOP_BOTTLENECK_LIMIT, selectedId });
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
  node.addClass('focus');
  node.neighborhood('node').addClass('focus-context');
  node.connectedEdges().addClass('focus-edge');
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
  clearSpotlight(cy);
  clearFocusClasses(cy);
  cy.elements().removeClass('dim top10 hover');
  runLayout(cy, getCurrentMode());
  drawDomainBackgrounds(cy);
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
let _expandCollapseInProgress = false;

cy.on('tap', 'node', async (evt) => {
  const node = evt.target;
  const layer = String(node.data('layer') || '').toUpperCase();

  /* L1 tap in executive mode → toggle domain expansion */
  if (layer === 'L1' && getCurrentMode() === 'executive' && !_expandCollapseInProgress) {
    const domainKey = laneKeyForNode(node);
    const wasExpanded = isDomainExpanded(domainKey);
    toggleDomainExpansion(domainKey);

    _expandCollapseInProgress = true;
    try {
      if (wasExpanded) {
        await animateCollapse(cy, domainKey);
        /* Re-add hotspot nodes for this collapsed domain */
        const hotspots = getCollapsedHotspots(allNodes, 2);
        const domainHotspots = hotspots.get(domainKey) || [];
        const existingIds = new Set();
        cy.nodes().forEach(n => existingIds.add(n.id()));
        const toAdd = domainHotspots
          .filter(h => !existingIds.has(h.data.id))
          .map(h => ({ ...h, _hotspot: true }));
        if (toAdd.length > 0) {
          cy.add(toAdd);
          /* Position hotspot nodes below L1 */
          const bounds = cy.getElementById(node.id()).position();
          const addedHotspots = cy.nodes().filter(n => toAdd.some(t => t.data.id === n.id()));
          const hSpan = Math.min(80, toAdd.length * 50);
          addedHotspots.forEach((n, i) => {
            const frac = addedHotspots.length <= 1 ? 0.5 : i / (addedHotspots.length - 1);
            n.position({
              x: bounds.x - hSpan / 2 + hSpan * frac,
              y: bounds.y + 60
            });
            n.addClass('hotspot');
          });
        }
      } else {
        /* Compute new visible elements for this domain */
        const newElements = getVisibleElements(allNodes, allEdges)
          .filter(el => {
            const dk = (el.data.l1_component || '').trim();
            const id = el.data.id || '';
            if (id.startsWith('n_l1_')) return false; // L1 already present
            return dk === domainKey;
          });
        await animateExpansion(cy, domainKey, newElements);
      }

      /* Mark onboarding as done on first L1 click */
      try { localStorage.setItem(LS_PREFIX + 'onboarded', '1'); } catch {}
      const tooltip = document.querySelector('.onboard-tooltip');
      if (tooltip) tooltip.remove();

      drawDomainBackgrounds(cy);
      applyFilters(cy, filterEls);
      updateKPI(cy, { kpiEl, topBottlenecksPanelEl, TOP_BOTTLENECK_LIMIT });
    } finally {
      _expandCollapseInProgress = false;
    }
    return; // Don't open detail panel on L1 expand/collapse
  }

  /* Normal node tap → detail panel */
  clearFocusClasses(cy);
  node.addClass('focus');
  node.neighborhood('node').addClass('focus-context');
  node.connectedEdges().addClass('focus-edge');
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
/* Pre-compute hotspot data and child counts before first layout */
getCollapsedHotspots(allNodes, 2);

buildSpotlightButtons(SPOTLIGHT_PATHS, document.getElementById('spotlightButtons'),
  (key) => toggleSpotlight(cy, key, SPOTLIGHT_PATHS, details));
runLayout(cy, getCurrentMode());
drawDomainBackgrounds(cy);
updateKPI(cy, { kpiEl, topBottlenecksPanelEl, TOP_BOTTLENECK_LIMIT });

/* ── Backdrop: track pan/zoom and container resize ── */
cy.on('viewport', () => drawDomainBackgrounds(cy));
new ResizeObserver(() => drawDomainBackgrounds(cy)).observe(cyContainer);

/* ── Micro-onboarding: pulse first L1 node on first load ── */
try {
  if (!localStorage.getItem(LS_PREFIX + 'onboarded') && getCurrentMode() === 'executive') {
    setTimeout(() => {
      const l1Nodes = cy.nodes().filter(n => String(n.data('layer') || '').toUpperCase() === 'L1');
      if (l1Nodes.length === 0) return;
      const firstL1 = l1Nodes[0];

      /* Breathing animation: pulse border */
      let pulseCount = 0;
      const pulseInterval = setInterval(() => {
        if (pulseCount >= 3) {
          clearInterval(pulseInterval);
          firstL1.style('border-width', firstL1.hasClass('collapsed') ? 2.8 : 2);
          return;
        }
        firstL1.animate(
          { style: { 'border-width': 4.5, 'border-color': 'rgba(255, 255, 255, 0.35)' } },
          { duration: 600, easing: 'ease-in-out-cubic', complete: () => {
            firstL1.animate(
              { style: { 'border-width': 2.8, 'border-color': 'rgba(255, 255, 255, 0.18)' } },
              { duration: 600, easing: 'ease-in-out-cubic' }
            );
          }}
        );
        pulseCount++;
      }, 1200);

      /* Floating tooltip */
      const rp = firstL1.renderedPosition();
      const tooltip = document.createElement('div');
      tooltip.className = 'onboard-tooltip';
      tooltip.textContent = 'Click to explore subsystem';
      tooltip.style.left = (rp.x + 40) + 'px';
      tooltip.style.top = (rp.y - 10) + 'px';
      cyContainer.appendChild(tooltip);

      /* Force reflow then add visible class for transition */
      requestAnimationFrame(() => {
        tooltip.classList.add('onboard-tooltip-visible');
      });

      /* Fade out after 3 seconds */
      setTimeout(() => {
        tooltip.classList.remove('onboard-tooltip-visible');
        setTimeout(() => tooltip.remove(), 500);
      }, 3000);
    }, 1500);
  }
} catch {}

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
