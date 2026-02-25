/* ── styles.js ── Cytoscape stylesheet + color/opacity helpers ── */
/*
 * Dark canvas (#13171C base). Color encodes ONE thing: pressure.
 *   t = 0  → muted steel    hsl(210, 8%, 30%)
 *   t = 1  → vivid red      hsl(0, 72%, 54%)
 * All nodes start neutral. Red earns its meaning.
 *
 * Typography encodes hierarchy:
 *   L1 — large, uppercase, tracked, restrained
 *   L2 — medium, bold, centered
 *   L3 — light, ghosted until hovered or high-pressure
 *
 * Edges: rgba(255,255,255, 0.06–0.10) — structural hints, not dominant.
 */

import { getLayerValue, getTightnessIndex, getTightnessTier } from './utils.js';

function confOpacity(ele) {
  const c = (ele.data('confidence') || '').toLowerCase();
  if (c.includes('high'))   return 1.0;
  if (c.includes('medium')) return 0.78;
  return 0.52;
}

function btiRatio(ele) {
  return Math.max(0, Math.min(1, getTightnessIndex(ele) / 100));
}

/* ── Pressure gradient for dark canvas ──
 *  Hue pinned near red (8→0) — no rainbow path through green/cyan.
 *  Low pressure blends into dark bg; high pressure pops vivid red.
 *  t=0.0  hsl(8, 8%, 30%)   — muted warm gray
 *  t=0.5  hsl(4, 40%, 42%)  — dusky warm
 *  t=1.0  hsl(0, 72%, 54%)  — vivid red
 */
