/* ── layout.js ── Compositional spine layout + grid-based collision resolution ── */

import { DOMAIN_TINTS, DOMAIN_LABELS, DOMAIN_ORDER } from './graph_data.js';
import { isDomainExpanded } from './filters.js';

/* ── Fixed model-space dimensions — cy.fit() scales to any viewport ── */
const _MODEL_W = 1200, _MODEL_H = 800;

/* ── Module-level state for domain cell bounds (used by backdrop renderer) ── */
let domainBounds = new Map(); // key → { x, y, w, h, label, tint }
let _domainChildCounts = new Map(); // key → { l2: n, l3: n }
let _hotspotIds = new Set(); // ids of hotspot L3 nodes

export function getDomainBounds() {
  return domainBounds;
}

export function getDomainChildCounts() {
  return _domainChildCounts;
}

/** Pre-compute top hotspot L3 nodes per domain + cache child counts.
 *  Operates on raw element data (before cy.add).
 *  Returns Set of hotspot node IDs. */
export function getCollapsedHotspots(allNodes, perDomain) {
  _domainChildCounts = new Map();
  _hotspotIds = new Set();
  const l3ByDomain = new Map();

  for (const n of allNodes) {
    const d = n.data;
    if (d.visibility !== 'executive') continue;
    const layer = String(d.layer || '').toUpperCase();
    const dk = (d.l1_component || '').trim() ||
               (String(d.id || '').startsWith('n_l1_') ? String(d.id).slice(5) : 'other');

    if (!_domainChildCounts.has(dk)) _domainChildCounts.set(dk, { l2: 0, l3: 0 });
    const counts = _domainChildCounts.get(dk);
    if (layer === 'L2') counts.l2++;
    if (layer === 'L3') {
      counts.l3++;
      if (!l3ByDomain.has(dk)) l3ByDomain.set(dk, []);
      l3ByDomain.get(dk).push(n);
    }
  }

  for (const [, l3s] of l3ByDomain) {
    l3s.sort((a, b) => {
      const btiA = Number(a.data.bottleneck_tightness_index_v2 ?? a.data.bottleneck_tightness_index_v1 ?? a.data.bottleneck_score) || 0;
      const btiB = Number(b.data.bottleneck_tightness_index_v2 ?? b.data.bottleneck_tightness_index_v1 ?? b.data.bottleneck_score) || 0;
      return btiB - btiA;
    });
    for (let i = 0; i < Math.min(perDomain, l3s.length); i++) {
      _hotspotIds.add(l3s[i].data.id);
    }
  }
  return _hotspotIds;
}

export function getHotspotIds() { return _hotspotIds; }

