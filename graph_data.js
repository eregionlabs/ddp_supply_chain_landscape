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

const DOMAIN_TINTS = {
  manufacturing_system: '#e0e7ff',
  flight_control_guidance: '#d1fae5',
  warhead_integration_safing: '#fee2e2',
  secure_communications: '#ede9fe',
  propulsion_system: '#ffedd5',
  power_energy_system: '#fef3c7',
  navigation_system: '#dbeafe',
  payload_system: '#f3e8ff',
  software_autonomy_system: '#e0e7ff',
  launch_support_system: '#dcfce7',
  other: '#f1f5f9'
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

function prettifyTokenLabel(token) {
  if (!token) return '';
  return String(token)
    .replace(/[`']/g, '')
    .replace(/^l\d[-_]/i, '')
    .replace(/\b(osti|usgs|uscode|census|dfars|faa|doe|hs\d+)\b/gi, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b([a-z])/g, c => c.toUpperCase());
}

const L2_LABEL_OVERRIDES = {
  n_l2_energy_storage_source_id: 'Source Mapping',
  n_l2_energy_storage_l1_energy_osti_1737479: 'Battery Manufacturing Methods',
  n_l2_energy_storage_l1_energy_doe_blueprint_2021: 'Domestic Capacity Strategy',
  n_l2_energy_storage_l1_energy_usgs_mcs2026: 'Critical Minerals Dependence',
  n_l2_energy_storage_l1_energy_census_hs850760_2024_2025: 'Import Exposure (HS 850760)',
  n_l2_energy_storage_l1_energy_uscode_26_45x: '45X Production Credit Exposure',
  n_l2_energy_storage_l1_energy_faa_lithium_batteries_guidance: 'Battery Safety / Transport Rules',
  n_l2_energy_storage_l1_energy_uscode_10_4872: 'Defense Acquisition Constraint (10 USC 4872)',
  n_l2_propulsion_source_id: 'Source Mapping',
  n_l2_propulsion_l1_prop_osti_1871577: 'Motor Manufacturing Methods',
  n_l2_propulsion_l1_prop_usgs_mcs2026: 'Magnet Materials Dependence',
  n_l2_propulsion_l1_prop_census_hs850131_2024_2025: 'Import Exposure (HS 850131)',
  n_l2_propulsion_l1_prop_uscode_10_4872: 'Defense Acquisition Constraint (10 USC 4872)',
  n_l2_propulsion_l1_prop_dfars_2257018: 'Specialty Metals Compliance (DFARS 225.7018)'
};

function sourceRefTokenFromNode(node) {
  const id = String(node.node_id || '');
  const m = id.match(/^n_l2_[^_]+_(.+)$/i);
  const fromId = m ? m[1] : '';
  const fromLabel = String(node.label || '').replace(/[`']/g, '').trim();
  return (fromId || fromLabel || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isSourceReferencePseudoNode(node) {
  const nt = String(node.node_type || '').toLowerCase();
  if (!nt.includes('l2')) return false;
  const id = String(node.node_id || '').toLowerCase();
  const label = String(node.label || '').replace(/[`']/g, '').toLowerCase().trim();
  const token = sourceRefTokenFromNode(node);
  if (label === 'source id') return true;
  if (id.endsWith('_source_id')) return true;
  if (token.startsWith('l1-') || token.startsWith('l1_')) return true;
  if (/(^|[-_])(osti|uscode|usgs|census|dfars|faa|doe|hs\d{4,})($|[-_])/i.test(token)) return true;
  return false;
}

function cleanDisplayLabel(node) {
  const layer = layerFromNodeType(node.node_type, new Set(), node.node_id, node);
  let label = String(node.label || '').replace(/[`']/g, '').trim();
  const isSourceRef = isSourceReferencePseudoNode(node);
  if (layer !== 'L2' && !isSourceRef) return label || node.node_id;

  const nid = String(node.node_id || '');
  if (L2_LABEL_OVERRIDES[nid]) return scrubBannedConceptWording(L2_LABEL_OVERRIDES[nid]);

  const low = label.toLowerCase();
  const looksLikeSource = low === 'source id' || low.startsWith('l1-') || low.startsWith('l1_') || /hs\d{4,}/i.test(low);
  if (!looksLikeSource) return label || node.node_id;

  const m = nid.match(/^n_l2_[^_]+_(.+)$/i);
  const raw = m ? m[1] : (label || nid);
  const pretty = prettifyTokenLabel(raw)
    .replace(/\bsource id\b/i, 'Source Mapping')
    .replace(/\bthroughput bottlenecks\b/i, 'Throughput Constraints')
    .replace(/\btariff import control exposure\b/i, 'Trade/Import Exposure');
  return scrubBannedConceptWording(pretty || 'Component Detail');
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

function parsePanelPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.rows)) return payload.rows;
  if (payload && payload.by_node_id && typeof payload.by_node_id === 'object') {
    return Object.values(payload.by_node_id);
  }
  return [];
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function buildElementsFromHierarchyPanel(hierarchyPayload, panelPayload) {
  const hierarchyNodes = Array.isArray(hierarchyPayload?.nodes) ? hierarchyPayload.nodes : [];
  const hierarchyEdges = Array.isArray(hierarchyPayload?.edges) ? hierarchyPayload.edges : [];
  const panelRows = parsePanelPayload(panelPayload);
  const panelByNode = new Map(panelRows.map(r => [String(r.node_id || ''), r]));

  const nodes = hierarchyNodes.map(n => {
    const nodeId = String(n.node_id || '');
    const panel = panelByNode.get(nodeId) || {};
    const layer = String(n.layer || panel.layer || '').toUpperCase() || 'L3';
    const bti = Math.max(0, Math.min(100, Math.round(toNum(panel.bottleneck_tightness_index, 0))));
    const tier = tightnessTier(bti);
    const nodeType = String(n.node_type || '').toLowerCase() || `${layer.toLowerCase()}_component`;
    const geom = nodeGeometry(nodeType, layer, bti);
    const confTier = String(panel.confidence_tier || '').toLowerCase();
    const confidence = confTier === 'high' || confTier === 'medium' || confTier === 'low' ? confTier : 'unknown';
    const blockersArr = Array.isArray(panel.blockers) ? panel.blockers : [];
    const blockerText = blockersArr.map(v => String(v || '').trim()).filter(Boolean).join(' | ');
    const evidenceRows = Array.isArray(panel.evidence_sources) ? panel.evidence_sources : [];

    return {
      data: {
        id: nodeId,
        label: String(n.node_name || panel.node_name || nodeId),
        short_label: truncLabel(String(n.node_name || panel.node_name || nodeId), layer === 'L1' ? 34 : (layer === 'L2' ? 26 : 20)),
        gate_pass: 'unknown',
        confidence,
        key_blockers: blockerText,
        key_blockers_synth: blockerText,
        key_blockers_l2_display: blockerText,
        key_blockers_l1_display: blockerText,
        key_blockers_fallback: blockerText,
        node_type: nodeType,
        original_node_type: nodeType,
        l1_component: String(n.l1_component || panel.l1_component || ''),
        parent_id: String(n.parent_id || panel.parent_id || ''),
        top_companies: Array.isArray(panel.top_companies) ? panel.top_companies : [],
        bottleneck_drivers: Array.isArray(panel.bottleneck_drivers) ? panel.bottleneck_drivers : [],
        blockers: blockersArr,
        evidence_sources: evidenceRows,
        evidence_constraints: [],
        source_ids: evidenceRows
          .map(s => String(s?.source_id || '').trim())
          .filter(Boolean),
        confidence_tier: confidence,
        bottleneck_score: bti,
        bottleneck_tier: tier,
        bottleneck_tightness_index_v2: bti,
        bottleneck_tightness_tier_v2: tier,
        bottleneck_tightness_index_v1: bti,
        bottleneck_tightness_tier_v1: tier,
        bti_source: 'component_panel_data_v1',
        node_w: geom.w,
        node_h: geom.h,
        node_w_focus: Math.round(geom.w * 1.08),
        node_h_focus: Math.round(geom.h * 1.08),
        node_size_class: geom.tierLabel,
        hierarchy_rank: hierarchyRankForLayer(layer),
        visibility: 'executive',
        layer,
        category: 'other',
        thesis_tag: 'other',
        scenario_base: null,
        scenario_bull: null,
        scenario_bear: null,
        scenario_active: null,
        lead_time: null,
        capacity_effective: null,
        landed_cost_uplift_pct: null,
        tariff_penalty_pct: null,
        description: ''
      }
    };
  });

  const nodeSet = new Set(nodes.map(n => n.data.id));
  const nodeById = new Map(nodes.map(n => [n.data.id, n.data]));
  const edges = hierarchyEdges
    .filter(e => nodeSet.has(String(e.source || '')) && nodeSet.has(String(e.target || '')))
    .map(e => {
      const src = nodeById.get(String(e.source || ''));
      const dst = nodeById.get(String(e.target || ''));
      const sourceLayer = src ? src.layer : String(e.source_layer || 'L3');
      const targetLayer = dst ? dst.layer : String(e.target_layer || 'L3');
      return {
        data: {
          id: String(e.edge_id || `${e.source}__${e.target}`),
          source: String(e.source || ''),
          target: String(e.target || ''),
          dependency_type: String(e.edge_type || 'decomposes_to'),
          confidence: 'high',
          source_layer: sourceLayer,
          target_layer: targetLayer,
          hierarchy_rank: Math.max(hierarchyRankForLayer(sourceLayer), hierarchyRankForLayer(targetLayer))
        }
      };
    });

  return [...nodes, ...edges];
}

function isComponentYes(v) {
  return String(v || '').trim().toLowerCase() === 'yes';
}

function buildComponentWhitelistByNode(rows) {
  const byNode = new Map();
  for (const row of rows || []) {
    const nodeId = String(row.node_id || '').trim();
    if (!nodeId) continue;
    byNode.set(nodeId, {
      node_id: nodeId,
      label: String(row.label || '').trim(),
      layer: String(row.layer || '').trim().toUpperCase(),
      is_component: String(row.is_component || '').trim().toLowerCase(),
      reason: String(row.reason || '').trim()
    });
  }
  return byNode;
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

function tightnessTier(score) {
  const s = Number(score) || 0;
  if (s >= 80) return 3;
  if (s >= 60) return 2;
  if (s >= 40) return 1;
  return 0;
}

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function lerp(lo, hi, t) {
  return lo + (hi - lo) * t;
}

function nodeGeometry(nodeType, layer, tightnessIndex) {
  const nt = String(nodeType || '').toLowerCase();
  if (nt === 'company') {
    return { w: 16, h: 16, tierLabel: 'company' };
  }
  if (nt === 'source' || nt === 'gap' || nt === 'source_ref') {
    return { w: 9, h: 9, tierLabel: 'evidence' };
  }
  const t = clamp01((Number(tightnessIndex) || 0) / 100);
  const tEased = Math.pow(t, 3.4); // doubled effect: extreme visual separation for high-pressure nodes
  const tier = tightnessTier(tightnessIndex);
  if (layer === 'L1') {
    const w = Math.round(lerp(68, 220, tEased));
    const h = Math.round(lerp(24, 82, tEased));
    return { w, h, tierLabel: `l1_tier_${tier}` };
  }
  if (layer === 'L2') {
    const w = Math.round(lerp(56, 196, tEased));
    const h = Math.round(lerp(18, 74, tEased));
    return { w, h, tierLabel: `l2_tier_${tier}` };
  }
  if (layer === 'L3') {
    const d = Math.round(lerp(9, 92, tEased));
    return { w: d, h: d, tierLabel: `l3_tier_${tier}` };
  }
  const d = Math.round(lerp(10, 52, tEased));
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
  return scrubBannedConceptWording(String(s || ''))
    .replace(/\s+/g, ' ')
    .replace(/\s+\|\s+/g, ' | ')
    .trim();
}

function scrubBannedConceptWording(s) {
  return String(s || '')
    .replace(/\bsource[\s_-]*id\b/gi, 'source token')
    .replace(/\btraceability\b/gi, 'qualification coverage')
    .replace(/\bprovenance\b/gi, 'qualification lineage')
    .replace(/\breferences?\b/gi, 'notes')
    .replace(/\btariff\b/gi, 'trade-duty')
    .replace(/\bndaa\b/gi, 'acquisition-rule')
    .replace(/\bcompliance\s+controls?\b/gi, 'qualification controls')
    .replace(/\bshortfall\b/gi, 'gap')
    .replace(/\bbottlenecks?\b/gi, 'constraints');
}

function layerFromNodeType(nodeType, representativeSet, nodeId, node) {
  const nt = String(nodeType || '').toLowerCase();
  if (nt.includes('l1')) return 'L1';
  if (nt.includes('l2')) return 'L2';
  if (nt.includes('l3') || representativeSet.has(nodeId)) return 'L3';
  if (nt === 'source' || nt === 'gap') return 'L4';
  return 'L4';
}

function hierarchyRankForLayer(layer) {
  if (layer === 'L1') return 1;
  if (layer === 'L2') return 2;
  if (layer === 'L3') return 3;
  return 4;
}

function isComponentLayer(layer) {
  return layer === 'L1' || layer === 'L2' || layer === 'L3';
}

function dedupeEvidenceRows(rows) {
  const out = [];
  const seen = new Set();
  for (const r of rows || []) {
    if (!r || !r.id) continue;
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out.sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id)));
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

export async function loadElements(options = {}) {
  try {
    const [hierText, panelText] = await Promise.all([
      fetchText('./component_hierarchy_v1.json'),
      fetchText('./component_panel_data_v1.json')
    ]);
    const hierarchyPayload = JSON.parse(hierText);
    const panelPayload = JSON.parse(panelText);
    const adapted = buildElementsFromHierarchyPanel(hierarchyPayload, panelPayload);
    if (adapted.length > 0) return adapted;
  } catch (_) {
    // Fall back to legacy synthesis pipeline.
  }

  const componentsOnly = options.componentsOnly !== false;
  const whitelistPath = options.whitelistPath || '../../analysis/component_taxonomy_whitelist_v1.csv';

  const [nodesText, edgesText, gateText, econText, capText, tradeText, l3Text, signalGapMd, waveE1Md, whitelistText] =
    await Promise.all([
      fetchText('../../graph/nodes.jsonl'),
      fetchText('../../graph/edges.jsonl'),
      fetchText('../../analysis/promotion_gate_table_v4.csv'),
      fetchText('../../analysis/l3_unit_econ_stack_v2.jsonl'),
      fetchText('../../analysis/l3_capacity_stack_v2.jsonl'),
      fetchText('../../analysis/l3_trade_compliance_quant_v2.jsonl'),
      fetchText('../../analysis/l3_bottleneck_nodes_v1.jsonl'),
      fetchText('../../analysis/company/company_signal_gaps_v1.md'),
      fetchText('../../analysis/l3_gapfill_waveE1_leadtime_notes.md'),
      componentsOnly ? fetchText(whitelistPath) : Promise.resolve('')
    ]);

  const gNodes = parseJSONL(nodesText);
  const gEdges = parseJSONL(edgesText);
  const gates  = parseCSV(gateText);
  const econ   = parseJSONL(econText);
  const cap    = parseJSONL(capText);
  const trade  = parseJSONL(tradeText);
  const l3Raw  = parseJSONL(l3Text);
  const componentWhitelistByNode = componentsOnly
    ? buildComponentWhitelistByNode(parseCSV(whitelistText))
    : new Map();
  let tightnessOverrides = [];
  try {
    const tightnessText = await fetchText('./bottleneck_tightness_index_v2.json');
    const tightnessJson = JSON.parse(tightnessText);
    tightnessOverrides = Array.isArray(tightnessJson?.nodes) ? tightnessJson.nodes : [];
  } catch (_) {
    tightnessOverrides = [];
  }

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

  const sourceMetaByNodeId = new Map();
  const gapMetaByNodeId = new Map();
  for (const n of gNodes) {
    const nt = String(n.node_type || '').toLowerCase();
    if (nt === 'source') {
      sourceMetaByNodeId.set(n.node_id, {
        id: n.node_id,
        label: String(n.label || n.source_id || n.node_id),
        source_id: String(n.source_id || ''),
        url: String(n.url || '')
      });
    } else if (nt === 'gap') {
      gapMetaByNodeId.set(n.node_id, {
        id: n.node_id,
        label: String(n.label || n.node_id),
        description: String(n.description || '')
      });
    }
  }

  const evidenceByComponentNodeId = new Map();
  const constraintsByComponentNodeId = new Map();
  for (const e of gEdges) {
    const src = String(e.src_node_id || '');
    const dst = String(e.dst_node_id || '');
    const edgeType = String(e.edge_type || '').toLowerCase();
    if (edgeType === 'evidenced_by' && sourceMetaByNodeId.has(dst)) {
      if (!evidenceByComponentNodeId.has(src)) evidenceByComponentNodeId.set(src, []);
      evidenceByComponentNodeId.get(src).push(sourceMetaByNodeId.get(dst));
    }
    if (edgeType === 'constrained_by_gap' && gapMetaByNodeId.has(dst)) {
      if (!constraintsByComponentNodeId.has(src)) constraintsByComponentNodeId.set(src, []);
      constraintsByComponentNodeId.get(src).push(gapMetaByNodeId.get(dst));
    }
  }

  const gateByNode  = new Map(gates.map(g => [g.node_id, g]));
  const econByNode  = new Map(econ.map(r => [r.node_id, r]));
  const capByNode   = new Map(cap.map(r => [r.node_id, r]));
  const tradeByNode = new Map(trade.map(r => [r.node_id, r]));
  const tightnessByNode = new Map(
    tightnessOverrides.map(r => [
      r.node_id,
      firstNum(
        r.bti_score ??
        r.bottleneck_tightness_index_v2 ??
        r.bottleneck_tightness_index_v1 ??
        r.tightness_index ??
        r.index
      )
    ])
  );

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

    const derivedTightness = Math.round(
      100 * (0.35 * capRisk + 0.25 * (leadN ?? 0.6) + 0.25 * (tradeN ?? 0.6) + 0.15 * confPenalty)
    );
    const tightnessOverride = tightnessByNode.get(n.node_id);
    const tightnessIndex = Math.max(
      0,
      Math.min(100, Math.round(tightnessOverride == null ? derivedTightness : Number(tightnessOverride)))
    );
    const tier = tightnessTier(tightnessIndex);

    const category = inferNodeCategory(n);
    const thesisTag = CATEGORY_SPOTLIGHT_MAP[category] || 'other';

    // ── Visibility & layer mapping for executive narrative density ──
    const sourceRef = isSourceReferencePseudoNode(n);
    const nt = sourceRef ? 'source_ref' : (n.node_type || '').toLowerCase();
    const layer = layerFromNodeType(n.node_type, representativeSet, n.node_id, n);
    if (!isComponentLayer(layer)) return null;
    if (componentsOnly) {
      const whitelist = componentWhitelistByNode.get(n.node_id);
      if (!whitelist) return null;
      if (whitelist.layer && whitelist.layer !== layer) return null;
      if (!isComponentYes(whitelist.is_component)) return null;
    }
    const geom = nodeGeometry(nt, layer, tightnessIndex);
    const hierarchyRank = hierarchyRankForLayer(layer);
    const domainTint = DOMAIN_TINTS[n.l1_component] || DOMAIN_TINTS.other;
    const visibility = 'executive';

    const displayLabel = cleanDisplayLabel(n);
    const l1NodeId = String(n.l1_component || '') ? `n_l1_${n.l1_component}` : '';
    const directEvidence = (evidenceByComponentNodeId.get(n.node_id) || []).map(x => ({ ...x, relation: 'direct' }));
    const domainEvidence = l1NodeId && l1NodeId !== n.node_id
      ? (evidenceByComponentNodeId.get(l1NodeId) || []).map(x => ({ ...x, relation: 'domain' }))
      : [];
    const directConstraints = (constraintsByComponentNodeId.get(n.node_id) || []).map(x => ({ ...x, relation: 'direct' }));
    const domainConstraints = l1NodeId && l1NodeId !== n.node_id
      ? (constraintsByComponentNodeId.get(l1NodeId) || []).map(x => ({ ...x, relation: 'domain' }))
      : [];
    const evidenceSources = dedupeEvidenceRows([...directEvidence, ...domainEvidence]);
    const evidenceConstraints = dedupeEvidenceRows([...directConstraints, ...domainConstraints]);

    return {
      data: {
        id: n.node_id,
        label: displayLabel || n.node_id,
        short_label: truncLabel(
          displayLabel || n.node_id,
          layer === 'L1' ? 34 : (layer === 'L2' ? 26 : 20)
        ),
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
        node_type: sourceRef ? 'source_ref' : (n.node_type || 'unknown'),
        original_node_type: n.node_type || 'unknown',
        l1_component: n.l1_component || '',
        source_ref_token: sourceRef ? sourceRefTokenFromNode(n) : '',
        source_id: n.source_id || '',
        url: n.url || '',
        source_ids: evidenceSources
          .map(s => String(s.source_id || '').trim())
          .filter(Boolean),
        evidence_sources: evidenceSources,
        evidence_constraints: evidenceConstraints,
        description: n.description || '',
        domain_tint: domainTint,
        hierarchy_rank: hierarchyRank,
        bottleneck_score: tightnessIndex,
        bottleneck_tier: tier,
        bottleneck_tightness_index_v2: tightnessIndex,
        bottleneck_tightness_tier_v2: tier,
        bottleneck_tightness_index_v1: tightnessIndex,
        bottleneck_tightness_tier_v1: tier,
        bti_source: tightnessOverride == null ? 'derived_fallback' : 'bottleneck_tightness_index_v2',
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
  }).filter(Boolean);

  const nodeSet = new Set(nodes.map(n => n.data.id));
  const nodeById = new Map(nodes.map(n => [n.data.id, n.data]));
  const edges = gEdges
    .filter(e => nodeSet.has(e.src_node_id) && nodeSet.has(e.dst_node_id))
    .map(e => {
      const src = nodeById.get(e.src_node_id);
      const dst = nodeById.get(e.dst_node_id);
      const sourceLayer = src ? src.layer : 'L4';
      const targetLayer = dst ? dst.layer : 'L4';
      return {
        data: {
          id: e.edge_id || `${e.src_node_id}__${e.dst_node_id}`,
          source: e.src_node_id,
          target: e.dst_node_id,
          dependency_type: e.edge_type || 'depends_on',
          confidence: e.confidence_level || 'unknown',
          source_layer: sourceLayer,
          target_layer: targetLayer,
          hierarchy_rank: Math.max(
            hierarchyRankForLayer(sourceLayer),
            hierarchyRankForLayer(targetLayer)
          )
        }
      };
    });

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
