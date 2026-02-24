/* ── layout.js ── Compositional spine layout + grid-based collision resolution ── */

import { getTightnessIndex, compareBtiNodesDesc } from './utils.js';
import { DOMAIN_TINTS, DOMAIN_LABELS, DOMAIN_ORDER } from './graph_data.js';

/* ── Module-level state for domain cell bounds (used by backdrop renderer) ── */
let domainBounds = new Map(); // key → { x, y, w, h, label, tint }

export function getDomainBounds() {
  return domainBounds;
}

function laneKeyForNode(node) {
  const direct = (node.data('l1_component') || '').trim();
  if (direct) return direct;
  const id = String(node.id() || '');
  if (id.startsWith('n_l1_')) return id.slice('n_l1_'.length);
  return 'other';
}

function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/* ── 2-row x 4-column grid domain cluster layout ──
   Row 0: [Propulsion]  [Energy Storage]  [Flight Ctrl]  [Secure Comms]
   Row 1:      [PNT]    [Manufacturing]   [Airframe]
*/
function applyDomainClusterLayout(cy) {
  const graphW = cy.width();
  const graphH = cy.height();

  const mx = 40, my = 36;
  const gapX = 32, gapY = 40;
  const usableW = Math.max(600, graphW - 2 * mx);
  const usableH = Math.max(400, graphH - 2 * my);
  const cellW = (usableW - 3 * gapX) / 4;
  const cellH = (usableH - gapY) / 2;

  /* Build domain → nodes map */
  const domMap = new Map();
  cy.nodes().forEach(n => {
    const key = laneKeyForNode(n);
    if (!domMap.has(key)) domMap.set(key, []);
    domMap.get(key).push(n);
  });

  /* Use DOMAIN_ORDER for placement; domains not in the order go to 'other' */
  const orderedDomains = DOMAIN_ORDER.filter(k => domMap.has(k));
  /* Append any domains present in the graph but not in DOMAIN_ORDER */
  for (const k of domMap.keys()) {
    if (!orderedDomains.includes(k) && k !== 'other') orderedDomains.push(k);
  }

  /* Grid positions: row 0 gets indices 0-3, row 1 gets indices 4-6 (centered) */
  const gridPositions = [];
  const topCount = Math.min(4, orderedDomains.length);
  const botCount = orderedDomains.length - topCount;

  /* Row 0 */
  for (let i = 0; i < topCount; i++) {
    gridPositions.push({
      col: i, row: 0,
      x: mx + i * (cellW + gapX),
      y: my
    });
  }

  /* Row 1 — centered horizontally */
  if (botCount > 0) {
    const botTotalW = botCount * cellW + (botCount - 1) * gapX;
    const botOffsetX = mx + (usableW - botTotalW) / 2;
    for (let i = 0; i < botCount; i++) {
      gridPositions.push({
        col: i, row: 1,
        x: botOffsetX + i * (cellW + gapX),
        y: my + cellH + gapY
      });
    }
  }

  /* Clear previous bounds */
  domainBounds = new Map();

  cy.startBatch();

  orderedDomains.forEach((domainKey, idx) => {
    const allNodes = domMap.get(domainKey) || [];
    if (allNodes.length === 0) return;
    const gp = gridPositions[idx];
    if (!gp) return;

    const cellX = gp.x;
    const cellY = gp.y;

    /* Store domain bounds for backdrop rendering */
    domainBounds.set(domainKey, {
      x: cellX, y: cellY, w: cellW, h: cellH,
      label: DOMAIN_LABELS[domainKey] || domainKey.replace(/_/g, ' '),
      tint: DOMAIN_TINTS[domainKey] || DOMAIN_TINTS.other
    });

    /* Separate nodes by layer */
    const l1 = allNodes.filter(n => String(n.data('layer') || '').toUpperCase() === 'L1');
    const l2 = allNodes.filter(n => String(n.data('layer') || '').toUpperCase() === 'L2');
    const l3 = allNodes.filter(n => String(n.data('layer') || '').toUpperCase() === 'L3');
    const co = allNodes.filter(n => (n.data('node_type') || '') === 'company');
    const l4 = allNodes.filter(n => {
      const nt = (n.data('node_type') || '').toLowerCase();
      return nt === 'source' || nt === 'gap' || nt === 'source_ref';
    });

    /* Cell-relative coordinates */
    const cxCenter = cellX + cellW / 2;

    /* L1 anchor: centered at top of cell (~12% of cell height) */
    l1.forEach(n => {
      n.position({ x: cxCenter, y: cellY + cellH * 0.12 });
    });

    /* L2 row: evenly spread across cell width (~34% of cell height) */
    if (l2.length) {
      const l2Y = cellY + cellH * 0.34;
      const l2Margin = cellW * 0.08;
      const l2Span = cellW - 2 * l2Margin;
      l2.forEach((n, i) => {
        const frac = l2.length <= 1 ? 0.5 : i / (l2.length - 1);
        n.position({
          x: cellX + l2Margin + l2Span * frac,
          y: l2Y
        });
      });
    }

    /* L3 columns: group under parent L2, stacked vertically */
    if (l3.length) {
      /* Build parent_id → [L3 nodes] map */
      const l3ByParent = new Map();
      const orphanL3 = [];
      for (const n of l3) {
        const pid = n.data('parent_id') || '';
        if (pid && l2.some(l2n => l2n.id() === pid)) {
          if (!l3ByParent.has(pid)) l3ByParent.set(pid, []);
          l3ByParent.get(pid).push(n);
        } else {
          orphanL3.push(n);
        }
      }

      const l3YStart = cellY + cellH * 0.48;
      const l3YEnd = cellY + cellH * 0.90;
      const l3YSpan = l3YEnd - l3YStart;

      if (l2.length > 0) {
        /* Position L3 nodes in columns aligned under their parent L2 */
        const l2Margin = cellW * 0.08;
        const l2Span = cellW - 2 * l2Margin;

        l2.forEach((l2Node, l2Idx) => {
          const children = l3ByParent.get(l2Node.id()) || [];
          if (children.length === 0) return;
          const l2Frac = l2.length <= 1 ? 0.5 : l2Idx / (l2.length - 1);
          const colX = cellX + l2Margin + l2Span * l2Frac;

          children.forEach((n, cIdx) => {
            const yFrac = children.length <= 1 ? 0.5 : cIdx / (children.length - 1);
            n.position({
              x: colX + (hash01(n.id() + '_l3x') - 0.5) * 8,
              y: l3YStart + l3YSpan * yFrac
            });
          });
        });

        /* Position orphan L3 nodes spread across the cell bottom */
        if (orphanL3.length > 0) {
          const oMargin = cellW * 0.1;
          const oSpan = cellW - 2 * oMargin;
          orphanL3.forEach((n, i) => {
            const frac = orphanL3.length <= 1 ? 0.5 : i / (orphanL3.length - 1);
            n.position({
              x: cellX + oMargin + oSpan * frac,
              y: l3YEnd + (hash01(n.id() + '_oy') - 0.5) * 8
            });
          });
        }
      } else {
        /* No L2 nodes — spread all L3 in a grid inside the cell */
        const allL3 = [...l3];
        const cols = Math.ceil(Math.sqrt(allL3.length));
        const l3Margin = cellW * 0.08;
        const l3Span = cellW - 2 * l3Margin;
        allL3.forEach((n, i) => {
          const c = i % cols;
          const r = Math.floor(i / cols);
          const rows = Math.ceil(allL3.length / cols);
          const xFrac = cols <= 1 ? 0.5 : c / (cols - 1);
          const yFrac = rows <= 1 ? 0.5 : r / (rows - 1);
          n.position({
            x: cellX + l3Margin + l3Span * xFrac,
            y: l3YStart + l3YSpan * yFrac
          });
        });
      }
    }

    /* L4 (source/gap) nodes — small, tucked near bottom */
    if (l4.length) {
      const l4Y = cellY + cellH * 0.94;
      const l4Margin = cellW * 0.12;
      const l4Span = cellW - 2 * l4Margin;
      l4.forEach((n, i) => {
        const frac = l4.length <= 1 ? 0.5 : i / (l4.length - 1);
        n.position({
          x: cellX + l4Margin + l4Span * frac + (hash01(n.id()) - 0.5) * 4,
          y: l4Y + (hash01(n.id() + 'y') - 0.5) * 6
        });
      });
    }

    /* Company nodes — positioned at bottom of cell */
    if (co.length) {
      const coY = cellY + cellH * 0.96;
      const coMargin = cellW * 0.15;
      const coSpan = cellW - 2 * coMargin;
      co.forEach((n, i) => {
        const frac = co.length <= 1 ? 0.5 : i / (co.length - 1);
        n.position({
          x: cellX + coMargin + coSpan * frac + (hash01(n.id()) - 0.5) * 5,
          y: coY + (hash01(n.id() + 'cy') - 0.5) * 8
        });
      });
    }
  });

  /* Handle 'other' domain nodes — position them in remaining space */
  const otherNodes = domMap.get('other') || [];
  if (otherNodes.length > 0) {
    const otherX = mx;
    const otherY = my + 2 * (cellH + gapY);
    otherNodes.forEach((n, i) => {
      n.position({
        x: otherX + (i % 6) * 40 + 20,
        y: otherY + Math.floor(i / 6) * 40 + 20
      });
    });
  }

  cy.endBatch();
}

