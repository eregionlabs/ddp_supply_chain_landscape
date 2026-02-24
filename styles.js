/* ── styles.js ── Cytoscape stylesheet + color/opacity helpers ── */

import { getLayerValue, getTightnessIndex, getTightnessTier } from './utils.js';

function confOpacity(ele) {
  const c = (ele.data('confidence') || '').toLowerCase();
  if (c.includes('high'))   return 1.0;
  if (c.includes('medium')) return 0.72;
  return 0.48;
}

function btiRatio(ele) {
  return Math.max(0, Math.min(1, getTightnessIndex(ele) / 100));
}

function btiFillColor(ele) {
  const layer = getLayerValue(ele.data('layer'));
  const t = btiRatio(ele);
  if (layer === 'L1') return `hsl(214, 64%, ${94 - t * 46}%)`;
  if (layer === 'L2') return `hsl(194, 22%, ${91 - t * 28}%)`;
  if (layer === 'L3') return `hsl(16, 78%, ${92 - t * 50}%)`;
  return '#d1d5db';
}

function btiBorderColor(ele) {
  const layer = getLayerValue(ele.data('layer'));
  const t = btiRatio(ele);
  if (layer === 'L1') return `hsl(214, 70%, ${44 - t * 12}%)`;
  if (layer === 'L2') return `hsl(194, 24%, ${38 - t * 10}%)`;
  if (layer === 'L3') return `hsl(14, 78%, ${42 - t * 15}%)`;
  return '#94a3b8';
}

function labelOpacity(ele) {
  const layer = String(ele.data('layer') || '').toUpperCase();
  if (layer === 'L1') return 1;
  if (layer === 'L2') return 0.92;
  if (layer === 'L3') {
    const tier = getTightnessTier(ele);
    if (tier >= 3) return 0.88;
    if (tier >= 2) return 0.72;
    return 0.52;
  }
  if (getTightnessTier(ele) >= 3) return 0.74;
  return 0.14;
}

function nodeFill(ele) {
  const nt = (ele.data('node_type') || '').toLowerCase();
  if (nt === 'company')                 return '#94a3b8';
  if (nt === 'source' || nt === 'gap' || nt === 'source_ref')  return '#d1d5db';
  return btiFillColor(ele);
}

