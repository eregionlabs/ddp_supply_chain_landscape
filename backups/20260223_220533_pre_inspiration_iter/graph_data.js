/* graph_data.js – v5: taxonomy coverage patch (missing categories + executive reps) */

// ── Spotlight path definitions for 3 candidate ideas ──
export const SPOTLIGHT_PATHS = {
  idea_1: {
    label: 'Sensors',
    description: 'Navigation, perception, and altitude sensing chains',
    color: '#3b6fb5'
  },
  idea_2: {
    label: 'Camera / Payload',
    description: 'EO/IR payload optics, stabilization, and encode path',
    color: '#6e5ba8'
  },
  idea_3: {
    label: 'Assembly / Integration / Manufacturing',
    description: 'Final assembly cells, integration/test infrastructure, takt constraints',
    color: '#a67c20'
  }
};

const CATEGORY_SPOTLIGHT_MAP = {
  sensors: 'idea_1',
  camera_payload: 'idea_2',
  assembly_integration_manufacturing: 'idea_3'
};

const TAXONOMY_REPRESENTATIVE_L3 = [
  {
    node_id: 'n_l3_sensors_nav_grade_imu',
    name: 'Nav-grade IMU sensor stack',
    l1_component: 'flight_control_guidance',
    l3_component: 'sensors_nav_grade_imu_bias_stability',
    priority: 1
  },
  {
    node_id: 'n_l3_sensors_altimeter_stack',
    name: 'Terrain/altitude sensing stack',
    l1_component: 'flight_control_guidance',
    l3_component: 'sensors_altimeter_ranging_fusion',
    priority: 1
  },
  {
    node_id: 'n_l3_camera_payload_eoir_gimbal',
    name: 'EO/IR gimbal payload',
    l1_component: 'warhead_integration_safing',
    l3_component: 'camera_payload_eoir_stabilized_gimbal',
    priority: 1
  },
  {
    node_id: 'n_l3_camera_payload_encoder_link',
    name: 'Payload video encode/link chain',
    l1_component: 'warhead_integration_safing',
    l3_component: 'camera_payload_video_encode_transport',
    priority: 2
  },
  {
    node_id: 'n_l3_assembly_integration_final_assembly_cell',
    name: 'Final assembly/integration cell',
    l1_component: 'manufacturing_system',
    l3_component: 'assembly_integration_final_takt_cell',
    priority: 1
  },
  {
    node_id: 'n_l3_assembly_integration_hil_test_rig',
    name: 'HIL integration test rig capacity',
    l1_component: 'manufacturing_system',
    l3_component: 'assembly_integration_hil_rig_capacity',
    priority: 2
  }
];

function truncLabel(s, max) {
  if (!s) return '';
  max = max || 20;
  return s.length <= max ? s : s.slice(0, max - 1) + '\u2026';
}

