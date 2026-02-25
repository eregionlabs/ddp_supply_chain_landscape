/* ── detail-panel.js ── Detail / company / source rendering ── */

import { escHtml, getTightnessIndex, compareBtiNodesDesc } from './utils.js';

/* ── Deduplicated company row renderer ── */
function renderCompanyRow(r, config = {}) {
  const { scoreField, showConfidence, showMetadata } = config;
  const label = escHtml(r.company_name || r.company_id || 'unknown');

  /* Score */
  let score;
  if (scoreField === 'weighted_score_sum') {
    score = Number.isFinite(Number(r.weighted_score_sum)) ? Number(r.weighted_score_sum).toFixed(2) : 'n/a';
  } else {
    const scoreRaw = r.weighted_score ?? r.composite_score ?? r.score;
    score = Number.isFinite(Number(scoreRaw)) ? Number(scoreRaw).toFixed(2) : 'n/a';
  }

  /* Confidence badge */
  let confHtml = '';
  if (showConfidence) {
    const confAvg = Number(r.confidence_factor_avg);
    const conf = Number.isFinite(confAvg)
      ? (confAvg >= 0.65 ? 'high' : confAvg >= 0.4 ? 'medium' : 'low')
      : 'low';
    const cls = conf === 'high' ? 'conf-high' : conf === 'medium' ? 'conf-medium' : 'conf-low';
    confHtml = ` <span class="conf-badge ${cls}">${conf}</span>`;
  }

  /* Metadata line */
  let metaHtml;
  if (showMetadata) {
    const roles = Array.isArray(r.roles) ? r.roles.join(', ') : '';
    const bits = [
      roles,
      r.company_type || '',
      Number.isFinite(Number(r.component_count)) ? `components ${r.component_count}` : '',
      r.fallback_scope ? 'fallback' : ''
    ].filter(Boolean).map(escHtml).join(' \u00b7 ');
    metaHtml = bits;
  } else {
    metaHtml = r.company_type ? escHtml(String(r.company_type)) : '';
  }

  return `<div class="company-row">
    <div><span class="company-name">${label}</span>${confHtml}<br><small>${metaHtml}</small></div>
    <span class="company-score ${scoreRiskClass(score)}">${score}</span>
  </div>`;
}

function scoreRiskClass(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'score-med';
  /* Scores are 0-10 scale (composite/weighted), not 0-100 */
  if (n >= 7) return 'score-high';
  if (n >= 4) return 'score-med';
  return 'score-low';
}

const ROLLUP_CONFIG = { scoreField: 'weighted_score_sum', showConfidence: true, showMetadata: true };