/* ── Position company overlay nodes in domain cells by connectivity ── */
function positionCompanyNodesInGrid(cy) {
  const companyNodes = cy.nodes().filter(n => (n.data('node_type') || '') === 'company');
  if (companyNodes.length === 0 || domainBounds.size === 0) return;

  cy.startBatch();
  companyNodes.forEach(n => {
    /* Count connections per domain */
    const domainCounts = new Map();
    n.connectedEdges().forEach(e => {
      const other = e.source().id() === n.id() ? e.target() : e.source();
      const otherDomain = laneKeyForNode(other);
      if (otherDomain && otherDomain !== 'other') {
        domainCounts.set(otherDomain, (domainCounts.get(otherDomain) || 0) + 1);
      }
    });

    /* Pick domain with most connections */
    let bestDomain = null;
    let bestCount = 0;
    for (const [domain, count] of domainCounts) {
      if (count > bestCount) {
        bestDomain = domain;
        bestCount = count;
      }
    }

    if (bestDomain && domainBounds.has(bestDomain)) {
      const bounds = domainBounds.get(bestDomain);
      n.position({
        x: bounds.x + bounds.w * (0.15 + hash01(n.id() + '_cx') * 0.7),
        y: bounds.y + bounds.h * (0.92 + (hash01(n.id() + '_cy') - 0.5) * 0.06)
      });
    }
  });
  cy.endBatch();
}