function pressureFill(ele) {
  const t = btiRatio(ele);
  const h = 8 - t * 8;                  //  8 → 0  (warm → red, no rainbow)
  const s = 8 + t * 64;                 //  8% → 72%
  const l = 30 + t * 24;                // 30% → 54%
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

function pressureBorder(ele) {
  const t = btiRatio(ele);
  const h = 8 - t * 8;
  const s = 10 + t * 55;                // 10% → 65%
  const l = 22 + t * 16;                // 22% → 38%
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

function labelOpacity(ele) {
  const layer = String(ele.data('layer') || '').toUpperCase();
  if (layer === 'L1') return 1;
  if (layer === 'L2') return 0.85;
  if (layer === 'L3') {
    const tier = getTightnessTier(ele);
    if (tier >= 3) return 0.68;
    if (tier >= 2) return 0.42;
    return 0.20;
  }
  if (getTightnessTier(ele) >= 3) return 0.55;
  return 0.12;
}

function nodeFill(ele) {
  const nt = (ele.data('node_type') || '').toLowerCase();
  if (nt === 'company')                                    return '#384152';
  if (nt === 'source' || nt === 'gap' || nt === 'source_ref') return '#242b36';
  return pressureFill(ele);
}

function nodeBorder(ele) {
  const nt = (ele.data('node_type') || '').toLowerCase();
  if (nt === 'company')                                    return '#4b5563';
  if (nt === 'source' || nt === 'gap' || nt === 'source_ref') return '#384152';
  return pressureBorder(ele);
}

export const cyStyles = [
  /* ── Base node ── */
  {
    selector: 'node',
    style: {
      'label':              'data(short_label)',
      'text-wrap':          'wrap',
      'text-max-width':     ele => {
        const layer = String(ele.data('layer') || '').toUpperCase();
        if (layer === 'L1') return 160;
        if (layer === 'L2') return 112;
        return 78;
      },
      'font-size':          10,
      'font-family':        '"Inter", system-ui, -apple-system, sans-serif',
      'font-weight':        500,
      'color':              '#c8d1dc',
      'text-outline-color': '#13171C',
      'text-outline-width': 2,
      'text-background-color': 'rgba(19, 23, 28, 0.65)',
      'text-background-opacity': 0.65,
      'text-background-shape': 'roundrectangle',
      'text-background-padding': 2,
      'text-valign':        'bottom',
      'text-margin-y':      7,
      'text-opacity':       labelOpacity,
      'background-color':   nodeFill,
      'border-width':       ele => {
        const nt = (ele.data('node_type') || '').toLowerCase();
        if (nt === 'source' || nt === 'gap' || nt === 'source_ref') return 0.5;
        if (nt.includes('l1')) return 2;
        if (nt.includes('l2')) return 1.4;
        return 0.8;
      },
      'border-color':       nodeBorder,
      'width':              'data(node_w)',
      'height':             'data(node_h)',
      'shape':              ele => {
        const nt = (ele.data('node_type') || '').toLowerCase();
        if (nt === 'company')  return 'diamond';
        if (nt.includes('l1')) return 'round-rectangle';
        return 'ellipse';
      },
      'opacity':            confOpacity,
      'overlay-padding':    3,
      'overlay-opacity':    0
    }
  },

  /* ── L1 domain anchors — large, uppercase, tracked, restrained ── */
  {
    selector: 'node[node_type = "l1_domain"], node[node_type = "l1_component"]',
    style: {
      'font-family':            '"Manrope", "Inter", system-ui, sans-serif',
      'font-size':              13,
      'font-weight':            700,
      'text-transform':         'uppercase',
      'color':                  '#e2e8f0',
      'text-outline-color':     '#13171C',
      'text-outline-width':     3,
      'text-background-opacity': 0.80,
      'text-valign':            'center',
      'text-margin-y':          0
    }
  },

  /* ── L2 — medium weight, centered ── */
  {
    selector: 'node[layer = "L2"]',
    style: {
      'font-size':              9.5,
      'font-weight':            650,
      'text-background-opacity': 0.20,
      'text-valign':            'center',
      'text-margin-y':          0,
      'text-outline-width':     2.4,
      'shape':                  'round-rectangle'
    }
  },

  /* ── L3 — light, ghosted at rest ── */
  {
    selector: 'node[layer = "L3"]',
    style: {
      'font-size':              8,
      'font-weight':            420,
      'color':                  '#6b7a8d',
      'text-background-opacity': 0.40,
      'text-outline-width':     1.6,
      'text-margin-y':          5
    }
  },

  /* ── Source / gap — contextual satellite dots ── */
  {
    selector: 'node[node_type = "source"], node[node_type = "gap"], node[node_type = "source_ref"]',
    style: {
      'font-size': 0,
      'opacity':   0.28
    }
  },

  /* ── Company — quiet slate ── */
  {
    selector: 'node[node_type = "company"]',
    style: {
      'font-size':  7.5,
      'font-weight': 450,
      'color':      '#7a8696'
    }
  },

  /* ── Tier-3 bottleneck accent — bold ring ── */
  {
    selector: 'node[bottleneck_tightness_tier_v2 = 3], node[bottleneck_tightness_tier_v1 = 3], node[bottleneck_tier = 3]',
    style: {
      'border-width': 2.6
    }
  },

  /* ── Edges — rgba white on dark canvas, structural hints ── */
  {
    selector: 'edge',
    style: {
      'curve-style':        'bezier',
      'target-arrow-shape': 'triangle',
      'arrow-scale':        0.42,
      'line-color':         'rgba(255, 255, 255, 0.06)',
      'target-arrow-color': 'rgba(255, 255, 255, 0.06)',
      'width':              0.45,
      'opacity':            1,
      'line-style':         'solid'
    }
  },
  {
    selector: 'edge[dependency_type = "decomposes_to"]',
    style: {
      'line-color':         'rgba(255, 255, 255, 0.10)',
      'target-arrow-color': 'rgba(255, 255, 255, 0.10)',
      'width':              0.7
    }
  },
  {
    selector: 'edge[dependency_type = "constrained_by_gap"]',
    style: {
      'line-color':         'rgba(255, 255, 255, 0.08)',
      'target-arrow-color': 'rgba(255, 255, 255, 0.08)',
      'width':              0.6,
      'line-style':         'solid'
    }
  },
  {
    selector: 'edge[dependency_type = "evidenced_by"]',
    style: {
      'line-color':         'rgba(255, 255, 255, 0.04)',
      'target-arrow-color': 'rgba(255, 255, 255, 0.04)',
      'line-style':         'dashed',
      'width':              0.4
    }
  },
  {
    selector: 'edge[dependency_type = "depends_on_company"], edge[dependency_type = "supplied_by"]',
    style: {
      'line-color':         'rgba(255, 255, 255, 0.03)',
      'target-arrow-color': 'rgba(255, 255, 255, 0.03)',
      'line-style':         'dotted',
      'width':              0.35
    }
  },
  {
    selector: 'edge[hierarchy_rank = 1], edge[hierarchy_rank = 2]',
    style: {
      'line-color':         'rgba(255, 255, 255, 0.14)',
      'target-arrow-color': 'rgba(255, 255, 255, 0.14)',
      'width': 0.8
    }
  },
  /* ── Cross-domain edges (company overlay) — thin, dotted, quiet ── */
  {
    selector: 'edge[?cross_domain]',
    style: {
      'curve-style': 'unbundled-bezier',
      'width': 0.5,
      'line-style': 'dotted',
      'line-color': 'rgba(255, 255, 255, 0.05)',
      'target-arrow-color': 'rgba(255, 255, 255, 0.05)'
    }
  },

  /* ── Hover — label reveal, full opacity ── */
  {
    selector: '.hover',
    style: {
      'text-opacity':    1,
      'font-weight':     700,
      'color':           '#f1f5f9',
      'overlay-opacity': 0
    }
  },

  /* ── State classes ── */
  { selector: '.dim', style: {
    'opacity': 0.08, 'text-opacity': 0.02
  }},
  { selector: '.top10', style: {
    'opacity': 1, 'text-opacity': 1,
    'border-width': 2.6, 'border-color': '#ef4444',
    'overlay-opacity': 0
  }},
  { selector: '.spotlight', style: {
    'opacity': 1, 'text-opacity': 1,
    'border-width': 2.2, 'overlay-opacity': 0
  }},
  { selector: '.spotlight-1', style: { 'border-color': '#94a3b8' } },
  { selector: '.spotlight-2', style: { 'border-color': '#cbd5e1' } },
  { selector: '.spotlight-3', style: { 'border-color': '#a8a29e' } },
  { selector: '.spotlight-edge', style: {
    'opacity': 1,
    'line-color': 'rgba(255, 255, 255, 0.35)', 'target-arrow-color': 'rgba(255, 255, 255, 0.35)',
    'width': 1.4
  }},
  /* Focus — light border on dark canvas */
  { selector: '.focus', style: {
    'opacity': 1, 'text-opacity': 1,
    'width': 'data(node_w_focus)', 'height': 'data(node_h_focus)',
    'border-width': 2.6, 'border-color': '#94a3b8',
    'overlay-opacity': 0
  }},
  { selector: '.focus-context', style: {
    'opacity': 0.85, 'text-opacity': 1,
    'border-width': 1.4, 'border-color': '#64748b',
    'overlay-opacity': 0
  }},
  { selector: '.focus-edge', style: {
    'opacity': 1,
    'line-color': 'rgba(255, 255, 255, 0.40)', 'target-arrow-color': 'rgba(255, 255, 255, 0.40)',
    'width': 1.5
  }},

  /* ── Chain highlight (bottleneck panel hover) — overrides all prior state ── */
  { selector: '.chain-dim', style: {
    'opacity': 0.04, 'text-opacity': 0
  }},
  { selector: '.chain-source', style: {
    'opacity': 1, 'text-opacity': 1,
    'border-width': 2.8, 'border-color': '#f1f5f9',
    'overlay-opacity': 0
  }},
  { selector: '.chain-node', style: {
    'opacity': 1, 'text-opacity': 1,
    'overlay-opacity': 0
  }},
  { selector: '.chain-edge', style: {
    'opacity': 1,
    'line-color': 'rgba(255, 255, 255, 0.35)', 'target-arrow-color': 'rgba(255, 255, 255, 0.35)',
    'width': 1.4
  }},

  /* ── Progressive disclosure classes ── */
  { selector: 'node.collapsed', style: {
    'width': 160, 'height': 56,
    'border-width': 2.8, 'border-color': 'rgba(255, 255, 255, 0.18)',
    'background-color': '#1e2530',
    'font-size': 14, 'text-valign': 'center', 'text-margin-y': 0
  }},
  { selector: 'node.hotspot', style: {
    'opacity': 0.72, 'border-width': 1.6,
    'border-color': 'rgba(239, 68, 68, 0.45)', 'text-opacity': 0.55
  }},
  { selector: '.expanding', style: {
    'transition-property': 'opacity', 'transition-duration': '400ms'
  }}
];