/* ── Company list builder ── */
export function buildTopCompaniesHtml(nodeId, ctx) {
  const { cy, companyEdgesByComponent, companyNodeById, companyRollupByL1NodeId, companyRollupByL2NodeId } = ctx;
  const nodeData = cy.getElementById(nodeId).data();
  const nt = String((nodeData && nodeData.node_type) || '').toLowerCase();
  const panelTopCompanies = Array.isArray(nodeData?.top_companies) ? nodeData.top_companies : [];

  if (panelTopCompanies.length > 0) {
    return '<div class="company-list">' + panelTopCompanies.slice(0, 8).map(r =>
      renderCompanyRow(r, {})
    ).join('') + '</div>';
  }

  if (nt.startsWith('l1')) {
    const rec = companyRollupByL1NodeId.get(nodeId);
    const rows = rec && Array.isArray(rec.top_companies) ? rec.top_companies : [];
    if (rows.length === 0) return '<small>No L1 rollup companies linked.</small>';
    return '<div class="company-list">' + rows.slice(0, 8).map(r =>
      renderCompanyRow(r, ROLLUP_CONFIG)
    ).join('') + '</div>';
  }

  if (nt.startsWith('l2')) {
    const rec = companyRollupByL2NodeId.get(nodeId);
    const rows = rec && Array.isArray(rec.top_companies) ? rec.top_companies : [];
    if (rows.length === 0) return '<small>No L2 rollup companies linked.</small>';
    return '<div class="company-list">' + rows.slice(0, 8).map(r =>
      renderCompanyRow(r, ROLLUP_CONFIG)
    ).join('') + '</div>';
  }

  /* Fallback: direct edges + L1 parent edges (overlay data) */
  const directEdges = companyEdgesByComponent.get(nodeId) || [];
  const l1Id = nodeData && nodeData.l1_component ? 'n_l1_' + nodeData.l1_component : null;
  const l1Edges = l1Id ? (companyEdgesByComponent.get(l1Id) || []) : [];

  const seen = new Set();
  const merged = [];
  for (const e of directEdges) { seen.add(e.target); merged.push(e); }
  for (const e of l1Edges) { if (!seen.has(e.target)) { seen.add(e.target); merged.push(e); } }
  if (merged.length === 0) return '<small>No company data linked.</small>';

  merged.sort((a, b) => (b.composite_score ?? -1) - (a.composite_score ?? -1));

  return '<div class="company-list">' + merged.slice(0, 8).map(e => {
    const co    = companyNodeById.get(e.target);
    const label = co ? escHtml(co.label) : escHtml(e.target);
    const coType = co ? escHtml(co.company_type) : '';
    const score = e.composite_score != null ? e.composite_score.toFixed(1) : 'n/a';
    const conf  = (e.confidence || 'low').toLowerCase();
    const cls   = conf === 'high' ? 'conf-high' : conf === 'medium' ? 'conf-medium' : 'conf-low';
    const dep   = escHtml(e.dependency_type || '');
    const pen   = e.confidence_penalty != null ? 'pen\u00a0' + e.confidence_penalty.toFixed(2) : '';
    const bits  = [dep, pen, coType].filter(Boolean).join(' \u00b7 ');
    return `<div class="company-row">
      <div><span class="company-name">${label}</span> <span class="conf-badge ${cls}">${conf}</span><br><small>${bits}</small></div>
      <span class="company-score ${scoreRiskClass(score)}">${score}</span>
    </div>`;
  }).join('') + '</div>';
}

/* ── Evidence sources builder ── */
export function buildSourcesHtml(node) {
  const target = node.data();
  const sourceRows = Array.isArray(target.evidence_sources) ? target.evidence_sources : [];
  const gapRows = Array.isArray(target.evidence_constraints) ? target.evidence_constraints : [];

  const rows = sourceRows
    .map(s => {
      if (typeof s === 'string') {
        return { id: s, label: s, sourceId: '', url: '', relation: 'linked' };
      }
      const sourceId = String(s.source_id || '');
      const label = String(s.label || s.source_id || s.id || s.url || '');
      const url = String(s.url || '');
      const id = String(s.id || sourceId || label || url || '');
      return ({ id, label, sourceId, url, relation: String(s.relation || 'linked') });
    })
    .filter(r => r.id);

  const gapList = gapRows
    .map(g => ({ id: String(g.id || ''), label: String(g.label || g.id || ''), relation: String(g.relation || 'linked') }))
    .filter(g => g.id);

  if (rows.length === 0 && gapList.length === 0) return '<small>No linked sources captured.</small>';
  rows.sort((a, b) => a.label.localeCompare(b.label));
  const sourceHtml = rows.length > 0
    ? '<div class="company-list">' + rows.slice(0, 12).map(r => {
      const label = escHtml(r.label);
      const rel = escHtml(r.relation);
      const sourceId = r.sourceId ? `<small>${escHtml(r.sourceId)}</small>` : '';
      const link = r.url ? `<small><a href="${escHtml(r.url)}" target="_blank" rel="noopener noreferrer">${escHtml(r.url)}</a></small>` : '';
      return `<div class="company-row">
        <div><span class="company-name">${label}</span> <span class="conf-badge conf-medium">${rel}</span><br>${sourceId}${sourceId && link ? '<br>' : ''}${link}</div>
        <span class="company-score">src</span>
      </div>`;
    }).join('') + '</div>'
    : '<small>No linked sources captured.</small>';

  const gapHtml = gapList.length > 0
    ? `<div class="detail-note">Constraints: ${gapList
      .slice(0, 6)
      .map(g => `${escHtml(g.label)} (${escHtml(g.relation)})`)
      .join(' \u00b7 ')}</div>`
    : '';

  return sourceHtml + gapHtml;
}

