/* ── layout.js ── Layout orchestration + grid-based collision resolution ── */

import { getTightnessIndex, compareBtiNodesDesc } from './utils.js';

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

function compareByDomainAndTightness(a, b, xOrder) {
  const btiDelta = getTightnessIndex(b) - getTightnessIndex(a);
  if (btiDelta !== 0) return btiDelta;
  return (xOrder.get(a.id()) || 0) - (xOrder.get(b.id()) || 0);
}

/* ── Multi-band domain cluster layout (beauty pass) ── */
function applyDomainClusterLayout(cy) {
  const graphW = cy.width();
  const graphH = cy.height();

  const xOrder = new Map();
  cy.nodes().forEach(n => xOrder.set(n.id(), n.position('x')));

  const domMap = new Map();
  cy.nodes().forEach(n => {
    const key = laneKeyForNode(n);
    if (!domMap.has(key)) domMap.set(key, []);
    domMap.get(key).push(n);
  });

  const domains = [...domMap.entries()].sort((a, b) => {
    const ax = a[1].reduce((s, n) => s + (xOrder.get(n.id()) || 0), 0) / a[1].length;
    const bx = b[1].reduce((s, n) => s + (xOrder.get(n.id()) || 0), 0) / b[1].length;
    return ax - bx;
  });

  const nd = domains.length;
  const mx = 48, my = 40;
  const usableW = Math.max(400, graphW - 2 * mx);
  const usableH = Math.max(260, graphH - 2 * my);
  const domainSpan = clamp(usableW / Math.max(2, nd * 0.85), 148, 260);
  const waveAmp = Math.min(usableH * 0.13, 78);
  const yMidBase = my + usableH * 0.48;

  cy.startBatch();

  domains.forEach(([key, allNodes], idx) => {
    const t = nd <= 1 ? 0.5 : idx / (nd - 1);
    const cx = mx + t * usableW;
    const cyPos = yMidBase + Math.sin((t * Math.PI * 1.8) + 0.5) * waveAmp;
    const bandH = clamp(usableH * 0.66, 230, 360);

    const l1 = allNodes.filter(n => String(n.data('layer') || '').toUpperCase() === 'L1');
    const l2 = allNodes.filter(n => String(n.data('layer') || '').toUpperCase() === 'L2')
      .sort((a, b) => compareByDomainAndTightness(a, b, xOrder));
    const l3 = allNodes.filter(n => String(n.data('layer') || '').toUpperCase() === 'L3')
      .sort((a, b) => compareByDomainAndTightness(a, b, xOrder));
    const l4 = allNodes.filter(n => {
      const nt = (n.data('node_type') || '').toLowerCase();
      return nt === 'source' || nt === 'gap' || nt === 'source_ref';
    });
    const co = allNodes.filter(n => (n.data('node_type') || '') === 'company');
    const untyped = allNodes.filter(n => {
      const layer = String(n.data('layer') || '').toUpperCase();
      const nt = String(n.data('node_type') || '').toLowerCase();
      return layer !== 'L1' && layer !== 'L2' && layer !== 'L3' && nt !== 'source' && nt !== 'gap' && nt !== 'source_ref' && nt !== 'company';
    }).sort((a, b) => compareByDomainAndTightness(a, b, xOrder));
    const l3All = l3.concat(untyped);

    l1.forEach(n => n.position({ x: cx, y: cyPos - bandH * 0.42 }));

    if (l2.length) {
      const span = domainSpan * 0.96;
      const yCenter = cyPos - bandH * 0.16;
      const arcDip = Math.min(18, l2.length * 3);
      l2.forEach((n, i) => {
        const frac = l2.length <= 1 ? 0.5 : i / (l2.length - 1);
        const arcY = arcDip * (4 * (frac - 0.5) * (frac - 0.5));
        const tightnessBoost = (getTightnessIndex(n) / 100) * 18;
        n.position({
          x: cx - span / 2 + span * frac + (hash01(`${n.id()}_l2x`) - 0.5) * 10,
          y: yCenter + arcY - tightnessBoost + (hash01(`${n.id()}_l2y`) - 0.5) * 8
        });
      });
    }

    if (l3All.length) {
      const maxPerRow = Math.max(2, Math.ceil(Math.sqrt(l3All.length * 2.0)));
      const nRows = Math.ceil(l3All.length / maxPerRow);
      const xSpan = domainSpan * 1.06;
      const yStart = cyPos + bandH * 0.0;
      const yEnd   = cyPos + bandH * 0.28;
      const ySpan = yEnd - yStart;

      l3All.forEach((n, i) => {
        const r = Math.floor(i / maxPerRow);
        const c = i % maxPerRow;
        const inRow = Math.min(maxPerRow, l3All.length - r * maxPerRow);
        const frac = inRow <= 1 ? 0.5 : c / (inRow - 1);
        const stagger = (r % 2 === 1 && inRow > 1) ? (xSpan / maxPerRow) * 0.42 : 0;
        const yFrac = nRows <= 1 ? 0.5 : r / (nRows - 1);
        const tightnessBoost = (getTightnessIndex(n) / 100) * 24;
        n.position({
          x: cx - xSpan / 2 + xSpan * frac + stagger + (hash01(`${n.id()}_l3x`) - 0.5) * 10,
          y: yStart + ySpan * yFrac - tightnessBoost + (hash01(`${n.id()}_l3y`) - 0.5) * 8
        });
      });
    }

    if (l4.length) {
      const span = domainSpan * 0.78;
      const baseY = cyPos + bandH * 0.38;
      const perRow = 7;
      const l4Rows = Math.ceil(l4.length / perRow);
      l4.forEach((n, i) => {
        const r = Math.floor(i / perRow);
        const c = i % perRow;
        const inRow = Math.min(perRow, l4.length - r * perRow);
        const x = inRow > 1 ? cx - span / 2 + span * c / (inRow - 1) : cx;
        const yOff = l4Rows > 1 ? (bandH * 0.10) * r / (l4Rows - 1) : 0;
        n.position({
          x: x + (hash01(n.id()) - 0.5) * 5,
          y: baseY + yOff + (hash01(n.id() + 'y') - 0.5) * 5
        });
      });
    }

    if (co.length) {
      const span = domainSpan * 0.68;
      const baseY = cyPos + bandH * 0.24;
      co.forEach((n, i) => {
        const x = co.length > 1 ? cx - span / 2 + span * i / (co.length - 1) : cx;
        n.position({
          x: x + (hash01(n.id()) - 0.5) * 6,
          y: baseY + (hash01(n.id() + 'y') - 0.5) * 9
        });
      });
    }
  });

  cy.endBatch();
}

/* ── Grid-based collision resolution (~O(n) per iteration) ── */
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
    cy.endBatch();
    if (!moved) break;
  }
}

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
      cy.layout({
        name: 'dagre', rankDir: 'TB',
        ranker: 'network-simplex',
        nodeSep: 72, rankSep: 120, edgeSep: 32,
        sort: (a, b) => compareBtiNodesDesc(a, b),
        animate: false, fit: true, padding: 34
      }).run();
      applyDomainClusterLayout(cy);
      resolveCollisions(cy, 25);
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
