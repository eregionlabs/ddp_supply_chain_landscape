/* ── styles.js ── Cytoscape stylesheet: domain-aware colors + pressure encoding ── */
/*
 * Dark canvas (#0D1117 base). Two visual dimensions:
 *   1. Domain identity → accent color tint on node fill & border
 *   2. Pressure severity → saturation + brightness ramp (neutral → vivid warm)
 *
 * Typography encodes hierarchy:
 *   L1 — large, uppercase, tracked, high contrast
 *   L2 — medium, bold, centered
 *   L3 — light, ghosted until hovered or high-pressure
 *
 * Edges: subtle domain-tinted lines — structural hints, not dominant.
 */

import { getLayerValue, getTightnessIndex, getTightnessTier } from './utils.js';
import { DOMAIN_TINTS } from './graph_data.js';

function confOpacity(ele) {
  const c = (ele.data('confidence') || '').toLowerCase();
  if (c.includes('high'))   return 1.0;
  if (c.includes('medium')) return 0.82;
  return 0.58;
}

function btiRatio(ele) {
  return Math.max(0, Math.min(1, getTightnessIndex(ele) / 100));
}

/* Parse hex to {r,g,b} */
function hexRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

/* Get domain accent for a node */
function domainAccent(ele) {
  const l1 = (ele.data('l1_component') || '').trim();
  return DOMAIN_TINTS[l1] || DOMAIN_TINTS.other || '#64748B';
}

/* ── Pressure-aware fill that blends domain accent color ──
 *  t=0.0  → dark muted (barely visible, domain-tinted)
 *  t=0.5  → warm mid (domain accent showing through)
 *  t=1.0  → vivid warm-red (pressure dominates)
 */
function pressureFill(ele) {
  const t = btiRatio(ele);
  const accent = hexRgb(domainAccent(ele));

  /* Base: very dark with subtle domain tint */
  const baseR = 22 + accent.r * 0.08;
  const baseG = 28 + accent.g * 0.06;
  const baseB = 36 + accent.b * 0.08;

  /* Hot: vivid warm red */
  const hotR = 220, hotG = 50, hotB = 45;

  /* Blend with non-linear curve (pressure accelerates toward red) */
  const curve = Math.pow(t, 1.6);
  const r = Math.round(baseR + (hotR - baseR) * curve);
  const g = Math.round(baseG + (hotG - baseG) * curve);
  const b = Math.round(baseB + (hotB - baseB) * curve);

  return `rgb(${r}, ${g}, ${b})`;
}

function pressureBorder(ele) {
  const t = btiRatio(ele);
  const accent = hexRgb(domainAccent(ele));
  const curve = Math.pow(t, 1.4);

  /* Low pressure: domain accent at low opacity; high: bright warm */
  const r = Math.round(accent.r * 0.35 * (1 - curve) + 200 * curve);
  const g = Math.round(accent.g * 0.35 * (1 - curve) + 60 * curve);
  const b = Math.round(accent.b * 0.35 * (1 - curve) + 50 * curve);
  const a = 0.25 + t * 0.55;

  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}

function labelOpacity(ele) {
  const layer = String(ele.data('layer') || '').toUpperCase();
  if (layer === 'L1') return 1;
  if (layer === 'L2') return 0.88;
  if (layer === 'L3') {
    const tier = getTightnessTier(ele);
    if (tier >= 3) return 0.72;
    if (tier >= 2) return 0.48;
    return 0.22;
  }
  if (getTightnessTier(ele) >= 3) return 0.58;
  return 0.12;
}

function nodeFill(ele) {
  const nt = (ele.data('node_type') || '').toLowerCase();
  if (nt === 'company')                                    return 'rgba(100, 116, 139, 0.3)';
  if (nt === 'source' || nt === 'gap' || nt === 'source_ref') return 'rgba(30, 38, 50, 0.6)';
  return pressureFill(ele);
}

function nodeBorder(ele) {
  const nt = (ele.data('node_type') || '').toLowerCase();
  if (nt === 'company')                                    return 'rgba(100, 116, 139, 0.4)';
  if (nt === 'source' || nt === 'gap' || nt === 'source_ref') return 'rgba(50, 60, 75, 0.5)';
  return pressureBorder(ele);
}