/* ── Metric popover ── */
let metricPopoverEl = null;

export function closeMetricPopover() {
  if (metricPopoverEl && metricPopoverEl.parentNode) metricPopoverEl.parentNode.removeChild(metricPopoverEl);
  metricPopoverEl = null;
}

export function metricPopoverContent(metric, nodeData) {
  const n = nodeData || {};
  if (metric === 'pressure') {
    return '<strong>Bottleneck Pressure</strong><br><small>0\u2013100 score. Higher = tighter bottleneck and harder substitution.</small>';
  }
  if (metric === 'confidence') {
    return `<strong>Confidence</strong><br><small>Evidence quality tier for this node: ${escHtml(String(n.confidence_tier || n.confidence || 'unknown'))}.</small>`;
  }
  if (metric === 'suppliers') {
    const rows = Array.isArray(n.top_companies) ? n.top_companies.slice(0, 8) : [];
    if (!rows.length) return '<strong>Supplier Companies</strong><br><small>No linked suppliers for this node yet.</small>';
    return '<strong>Supplier Companies</strong><br>' + rows.map((r, i) => {
      const name = escHtml(String(r.company_name || r.company_id || 'unknown'));
      const score = Number.isFinite(Number(r.weighted_score ?? r.composite_score ?? r.score))
        ? Number(r.weighted_score ?? r.composite_score ?? r.score).toFixed(2)
        : 'n/a';
      return `<small>${i + 1}. ${name} \u2014 ${score}</small>`;
    }).join('<br>');
  }
  if (metric === 'sources') {
    const rows = Array.isArray(n.evidence_sources) ? n.evidence_sources.slice(0, 8) : [];
    if (!rows.length) return '<strong>Evidence Sources</strong><br><small>No linked sources for this node yet.</small>';
    return '<strong>Evidence Sources</strong><br>' + rows.map((r, i) => {
      const label = typeof r === 'string' ? r : (r.label || r.source_id || r.url || 'source');
      return `<small>${i + 1}. ${escHtml(String(label))}</small>`;
    }).join('<br>');
  }
  return '<small>No details.</small>';
}

export function showMetricPopover(cardEl, metric, nodeData) {
  closeMetricPopover();
  const rect = cardEl.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.className = 'metric-popover';
  pop.innerHTML = metricPopoverContent(metric, nodeData);
  document.body.appendChild(pop);
  const width = Math.min(380, Math.max(260, pop.offsetWidth || 300));
  pop.style.width = `${width}px`;
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left));
  const top = Math.min(window.innerHeight - pop.offsetHeight - 12, rect.bottom + 8);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  metricPopoverEl = pop;
}