export function laneKeyForNode(node) {
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
  /* Use a fixed model-space coordinate system.
     cy.fit() will scale this to any viewport size. */
  const MODEL_W = _MODEL_W, MODEL_H = _MODEL_H;

  const mx = 40, my = 36;
  const gapX = 32, gapY = 40;
  const usableW = MODEL_W - 2 * mx;
  const usableH = MODEL_H - 2 * my;
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

    const expanded = isDomainExpanded(domainKey);

    /* Store domain bounds for backdrop rendering */
    domainBounds.set(domainKey, {
      x: cellX, y: cellY, w: cellW, h: cellH,
      label: DOMAIN_LABELS[domainKey] || domainKey.replace(/_/g, ' '),
      tint: DOMAIN_TINTS[domainKey] || DOMAIN_TINTS.other,
      expanded
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

    /* ── COLLAPSED MODE: L1 centered, hotspot L3 in arc below ── */
    if (!expanded) {
      l1.forEach(n => {
        n.position({ x: cxCenter, y: cellY + cellH * 0.42 });
        n.addClass('collapsed');
      });

      /* Hotspot L3 nodes arranged in arc below L1 */
      const hotspots = l3.filter(n => _hotspotIds.has(n.id()));
      if (hotspots.length > 0) {
        const arcY = cellY + cellH * 0.65;
        const arcSpread = cellW * 0.28;
        hotspots.forEach((n, i) => {
          const frac = hotspots.length <= 1 ? 0.5 : i / (hotspots.length - 1);
          n.position({
            x: cxCenter - arcSpread + arcSpread * 2 * frac,
            y: arcY + (hash01(n.id() + '_hy') - 0.5) * 6
          });
          n.addClass('hotspot');
        });
      }
    } else {
      /* ── EXPANDED MODE: same as original layout ── */

      /* L1 anchor: centered at top of cell (~12% of cell height) */
      l1.forEach(n => {
        n.position({ x: cxCenter, y: cellY + cellH * 0.12 });
        n.removeClass('collapsed');
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
          n.removeClass('hotspot');
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
              n.removeClass('hotspot');
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
              n.removeClass('hotspot');
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
            n.removeClass('hotspot');
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
      /* Skip companies in collapsed domains */
      if (!bounds.expanded) return;
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
  const light = document.documentElement.dataset.theme === 'light';

  for (const [dk, bounds] of domainBounds) {
    const sx = bounds.x * zoom + pan.x;
    const sy = bounds.y * zoom + pan.y;
    const sw = bounds.w * zoom;
    const sh = bounds.h * zoom;

    const radius = 14 * zoom;
    const { r, g, b } = hexToRgb(bounds.tint);

    if (light) {
      /* Light mode: white panel with subtle domain accent tint */
      const grad = ctx.createLinearGradient(sx, sy, sx, sy + sh);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.06)`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.02)`);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      roundRect(ctx, sx, sy, sw, sh, radius);
      ctx.fill();

      ctx.fillStyle = grad;
      ctx.beginPath();
      roundRect(ctx, sx, sy, sw, sh, radius);
      ctx.fill();

      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.18)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      roundRect(ctx, sx, sy, sw, sh, radius);
      ctx.stroke();

      /* Drop shadow for light mode cards */
      ctx.save();
      ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.08)`;
      ctx.shadowBlur = 12 * zoom;
      ctx.shadowOffsetY = 4 * zoom;
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.beginPath();
      roundRect(ctx, sx, sy, sw, sh, radius);
      ctx.fill();
      ctx.restore();
    } else {
      /* Dark mode: dark panel fill with domain accent gradient */
      const grad = ctx.createLinearGradient(sx, sy, sx, sy + sh);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.06)`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.02)`);
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      roundRect(ctx, sx, sy, sw, sh, radius);
      ctx.fill();

      ctx.fillStyle = grad;
      ctx.beginPath();
      roundRect(ctx, sx, sy, sw, sh, radius);
      ctx.fill();

      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.15)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      roundRect(ctx, sx, sy, sw, sh, radius);
      ctx.stroke();
    }

    /* Top accent bar — thin colored strip at top of panel (clipped to panel shape) */
    const barH = Math.max(2, 3 * zoom);
    const barGrad = ctx.createLinearGradient(sx, sy, sx + sw, sy);
    barGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${light ? 0.55 : 0.5})`);
    barGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${light ? 0.15 : 0.1})`);
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, sx, sy, sw, sh, radius);
    ctx.clip();
    ctx.fillStyle = barGrad;
    ctx.fillRect(sx, sy, sw, barH);
    ctx.restore();

    /* Domain label — accent-tinted */
    const fontSize = Math.max(9, Math.min(13, 11 * zoom));
    ctx.font = `700 ${fontSize}px "Inter", system-ui, sans-serif`;
    ctx.fillStyle = light ? `rgba(${r}, ${g}, ${b}, 0.72)` : `rgba(${r}, ${g}, ${b}, 0.55)`;
    ctx.textBaseline = 'top';

    const labelX = sx + 12 * zoom;
    const labelY = sy + 8 * zoom;
    ctx.fillText(bounds.label, labelX, labelY);

    /* Expand / collapse indicator */
    const labelMetrics = ctx.measureText(bounds.label);
    const indicatorX = labelX + labelMetrics.width + 6 * zoom;
    if (bounds.expanded) {
      ctx.fillStyle = light ? `rgba(${r}, ${g}, ${b}, 0.50)` : `rgba(${r}, ${g}, ${b}, 0.35)`;
      ctx.fillText('\u25B4', indicatorX, labelY);
    } else {
      ctx.fillStyle = light ? `rgba(${r}, ${g}, ${b}, 0.60)` : `rgba(${r}, ${g}, ${b}, 0.45)`;
      ctx.fillText('\u25BE', indicatorX, labelY);
    }
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

/* ── Expand / Collapse animations ── */

export function animateExpansion(cy, domainKey, newElements) {
  const bounds = domainBounds.get(domainKey);
  if (!bounds) return Promise.resolve();

  /* Find existing L1 node */
  const l1Node = cy.nodes().filter(n => {
    return String(n.data('layer') || '').toUpperCase() === 'L1' && laneKeyForNode(n) === domainKey;
  });
  const l1Pos = l1Node.length ? l1Node[0].position() : { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h * 0.42 };

  /* Remove collapsed/hotspot classes */
  l1Node.removeClass('collapsed');
  cy.nodes().filter(n => laneKeyForNode(n) === domainKey && n.hasClass('hotspot')).removeClass('hotspot');

  /* Add new elements at L1 position with opacity 0 */
  const existingIds = new Set();
  cy.nodes().forEach(n => existingIds.add(n.id()));

  const toAdd = newElements.filter(el => !existingIds.has(el.data.id) && !el.data.source);
  const edgesToAdd = newElements.filter(el => el.data.source);

  if (toAdd.length > 0) {
    for (const el of toAdd) {
      el.position = { x: l1Pos.x, y: l1Pos.y };
    }
    cy.add(toAdd);
    /* Add edges whose endpoints now exist */
    const allIds = new Set();
    cy.nodes().forEach(n => allIds.add(n.id()));
    const validEdges = edgesToAdd.filter(e => allIds.has(e.data.source) && allIds.has(e.data.target));
    if (validEdges.length > 0) cy.add(validEdges);
  }

  /* Mark the expanded flag so layout computes expanded positions */
  bounds.expanded = true;

  /* Recompute layout for this domain */
  applyDomainClusterLayout(cy);
  positionCompanyNodesInGrid(cy);
  flagCrossDomainEdges(cy);

  /* Animate new nodes from L1 position to their final positions */
  const domainNodes = cy.nodes().filter(n => laneKeyForNode(n) === domainKey && String(n.data('layer') || '').toUpperCase() !== 'L1');
  const promises = [];

  domainNodes.forEach(n => {
    const finalPos = n.position();
    n.position({ x: l1Pos.x, y: l1Pos.y });
    n.style('opacity', 0);
    promises.push(
      n.animate({
        position: finalPos,
        style: { opacity: n.data('_origOpacity') || 1 }
      }, { duration: 420, easing: 'ease-in-out-cubic' }).promise()
    );
  });

  /* Animate L1 to its expanded position */
  if (l1Node.length) {
    const targetY = bounds.y + bounds.h * 0.12;
    promises.push(
      l1Node[0].animate({
        position: { x: bounds.x + bounds.w / 2, y: targetY }
      }, { duration: 420, easing: 'ease-in-out-cubic' }).promise()
    );
  }

  return Promise.all(promises);
}

export function animateCollapse(cy, domainKey) {
  const bounds = domainBounds.get(domainKey);
  if (!bounds) return Promise.resolve();

  const l1Node = cy.nodes().filter(n => {
    return String(n.data('layer') || '').toUpperCase() === 'L1' && laneKeyForNode(n) === domainKey;
  });
  const l1Pos = l1Node.length ? { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h * 0.42 } : null;

  /* Find all non-L1 domain nodes */
  const childNodes = cy.nodes().filter(n => {
    return laneKeyForNode(n) === domainKey && String(n.data('layer') || '').toUpperCase() !== 'L1';
  });

  const promises = [];

  /* Animate children toward L1 position + fade */
  if (l1Pos) {
    childNodes.forEach(n => {
      promises.push(
        n.animate({
          position: { x: l1Pos.x, y: l1Pos.y },
          style: { opacity: 0 }
        }, { duration: 380, easing: 'ease-in-out-cubic' }).promise()
      );
    });
  }

  return Promise.all(promises).then(() => {
    /* Remove children + connected edges */
    const connectedEdges = childNodes.connectedEdges();
    cy.remove(connectedEdges);
    cy.remove(childNodes);

    /* Mark collapsed and reposition L1 */
    bounds.expanded = false;
    if (l1Node.length) {
      l1Node[0].addClass('collapsed');
      l1Node[0].animate({
        position: { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h * 0.42 }
      }, { duration: 300, easing: 'ease-in-out-cubic' });
    }
  });
}

/* ── Viewport density tuning ── */
function occupancyPct(cy) {
  const bb = cy.nodes(':visible').renderedBoundingBox({ includeLabels: false });
  const canvasArea = Math.max(1, cy.width() * cy.height());
  const usedArea = Math.max(1, bb.w * bb.h);
  return (usedArea / canvasArea) * 100;
}

function tuneViewportForDensity(cy) {
  const isMobile = cy.width() < 600;

  if (isMobile) {
    /* On mobile, simply fit all nodes with enough padding for labels */
    cy.fit(undefined, 6);
    return;
  }

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

export function runLayout(cy) {
  try {
    applyDomainClusterLayout(cy);
    positionCompanyNodesInGrid(cy);
    flagCrossDomainEdges(cy);
    resolveCollisions(cy, 15);
    tuneViewportForDensity(cy);
  } catch (e) {
    console.warn('primary layout failed, falling back to cose:', e);
    cy.layout({ name: 'cose', animate: false, fit: true, padding: 24 }).run();
  }
}