/* ── Flag cross-domain edges ── */
function flagCrossDomainEdges(cy) {
  cy.edges().forEach(e => {
    const srcDomain = laneKeyForNode(e.source());
    const tgtDomain = laneKeyForNode(e.target());
    const isCross = srcDomain !== tgtDomain;
    e.data('cross_domain', isCross);
  });
}

/* ── Grid-based collision resolution with domain boundary clamping ── */
function resolveCollisions(cy, iterations) {
  const nodes = cy.nodes().toArray();
  const n = nodes.length;
  if (n === 0) return;

  const padding = 16;
  let maxNodeW = 0;
  for (const node of nodes) {
    const w = node.data('node_w') || 20;
    if (w > maxNodeW) maxNodeW = w;
  }
  const cellSize = maxNodeW + padding;

  /* Pre-compute domain bounds for each node (for clamping) */
  const nodeDomainBounds = new Map();
  for (const node of nodes) {
    const dk = laneKeyForNode(node);
    if (domainBounds.has(dk)) {
      nodeDomainBounds.set(node.id(), domainBounds.get(dk));
    }
  }

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;

    /* Snapshot positions and build spatial grid */
    const posX = new Float64Array(n);
    const posY = new Float64Array(n);
    const grid = new Map();
    for (let i = 0; i < n; i++) {
      posX[i] = nodes[i].position('x');
      posY[i] = nodes[i].position('y');
      const gx = Math.floor(posX[i] / cellSize);
      const gy = Math.floor(posY[i] / cellSize);
      const key = gx + ',' + gy;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }

    cy.startBatch();
    for (let i = 0; i < n; i++) {
      const gx = Math.floor(posX[i] / cellSize);
      const gy = Math.floor(posY[i] / cellSize);

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const cell = grid.get((gx + dx) + ',' + (gy + dy));
          if (!cell) continue;

          for (const j of cell) {
            if (j <= i) continue;
            const a = nodes[i], b = nodes[j];
            const ax = a.position('x'), ay = a.position('y');
            const bx = b.position('x'), by = b.position('y');
            const ddx = bx - ax, ddy = by - ay;
            const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 0.1;
            const aw = a.data('node_w') || 20;
            const bw = b.data('node_w') || 20;
            const minDist = (aw + bw) / 2 + padding;
            if (dist < minDist) {
              const push = (minDist - dist) * 0.28;
              const ux = ddx / dist, uy = ddy / dist;
              a.position({ x: ax - ux * push, y: ay - uy * push });
              b.position({ x: bx + ux * push, y: by + uy * push });
              moved = true;
            }
          }
        }
      }
    }

    /* Clamp nodes back into their domain cell boundaries */
    for (let i = 0; i < n; i++) {
      const bounds = nodeDomainBounds.get(nodes[i].id());
      if (!bounds) continue;
      const nw = (nodes[i].data('node_w') || 20) / 2;
      const nh = (nodes[i].data('node_h') || 20) / 2;
      const pos = nodes[i].position();
      const cx = clamp(pos.x, bounds.x + nw, bounds.x + bounds.w - nw);
      const cy_ = clamp(pos.y, bounds.y + nh, bounds.y + bounds.h - nh);
      if (cx !== pos.x || cy_ !== pos.y) {
        nodes[i].position({ x: cx, y: cy_ });
      }
    }

    cy.endBatch();
    if (!moved) break;
  }
}