/* ── Component detail panel ── */
export function renderComponentDetail(node, ctx) {
  const { cy, detailsEl, companyRollupByL1NodeId, companyRollupByL2NodeId } = ctx;
  const n = node.data();

  const neighbors = node.neighborhood('node');
  const topDown   = node.outgoers('node')
    .filter(x => x.data('node_type') !== 'company')
    .sort(compareBtiNodesDesc)
    .slice(0, 3)
    .map(x => escHtml(x.data('label')) + ' (' + getTightnessIndex(x) + ')')
    .join(', ');
  const nt = String(n.node_type || '').toLowerCase();
  const blockerPrimary = String(n.key_blockers || '').trim();
  const blockerFallback = nt.startsWith('l1')
    ? (n.key_blockers_l1_display || n.key_blockers_fallback || n.key_blockers_synth || '')
    : nt.startsWith('l2')
      ? (n.key_blockers_l2_display || n.key_blockers_fallback || n.key_blockers_synth || '')
      : (n.key_blockers_synth || n.key_blockers_fallback || '');
  let blockerRaw = blockerPrimary || blockerFallback;
  if (!blockerRaw && nt.startsWith('l1')) {
    const rollupRec = companyRollupByL1NodeId.get(n.id);
    blockerRaw = (rollupRec && rollupRec.l1_blocker_text) || '';
  }
  if (!blockerRaw && nt.startsWith('l2')) {
    const rollupRec = companyRollupByL2NodeId.get(n.id);
    blockerRaw = (rollupRec && rollupRec.l2_blocker_text) || '';
  }
  const blockerText = blockerRaw
    ? escHtml(String(blockerRaw).slice(0, 500))
    : 'No direct blocker text. Inspect downstream nodes.';
  const blockerList = Array.isArray(n.blockers) ? n.blockers.map(x => String(x || '').trim()).filter(Boolean) : [];
  const driverList = Array.isArray(n.bottleneck_drivers) ? n.bottleneck_drivers.map(x => String(x || '').trim()).filter(Boolean) : [];
  const parentId = String(n.parent_id || '').trim() || 'root';
  const parentNode = parentId && parentId !== 'root' ? cy.getElementById(parentId) : null;
  const parentLabel = parentNode && !parentNode.empty() ? String(parentNode.data('label') || parentId) : (parentId === 'root' ? '\u2014' : parentId);
  const confidenceTier = String(n.confidence_tier || n.confidence || 'unknown');
  const nodeTightnessIndex = Math.round(Number(n.bottleneck_tightness_index_v2 ?? n.bottleneck_tightness_index_v1 ?? n.bottleneck_score) || 0);
  const cosHtml = buildTopCompaniesHtml(n.id, ctx);
  const srcHtml = buildSourcesHtml(node);
  const supplierCount = Array.isArray(n.top_companies) ? n.top_companies.length : 0;
  const sourceCount = Array.isArray(n.evidence_sources) ? n.evidence_sources.length : 0;

  const pressurePct = Math.max(0, Math.min(100, nodeTightnessIndex));
  const pressureColor = pressurePct >= 70 ? 'var(--red)' : pressurePct >= 40 ? 'var(--amber)' : 'var(--green)';

  const blockerCount = blockerList.length + driverList.length + (blockerRaw ? 1 : 0);

  /* BTI v3 dimension breakdown */
  const btiDims = n.bti_dimensions || null;
  const btiDimScores = n.bti_dimension_scores || null;
  const researchDate = n.research_date || '';
  const dimLabels = { supply_concentration: 'Supply Concentration', lead_time_stress: 'Lead Time Stress', substitution_friction: 'Substitution Friction', compliance_exposure: 'Compliance Exposure' };
  const dimShort = { supply_concentration: 'SC', lead_time_stress: 'LT', substitution_friction: 'SF', compliance_exposure: 'CE' };
  const dimWeights = { supply_concentration: 0.30, lead_time_stress: 0.25, substitution_friction: 0.25, compliance_exposure: 0.20 };
  let dimensionHtml = '';
  if (btiDimScores && typeof btiDimScores === 'object') {
    const dimEntries = Object.entries(dimShort).map(([key, short]) => {
      const score = Number(btiDimScores[key]) || 0;
      const ordinal = btiDims ? (Number(btiDims[key]) || 0) : 0;
      const pct = Math.max(0, Math.min(100, score));
      const color = pct >= 70 ? 'var(--red)' : pct >= 40 ? 'var(--amber)' : 'var(--green)';
      const weight = Math.round((dimWeights[key] || 0) * 100);
      return `<div class="bti-dim-row">
        <span class="bti-dim-label" title="${escHtml(dimLabels[key])}">${short} <small>(${weight}%)</small></span>
        <div class="bti-dim-bar-track"><div class="bti-dim-bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <span class="bti-dim-value">${score}</span>
      </div>`;
    });
    dimensionHtml = `<div class="bti-dimensions">${dimEntries.join('')}</div>`;
    dimensionHtml += `<div class="bti-research-date">`;
    if (researchDate) {
      dimensionHtml += `<small>Research: ${escHtml(researchDate)}</small> &middot; `;
    }
    dimensionHtml += `<a href="#" class="bti-method-link" onclick="event.preventDefault();window.__openBtiMethod&&window.__openBtiMethod()">How is this scored?</a>`;
    dimensionHtml += `</div>`;
  }

  detailsEl.innerHTML = `
    <div data-node-id="${escHtml(n.id)}"><div class="detail-title">${escHtml(n.label)}</div>
    <div class="detail-metrics-grid">
      <button class="detail-metric-card hero-pressure" data-metric="pressure" type="button" style="--pressure-pct:${pressurePct}%;--pressure-color:${pressureColor}"><small>Bottleneck Pressure</small><strong>${nodeTightnessIndex}</strong></button>
      <button class="detail-metric-card" data-metric="confidence" type="button"><small>Confidence</small><strong>${escHtml(confidenceTier)}</strong></button>
      <button class="detail-metric-card" data-metric="suppliers" type="button"><small>Suppliers</small><strong>${supplierCount}</strong></button>
      <button class="detail-metric-card" data-metric="sources" type="button"><small>Sources</small><strong>${sourceCount}</strong></button>
    </div>
    ${dimensionHtml}
    <div class="detail-grid">
      <div class="detail-row"><span>Layer</span><span>${escHtml(String(n.layer || '?'))}</span></div>
      <div class="detail-row"><span>Domain</span><span>${escHtml(String(n.l1_component || 'n/a'))}</span></div>
      <div class="detail-row"><span>Parent</span><span>${escHtml(parentLabel)}</span></div>
      <div class="detail-row"><span>Neighbors</span><span>${neighbors.length}</span></div>
    </div>
    <div class="detail-subsection">
      <details open>
        <summary>Blockers <span class="section-count">${blockerCount}</span></summary>
        ${topDown ? `<div class="detail-note">Downstream risk: ${topDown}</div>` : ''}
        <div class="detail-note">Blockers: ${blockerText}</div>
        ${driverList.length > 0 ? `<div class="detail-note">Drivers: ${escHtml(driverList.join(' \u00b7 '))}</div>` : ''}
        ${blockerList.length > 0 ? `<div class="detail-note">Blocker List: ${escHtml(blockerList.slice(0, 6).join(' \u00b7 '))}</div>` : ''}
      </details>
    </div>
    <div class="detail-subsection">
      <details>
        <summary>Sources <span class="section-count">${sourceCount}</span></summary>
        ${srcHtml}
      </details>
    </div>
    <div class="detail-subsection">
      <details>
        <summary>Supplier Companies <span class="section-count">${supplierCount}</span></summary>
        <small>Score = supplier relevance index (higher = more critical to this node).</small>
        ${cosHtml}
      </details>
    </div></div>`;
}