/* ── Edge color: faint domain-tinted or neutral white ── */
function edgeColor(ele) {
  const srcL1 = (ele.source().data('l1_component') || '').trim();
  const accent = DOMAIN_TINTS[srcL1] || '#94A3B8';
  const { r, g, b } = hexRgb(accent);
  return `rgba(${r}, ${g}, ${b}, 0.10)`;
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
        if (layer === 'L1') return 170;
        if (layer === 'L2') return 120;
        return 82;
      },
      'font-size':          10,
      'font-family':        '"Inter", system-ui, -apple-system, sans-serif',
      'font-weight':        500,
      'color':              '#CBD5E1',
      'text-outline-color': '#0D1117',
      'text-outline-width': 2.2,
      'text-background-color': 'rgba(13, 17, 23, 0.70)',
      'text-background-opacity': 0.70,
      'text-background-shape': 'roundrectangle',
      'text-background-padding': 2,
      'text-valign':        'bottom',
      'text-margin-y':      7,
      'text-opacity':       labelOpacity,
      'background-color':   nodeFill,
      'border-width':       ele => {
        const nt = (ele.data('node_type') || '').toLowerCase();
        if (nt === 'source' || nt === 'gap' || nt === 'source_ref') return 0.5;
        if (nt.includes('l1')) return 2.2;
        if (nt.includes('l2')) return 1.5;
        return 0.9;
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

  /* ── L1 domain anchors ── */
  {
    selector: 'node[node_type = "l1_domain"], node[node_type = "l1_component"]',
    style: {
      'font-family':            '"Manrope", "Inter", system-ui, sans-serif',
      'font-size':              13,
      'font-weight':            700,
      'text-transform':         'uppercase',
      'color':                  '#E2E8F0',
      'text-outline-color':     '#0D1117',
      'text-outline-width':     3.2,
      'text-background-opacity': 0.82,
      'text-valign':            'center',
      'text-margin-y':          0
    }
  },

  /* ── L2 ── */
  {
    selector: 'node[layer = "L2"]',
    style: {
      'font-size':              9.5,
      'font-weight':            650,
      'text-background-opacity': 0.25,
      'text-valign':            'center',
      'text-margin-y':          0,
      'text-outline-width':     2.4,
      'shape':                  'round-rectangle'
    }
  },

  /* ── L3 ── */
  {
    selector: 'node[layer = "L3"]',
    style: {
      'font-size':              8,
      'font-weight':            420,
      'color':                  '#64748B',
      'text-background-opacity': 0.45,
      'text-outline-width':     1.6,
      'text-margin-y':          5
    }
  },

  /* ── Source / gap ── */
  {
    selector: 'node[node_type = "source"], node[node_type = "gap"], node[node_type = "source_ref"]',
    style: {
      'font-size': 0,
      'opacity':   0.25
    }
  },

  /* ── Company ── */
  {
    selector: 'node[node_type = "company"]',
    style: {
      'font-size':  7.5,
      'font-weight': 450,
      'color':      '#64748B'
    }
  },

  /* ── Tier-3 bottleneck accent — bold ring ── */
  {
    selector: 'node[bottleneck_tightness_tier_v2 = 3], node[bottleneck_tightness_tier_v1 = 3], node[bottleneck_tier = 3]',
    style: {
      'border-width': 2.8
    }
  },

  /* ── Edges ── */
  {
    selector: 'edge',
    style: {
      'curve-style':        'bezier',
      'target-arrow-shape': 'triangle',
      'arrow-scale':        0.42,
      'line-color':         edgeColor,
      'target-arrow-color': edgeColor,
      'width':              0.5,
      'opacity':            1,
      'line-style':         'solid'
    }
  },
  {
    selector: 'edge[dependency_type = "decomposes_to"]',
    style: {
      'width': 0.75
    }
  },
  {
    selector: 'edge[dependency_type = "constrained_by_gap"]',
    style: {
      'width':      0.6,
      'line-style': 'solid'
    }
  },
  {
    selector: 'edge[dependency_type = "evidenced_by"]',
    style: {
      'line-style': 'dashed',
      'width':      0.4
    }
  },
  {
    selector: 'edge[dependency_type = "depends_on_company"], edge[dependency_type = "supplied_by"]',
    style: {
      'line-style':         'dotted',
      'width':              0.35,
      'line-color':         'rgba(100, 116, 139, 0.06)',
      'target-arrow-color': 'rgba(100, 116, 139, 0.06)'
    }
  },
  {
    selector: 'edge[hierarchy_rank = 1], edge[hierarchy_rank = 2]',
    style: {
      'width': 0.9
    }
  },
  /* ── Cross-domain edges ── */
  {
    selector: 'edge[?cross_domain]',
    style: {
      'curve-style': 'unbundled-bezier',
      'width': 0.5,
      'line-style': 'dotted',
      'line-color': 'rgba(148, 163, 184, 0.05)',
      'target-arrow-color': 'rgba(148, 163, 184, 0.05)'
    }
  },

  /* ── Hover ── */
  {
    selector: '.hover',
    style: {
      'text-opacity':    1,
      'font-weight':     700,
      'color':           '#F1F5F9',
      'overlay-opacity': 0
    }
  },

  /* ── State classes ── */
  { selector: '.dim', style: {
    'opacity': 0.06, 'text-opacity': 0.02
  }},
  { selector: '.top10', style: {
    'opacity': 1, 'text-opacity': 1,
    'border-width': 2.8, 'border-color': '#EF4444',
    'overlay-opacity': 0
  }},
  /* Focus — selected node on top with accent border */
  { selector: '.focus', style: {
    'opacity': 1, 'text-opacity': 1,
    'width': 'data(node_w_focus)', 'height': 'data(node_h_focus)',
    'border-width': 2.8, 'border-color': '#38BDF8',
    'overlay-opacity': 0,
    'z-index': 9999
  }},
  { selector: '.focus-context', style: {
    'opacity': 1, 'text-opacity': 1,
    'border-width': 1.5, 'border-color': 'rgba(56, 189, 248, 0.35)',
    'overlay-opacity': 0,
    'z-index': 9998
  }},
  { selector: '.focus-edge', style: {
    'opacity': 1,
    'line-color': 'rgba(56, 189, 248, 0.45)', 'target-arrow-color': 'rgba(56, 189, 248, 0.45)',
    'width': 1.6,
    'z-index': 9997
  }},
  /* Dim everything not connected to the focused node */
  { selector: '.focus-dim', style: {
    'opacity': 0.08, 'text-opacity': 0.03
  }},

  /* ── Chain highlight ── */
  { selector: '.chain-dim', style: {
    'opacity': 0.04, 'text-opacity': 0
  }},
  { selector: '.chain-source', style: {
    'opacity': 1, 'text-opacity': 1,
    'border-width': 3, 'border-color': '#38BDF8',
    'overlay-opacity': 0
  }},
  { selector: '.chain-node', style: {
    'opacity': 1, 'text-opacity': 1,
    'overlay-opacity': 0
  }},
  { selector: '.chain-edge', style: {
    'opacity': 1,
    'line-color': 'rgba(56, 189, 248, 0.40)', 'target-arrow-color': 'rgba(56, 189, 248, 0.40)',
    'width': 1.5
  }},

  /* ── Progressive disclosure classes ── */
  { selector: 'node.collapsed', style: {
    'width': 160, 'height': 56,
    'border-width': 2.8, 'border-color': 'rgba(255, 255, 255, 0.15)',
    'background-color': '#141B27',
    'font-size': 14, 'text-valign': 'center', 'text-margin-y': 0
  }},
  { selector: 'node.hotspot', style: {
    'opacity': 0.75, 'border-width': 1.8,
    'border-color': 'rgba(239, 68, 68, 0.50)', 'text-opacity': 0.58
  }},
  { selector: '.expanding', style: {
    'transition-property': 'opacity', 'transition-duration': '400ms'
  }}
];