function nodeBorder(ele) {
  const nt = (ele.data('node_type') || '').toLowerCase();
  if (nt === 'company')                 return '#64748b';
  if (nt === 'source' || nt === 'gap' || nt === 'source_ref')  return '#b0b8c4';
  return btiBorderColor(ele);
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
        if (layer === 'L1') return 130;
        if (layer === 'L2') return 112;
        return 86;
      },
      'font-size':          10,
      'font-family':        '"Inter", system-ui, -apple-system, sans-serif',
      'font-weight':        600,
      'color':              '#0f172a',
      'text-outline-color': '#f7f8fb',
      'text-outline-width': 2.2,
      'text-background-color': '#f5f6f9',
      'text-background-opacity': 0.72,
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
        return 1.0;
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

  /* ── L1 capsule anchors — centered label, bold type ── */
  {
    selector: 'node[node_type = "l1_domain"], node[node_type = "l1_component"]',
    style: {
      'font-family':        '"Manrope", "Inter", system-ui, sans-serif',
      'font-size':          11,
      'font-weight':        800,
      'color':              '#0f172a',
      'text-outline-width': 2.8,
      'text-background-opacity': 0.88,
      'text-valign':        'center',
      'text-margin-y':      0
    }
  },
  {
    selector: 'node[layer = "L2"]',
    style: {
      'font-size': 10,
      'font-weight': 650,
      'text-background-opacity': 0.2,
      'text-valign': 'center',
      'text-margin-y': 0,
      'text-outline-width': 2.6,
      'shape': 'round-rectangle'
    }
  },
  {
    selector: 'node[layer = "L3"]',
    style: {
      'font-size': 8.5,
      'font-weight': 560,
      'text-background-opacity': 0.58,
      'text-margin-y': 6
    }
  },

  /* ── Source / gap — contextual satellite dots ── */
  {
    selector: 'node[node_type = "source"], node[node_type = "gap"], node[node_type = "source_ref"]',
    style: {
      'font-size': 0,
      'opacity':   0.32
    }
  },

  /* ── Company — small, quiet ── */
  {
    selector: 'node[node_type = "company"]',
    style: {
      'font-size':  8,
      'font-weight': 500,
      'color':      '#5c6b7f'
    }
  },

  /* ── Tier-3 bottleneck accent — bold ring ── */
  {
    selector: 'node[bottleneck_tightness_tier_v2 = 3], node[bottleneck_tightness_tier_v1 = 3], node[bottleneck_tier = 3]',
    style: {
      'border-width': 2.4
    }
  },

  /* ── Edge hierarchy — quieter, cleaner ── */
  {
    selector: 'edge',
    style: {
      'curve-style':        'bezier',
      'target-arrow-shape': 'triangle',
      'arrow-scale':        0.52,
      'line-color':         '#cbd5e1',
      'target-arrow-color': '#cbd5e1',
      'width':              0.8,
      'opacity':            0.28,
      'line-style':         'solid'
    }
  },
  {
    selector: 'edge[dependency_type = "decomposes_to"]',
    style: {
      'line-color':         '#94a3b8',
      'target-arrow-color': '#94a3b8',
      'width':              1.4,
      'opacity':            0.46
    }
  },
  {
    selector: 'edge[dependency_type = "constrained_by_gap"]',
    style: {
      'line-color':         '#f59e0b',
      'target-arrow-color': '#f59e0b',
      'width':              1.1,
      'opacity':            0.38,
      'line-style':         'solid'
    }
  },
  {
    selector: 'edge[dependency_type = "evidenced_by"]',
    style: {
      'line-color':         '#cbd5e1',
      'target-arrow-color': '#cbd5e1',
      'line-style':         'dashed',
      'width':              0.7,
      'opacity':            0.18
    }
  },
  {
    selector: 'edge[dependency_type = "depends_on_company"], edge[dependency_type = "supplied_by"]',
    style: {
      'line-color':         '#e2e8f0',
      'target-arrow-color': '#e2e8f0',
      'line-style':         'dotted',
      'width':              0.6,
      'opacity':            0.14
    }
  },
  {
    selector: 'edge[hierarchy_rank = 1], edge[hierarchy_rank = 2]',
    style: {
      'width': 1.35,
      'opacity': 0.44
    }
  },

  /* ── Hover — label reveal ── */
  {
    selector: '.hover',
    style: {
      'text-opacity':    1,
      'font-weight':     700,
      'overlay-opacity': 0
    }
  },

  /* ── State classes — subtle de-emphasis outside focus ── */
  { selector: '.dim', style: {
    'opacity': 0.08, 'text-opacity': 0
  }},
  { selector: '.top10', style: {
    'opacity': 1, 'text-opacity': 1,
    'border-width': 2.4, 'border-color': '#ea580c',
    'overlay-opacity': 0
  }},
  { selector: '.spotlight', style: {
    'opacity': 1, 'text-opacity': 1,
    'border-width': 2.2, 'overlay-opacity': 0
  }},
  { selector: '.spotlight-1', style: { 'border-color': '#3b6fb5' } },
  { selector: '.spotlight-2', style: { 'border-color': '#6e5ba8' } },
  { selector: '.spotlight-3', style: { 'border-color': '#d97706' } },
  { selector: '.spotlight-edge', style: {
    'opacity': 0.78, 'width': 1.8,
    'line-color': '#3b6fb5', 'target-arrow-color': '#3b6fb5'
  }},
  /* Focus — clean blue border + slight scale */
  { selector: '.focus', style: {
    'opacity': 1, 'text-opacity': 1,
    'width': 'data(node_w_focus)', 'height': 'data(node_h_focus)',
    'border-width': 2.6, 'border-color': '#3b82f6',
    'overlay-opacity': 0
  }},
  { selector: '.focus-context', style: {
    'opacity': 0.85, 'text-opacity': 1,
    'border-width': 1.4, 'border-color': '#64748b',
    'overlay-opacity': 0
  }},
  { selector: '.focus-edge', style: {
    'opacity': 0.82, 'width': 1.6,
    'line-color': '#3b82f6', 'target-arrow-color': '#3b82f6'
  }}
];
