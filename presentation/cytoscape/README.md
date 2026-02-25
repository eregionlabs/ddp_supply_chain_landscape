# DDP Supply Chain Command Graph (Cytoscape.js)

Interactive graph visualization of DDP supply-chain component dependencies, bottleneck pressure, and supplier landscape.

## Files
- `index.html` — main interactive visualization UI (v5)
- `graph_data.js` — data loader/adapter: reads hierarchy + panel JSON, builds Cytoscape elements
- `styles.css` — visual styling (bottleneck pressure encoding, confidence opacity, layer hierarchy)
- `run_local.sh` — launches a local Python HTTP server

## Data inputs
- `component_hierarchy_v1.json` — L1/L2/L3 physical component hierarchy (nodes + edges)
- `component_panel_data_v1.json` — right-panel payload per node (companies, blockers, evidence, BTI scores)
- `company_overlay_v2.json` — company node/edge overlay (toggled on/off)
- `company_rollup_l1_v1.json` / `company_rollup_l2_v1.json` — aggregated supplier data by domain
- `bottleneck_tightness_index_v2.json` — BTI score overrides

## Visual encoding
- Node size: bottleneck tightness index (0-100, larger = tighter)
- Node color: BTI intensity per layer (darker = higher pressure)
- Node opacity: confidence tier (high/medium/low)
- Node shape: L1 round-rectangle, L2 round-rectangle, L3 ellipse, company diamond
- Edge style: decomposition (solid), constraint (amber), evidence (dashed), company (dotted)

## Run
Do **not** open `index.html` via `file://` (fetch won't work).
Serve locally instead:

```bash
bash run_local.sh          # port 8787 by default
# or: bash run_local.sh 9000
```

Then open: `http://127.0.0.1:8787/presentation/cytoscape/`