/* ── Company detail panel ── */
export function renderCompanyDetail(node, ctx) {
  const { detailsEl, TOP_BOTTLENECK_LIMIT } = ctx;
  const n    = node.data();
  const conf = (n.confidence || 'low').toLowerCase();
  const cls  = conf === 'high' ? 'conf-high' : conf === 'medium' ? 'conf-medium' : 'conf-low';

  const linked = node.neighborhood('node')
    .filter(x => x.data('node_type') !== 'company')
    .map(x => escHtml(x.data('label')))
    .slice(0, TOP_BOTTLENECK_LIMIT);

  detailsEl.innerHTML = `
    <div class="detail-title">${escHtml(n.label)} <span class="conf-badge ${cls}">${conf}</span></div>
    <div class="detail-badges"><span class="badge unknown">company: ${escHtml(n.company_type || 'n/a')}</span></div>
    <div class="detail-metrics-grid">
      <div class="detail-metric-card"><small>Components</small><strong>${n.component_count ?? 'n/a'}</strong></div>
      <div class="detail-metric-card"><small>Sources</small><strong>${n.source_count ?? 'n/a'}</strong></div>
      <div class="detail-metric-card"><small>Avg Score</small><strong>${n.avg_composite_score ?? 'n/a'}</strong></div>
      <div class="detail-metric-card"><small>Best Score</small><strong>${n.best_composite_score ?? 'n/a'}</strong></div>
    </div>
    <div class="detail-grid">
      <div class="detail-row"><span>ID</span><span>${escHtml(n.id)}</span></div>
      <div class="detail-row"><span>Confidence</span><span>${conf}</span></div>
      <div class="detail-row"><span>Type</span><span>${escHtml(n.company_type || 'n/a')}</span></div>
    </div>
    ${linked.length > 0 ? `<div class="detail-note">Linked: ${linked.join(', ')}</div>` : ''}`;
}