/* ── Domain region background renderer ── */

let _backdropCanvas = null;

export function initBackdropCanvas(cyContainer) {
  if (_backdropCanvas) return _backdropCanvas;
  _backdropCanvas = document.createElement('canvas');
  _backdropCanvas.id = 'domainBackdrop';
  _backdropCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;';
  cyContainer.prepend(_backdropCanvas);
  return _backdropCanvas;
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function darkenHex(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const f = 1 - amount;
  return `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`;
}

export function drawDomainBackgrounds(cy) {
  if (!_backdropCanvas || domainBounds.size === 0) return;

  const container = _backdropCanvas.parentElement;
  if (!container) return;

  const dpr = window.devicePixelRatio || 1;
  const cw = container.clientWidth;
  const ch = container.clientHeight;

  if (_backdropCanvas.width !== cw * dpr || _backdropCanvas.height !== ch * dpr) {
    _backdropCanvas.width = cw * dpr;
    _backdropCanvas.height = ch * dpr;
    _backdropCanvas.style.width = cw + 'px';
    _backdropCanvas.style.height = ch + 'px';
  }

  const ctx = _backdropCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);

  const pan = cy.pan();
  const zoom = cy.zoom();

  for (const [, bounds] of domainBounds) {
    const sx = bounds.x * zoom + pan.x;
    const sy = bounds.y * zoom + pan.y;
    const sw = bounds.w * zoom;
    const sh = bounds.h * zoom;

    const radius = 12 * zoom;

    /* Dark panel fill — slightly lighter than #13171C base */
    ctx.fillStyle = '#1A1F26';
    ctx.beginPath();
    roundRect(ctx, sx, sy, sw, sh, radius);
    ctx.fill();

    /* Faint tint overlay — preserves domain identity without competing */
    const { r, g, b } = hexToRgb(bounds.tint);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.06)`;
    ctx.beginPath();
    roundRect(ctx, sx, sy, sw, sh, radius);
    ctx.fill();

    /* Subtle division border */
    ctx.strokeStyle = '#222831';
    ctx.lineWidth = 1;
    ctx.beginPath();
    roundRect(ctx, sx, sy, sw, sh, radius);
    ctx.stroke();

    /* Domain label — muted white */
    const fontSize = Math.max(9, Math.min(13, 11 * zoom));
    ctx.font = `700 ${fontSize}px "Inter", system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.textBaseline = 'top';
    ctx.fillText(bounds.label, sx + 10 * zoom, sy + 6 * zoom);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/* ── Viewport density tuning ── */
function occupancyPct(cy) {
  const bb = cy.nodes(':visible').renderedBoundingBox({ includeLabels: false });
  const canvasArea = Math.max(1, cy.width() * cy.height());
  const usedArea = Math.max(1, bb.w * bb.h);
  return (usedArea / canvasArea) * 100;
}

function tuneViewportForDensity(cy) {
  cy.fit(undefined, 28);
  const occ = occupancyPct(cy);
  const zoom = cy.zoom();
  if (occ < 58) {
    const ratio = Math.min(1.28, Math.sqrt(68 / Math.max(occ, 1)));
    cy.zoom({ level: zoom * ratio, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    cy.center();
  } else if (occ > 84) {
    const ratio = Math.max(0.82, Math.sqrt(78 / occ));
    cy.zoom({ level: zoom * ratio, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    cy.center();
  }
}

export function runLayout(cy, currentMode) {
  const isExec = currentMode === 'executive';
  try {
    if (isExec) {
      /* Grid layout is deterministic — skip dagre entirely */
      applyDomainClusterLayout(cy);
      positionCompanyNodesInGrid(cy);
      flagCrossDomainEdges(cy);
      resolveCollisions(cy, 15);
      tuneViewportForDensity(cy);
    } else {
      cy.layout({
        name:    'dagre',
        rankDir: 'LR',
        ranker:  'network-simplex',
        nodeSep: 48,
        rankSep: 132,
        edgeSep: 22,
        sort: (a, b) => compareBtiNodesDesc(a, b),
        animate: false,
        fit: true,
        padding: 28
      }).run();
      cy.fit(undefined, 26);
    }
  } catch (e) {
    console.warn('primary layout failed, falling back to cose:', e);
    cy.layout({ name: 'cose', animate: false, fit: true, padding: 24 }).run();
  }
}
