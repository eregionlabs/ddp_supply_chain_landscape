# DDP Graph Visualization (Cytoscape.js)

This folder contains a Cytoscape.js-based interactive graph viewer for DDP supply-chain dependencies.

## Files
- `index.html` — main interactive visualization UI
- `graph_data.js` — lightweight data adapter to convert project JSONL into Cytoscape elements
- `styles.css` — visual styling (risk/confidence/status encoding)

## Data inputs (current)
- `../../analysis/l4_decomposition_top5_v1.jsonl`
- `../../analysis/promotion_gate_table_v4.csv`

## Visual encoding
- Node color: gate status (pass/fail/unknown)
- Node border: confidence (high/medium/low)
- Node size: degree (auto)
- Edge labels: dependency type

## Run
Do **not** open `index.html` via `file://`.
Serve project root instead:

```bash
cd presentation/cytoscape
bash run_local.sh          # uses port 8787 by default
# or: bash run_local.sh 9000
```

Then open:
- `http://127.0.0.1:8787/presentation/cytoscape/`