async function fetchText(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Failed to fetch ${path}: ${r.status}`);
  return await r.text();
}

function parseJSONL(text) {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => JSON.parse(l));
}

function parseCSV(text) {
  const [header, ...rows] = text.trim().split('\n');
  const cols = header.split(',');
  return rows.map(r => {
    const vals = r.match(/("[^"]*"|[^,]+)/g) || [];
    const o = {};
    cols.forEach((c, i) => (o[c] = (vals[i] || '').replace(/^"|"$/g, '')));
    return o;
  });
}

function firstNum(v) {
  if (v == null) return null;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function norm(v, lo, hi) {
  if (v == null || !Number.isFinite(v) || hi <= lo) return null;
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
}

function bottleneckTier(score) {
  const s = Number(score) || 0;
  if (s >= 80) return 3;
  if (s >= 60) return 2;
  if (s >= 40) return 1;
  return 0;
}

function nodeGeometry(nodeType, tier) {
  const nt = String(nodeType || '').toLowerCase();
  if (nt === 'company') {
    return { w: 16, h: 16, tierLabel: 'company' };
  }
  if (nt.includes('l1')) {
    return { w: 88, h: 34, tierLabel: 'anchor' };
  }
  if (nt === 'source' || nt === 'gap') {
    return { w: 9, h: 9, tierLabel: 'evidence' };
  }
  const tiers = [20, 26, 32, 38];
  const d = tiers[Math.max(0, Math.min(3, tier))];
  return { w: d, h: d, tierLabel: `tier_${tier}` };
}

function inferNodeCategory(node) {
  const id = String(node.node_id || '').toLowerCase();
  const l1 = String(node.l1_component || '').toLowerCase();
  const label = String(node.label || node.name || '').toLowerCase();
  const type = String(node.node_type || '').toLowerCase();
  const haystack = `${id} ${l1} ${label} ${type}`;

  if (/(sensor|imu|gnss|altimeter|vision|lidar|radar|navigation)/.test(haystack)) return 'sensors';
  if (/(camera|payload|gimbal|eoir|eo\/ir|video|optic)/.test(haystack)) return 'camera_payload';
  if (/(assembly|integration|manufacturing|takt|line|hil|factory|throughput)/.test(haystack)) return 'assembly_integration_manufacturing';

  if (/(securecomms|secure_comms|crypto|antenna|rf)/.test(haystack)) return 'secure_comms';
  if (/(mcu|bms|control|flight_control)/.test(haystack)) return 'control_electronics';
  if (/(battery|energy|cell|thermal)/.test(haystack)) return 'energy_battery';

  return 'other';
}

function sanitizeBlockerText(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+\|\s+/g, ' | ')
    .trim();
}

function dedupeStrings(values) {
  const out = [];
  const seen = new Set();
  for (const v of values) {
    const t = sanitizeBlockerText(v);
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function parseCompanySignalGaps(md) {
  const byNode = new Map();
  const lines = String(md || '').split('\n');
  for (const line of lines) {
    if (!line.includes('`n_l3_')) continue;
    const nodeMatch = line.match(/`(n_l3_[^`]+)`/);
    if (!nodeMatch) continue;
    const nodeId = nodeMatch[1];
    const parts = line.split('|').map(p => p.trim()).filter(Boolean);
    if (parts.length < 9) continue;
    const snippets = dedupeStrings([parts[2], parts[4], parts[6], parts[8]]);
    if (snippets.length === 0) continue;
    const existing = byNode.get(nodeId) || [];
    byNode.set(nodeId, dedupeStrings([...existing, ...snippets]));
  }
  return byNode;
}

function parseWaveE1LeadtimeNotes(md) {
  const byNode = new Map();
  const lines = String(md || '').split('\n');
  for (const line of lines) {
    if (!line.includes('| `n_l3_')) continue;
    const parts = line.split('|').map(p => p.trim()).filter(Boolean);
    if (parts.length < 5) continue;
    const nodeId = (parts[0] || '').replace(/`/g, '');
    if (!nodeId.startsWith('n_l3_')) continue;
    const decision = sanitizeBlockerText(parts[3]);
    if (!decision) continue;
    const existing = byNode.get(nodeId) || [];
    byNode.set(nodeId, dedupeStrings([...existing, `Wave E1: ${decision}`]));
  }
  return byNode;
}

function buildBlockerSynthesis(gNodes, signalGapMd, waveE1Md) {
  const signalByNode = parseCompanySignalGaps(signalGapMd);
  const e1ByNode = parseWaveE1LeadtimeNotes(waveE1Md);

  const l3ByNode = new Map();
  const l3ByL1 = new Map();
  for (const n of gNodes) {
    const nodeId = n.node_id;
    const nt = String(n.node_type || '').toLowerCase();
    if (!nt.includes('l3')) continue;
    const snippets = dedupeStrings([
      ...(signalByNode.get(nodeId) || []),
      ...(e1ByNode.get(nodeId) || [])
    ]);
    const joined = snippets.join(' | ');
    if (!joined) continue;
    l3ByNode.set(nodeId, joined);
    const l1 = String(n.l1_component || '');
    if (!l1) continue;
    const current = l3ByL1.get(l1) || [];
    l3ByL1.set(l1, dedupeStrings([...current, ...snippets]));
  }

  const l2DisplayByNode = new Map();
  const l1DisplayByNode = new Map();
  for (const n of gNodes) {
    const l1 = String(n.l1_component || '');
    const joined = dedupeStrings(l3ByL1.get(l1) || []).join(' | ');
    const nt = String(n.node_type || '').toLowerCase();
    if (!joined) continue;
    if (nt.includes('l2')) l2DisplayByNode.set(n.node_id, joined);
    if (nt.includes('l1')) l1DisplayByNode.set(n.node_id, joined);
  }

  return { l3ByNode, l2DisplayByNode, l1DisplayByNode };
}

export async function loadElements() {
  const [nodesText, edgesText, gateText, econText, capText, tradeText, l3Text, signalGapMd, waveE1Md] =
    await Promise.all([
      fetchText('../../graph/nodes.jsonl'),
      fetchText('../../graph/edges.jsonl'),
      fetchText('../../analysis/promotion_gate_table_v4.csv'),
      fetchText('../../analysis/l3_unit_econ_stack_v2.jsonl'),
      fetchText('../../analysis/l3_capacity_stack_v2.jsonl'),
      fetchText('../../analysis/l3_trade_compliance_quant_v2.jsonl'),
      fetchText('../../analysis/l3_bottleneck_nodes_v1.jsonl'),
      fetchText('../../analysis/company/company_signal_gaps_v1.md'),
      fetchText('../../analysis/l3_gapfill_waveE1_leadtime_notes.md')
    ]);

  const gNodes = parseJSONL(nodesText);
  const gEdges = parseJSONL(edgesText);
  const gates  = parseCSV(gateText);
  const econ   = parseJSONL(econText);
  const cap    = parseJSONL(capText);
  const trade  = parseJSONL(tradeText);
  const l3Raw  = parseJSONL(l3Text);

  // ── Merge L3 bottleneck nodes into the graph ──
  for (const rep of TAXONOMY_REPRESENTATIVE_L3) {
    l3Raw.push(rep);
  }

  const existingIds = new Set(gNodes.map(n => n.node_id));
  const representativeSet = new Set(TAXONOMY_REPRESENTATIVE_L3.map(n => n.node_id));
  for (const l3 of l3Raw) {
    if (!existingIds.has(l3.node_id)) {
      existingIds.add(l3.node_id);
      gNodes.push({
        node_id: l3.node_id,
        label: l3.name,
        node_type: 'l3_component',
        l1_component: l3.l1_component,
        confidence_level: 'low',
        taxonomy_rep: representativeSet.has(l3.node_id)
      });
      gEdges.push({
        edge_id: `e__l1_to_l3__${l3.node_id}`,
        src_node_id: `n_l1_${l3.l1_component}`,
        dst_node_id: l3.node_id,
        edge_type: 'decomposes_to',
        confidence_level: 'high'
      });
    }
  }

  const blockerSynthesis = buildBlockerSynthesis(gNodes, signalGapMd, waveE1Md);

  const gateByNode  = new Map(gates.map(g => [g.node_id, g]));
  const econByNode  = new Map(econ.map(r => [r.node_id, r]));
  const capByNode   = new Map(cap.map(r => [r.node_id, r]));
  const tradeByNode = new Map(trade.map(r => [r.node_id, r]));

  const leadVals  = cap.map(r => firstNum(r.lead_time)).filter(v => v != null);
  const tradeVals = trade.map(r => firstNum(r.landed_cost_uplift_pct)).filter(v => v != null);
  const capVals   = cap.map(r => firstNum(r.capacity_effective)).filter(v => v != null);

  const leadLo  = Math.min(...leadVals, 0),  leadHi  = Math.max(...leadVals, 1);
  const tradeLo = Math.min(...tradeVals, 0), tradeHi = Math.max(...tradeVals, 1);
  const capLo   = Math.min(...capVals, 0),   capHi   = Math.max(...capVals, 1);

  const nodes = gNodes.map(n => {
    const gate = gateByNode.get(n.node_id)  || {};
    const e    = econByNode.get(n.node_id)  || {};
    const c    = capByNode.get(n.node_id)   || {};
    const t    = tradeByNode.get(n.node_id) || {};



    const leadN  = norm(firstNum(c.lead_time), leadLo, leadHi);
    const tradeN = norm(firstNum(t.landed_cost_uplift_pct), tradeLo, tradeHi);
    const capRaw = norm(firstNum(c.capacity_effective), capLo, capHi);
    const capRisk = capRaw == null ? 0.7 : (1 - capRaw);

    const confText = String(gate.confidence || n.confidence_level || '').toLowerCase();
    const confPenalty = confText.includes('high') ? 0.15
      : confText.includes('medium') ? 0.45 : 0.75;

    const bottleneck = Math.round(
      100 * (0.35 * capRisk + 0.25 * (leadN ?? 0.6) + 0.25 * (tradeN ?? 0.6) + 0.15 * confPenalty)
    );
    const tier = bottleneckTier(bottleneck);
    const geom = nodeGeometry(n.node_type, tier);

    const category = inferNodeCategory(n);
    const thesisTag = CATEGORY_SPOTLIGHT_MAP[category] || 'other';

    // ── Visibility & layer mapping for executive narrative density ──
    const nt = (n.node_type || '').toLowerCase();
    let layer = 'L4';
    if (nt.includes('l1')) layer = 'L1';
    else if (nt.includes('l2')) layer = 'L2';
    else if (nt.includes('l3') || representativeSet.has(n.node_id)) layer = 'L3';
    else if (nt === 'source' || nt === 'gap') layer = 'L4';
    const visibility = 'executive';

    return {
      data: {
        id: n.node_id,
        label: n.label || n.node_id,
        short_label: truncLabel(n.label || n.node_id, geom.tierLabel === 'anchor' ? 34 : 20),
        gate_pass: gate.gate_pass || 'unknown',
        confidence: gate.confidence || n.confidence_level || 'unknown',
        key_blockers: gate.key_blockers || '',
        key_blockers_synth: blockerSynthesis.l3ByNode.get(n.node_id) || '',
        key_blockers_l2_display: blockerSynthesis.l2DisplayByNode.get(n.node_id) || '',
        key_blockers_l1_display: blockerSynthesis.l1DisplayByNode.get(n.node_id) || '',
        key_blockers_fallback:
          gate.key_blockers ||
          blockerSynthesis.l3ByNode.get(n.node_id) ||
          blockerSynthesis.l2DisplayByNode.get(n.node_id) ||
          blockerSynthesis.l1DisplayByNode.get(n.node_id) ||
          '',
        node_type: n.node_type || 'unknown',
        l1_component: n.l1_component || '',
        bottleneck_score: bottleneck,
        bottleneck_tier: tier,
        node_w: geom.w,
        node_h: geom.h,
        node_w_focus: Math.round(geom.w * 1.08),
        node_h_focus: Math.round(geom.h * 1.08),
        node_size_class: geom.tierLabel,
        lead_time: c.lead_time ?? null,
        capacity_effective: c.capacity_effective ?? null,
        landed_cost_uplift_pct: t.landed_cost_uplift_pct ?? null,
        tariff_penalty_pct: t.tariff_penalty_pct ?? null,
        category,
        thesis_tag: thesisTag,
        scenario_base: t.scenario_base ?? null,
        scenario_bull: t.scenario_bull ?? null,
        scenario_bear: t.scenario_bear ?? null,
        landed_cost: e.landed_cost ?? null,
        visibility,
        layer
      }
    };
  });

  const nodeSet = new Set(nodes.map(n => n.data.id));
  const edges = gEdges
    .filter(e => nodeSet.has(e.src_node_id) && nodeSet.has(e.dst_node_id))
    .map(e => ({
      data: {
        id: e.edge_id || `${e.src_node_id}__${e.dst_node_id}`,
        source: e.src_node_id,
        target: e.dst_node_id,
        dependency_type: e.edge_type || 'depends_on',
        confidence: e.confidence_level || 'unknown'
      }
    }));

  return [...nodes, ...edges];
}

export async function loadCompanyOverlay() {
  const r = await fetch('./company_overlay_v2.json');
  if (!r.ok) throw new Error(`Failed to fetch company overlay: ${r.status}`);
  const data = await r.json();
  return { nodes: data.nodes || [], edges: data.edges || [] };
}

export async function loadCompanyRollupL1() {
  const r = await fetch('./company_rollup_l1_v1.json');
  if (!r.ok) throw new Error(`Failed to fetch L1 company rollup: ${r.status}`);
  const data = await r.json();
  return data || {};
}

export async function loadCompanyRollupL2() {
  const r = await fetch('./company_rollup_l2_v1.json');
  if (!r.ok) throw new Error(`Failed to fetch L2 company rollup: ${r.status}`);
  const data = await r.json();
  return data || {};
}

