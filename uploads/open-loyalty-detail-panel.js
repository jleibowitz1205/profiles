# Raw Engine Code

Extracted JavaScript modules from the production `index.html` Apps Script tool.
**Use this as a port reference**, not as runnable code in this directory.

The files here were sliced out of the monolithic `index.html` to make the
engine logic easier to read, easier to map to TypeScript modules in the Azure
rebuild, and easier to hand to Claude Code one file at a time.

---

## File layout

```
raw-engine-code/
├── README.md                                ← you are here
├── 01-event-stream.js                       ← CSV → events keyed by VIN
├── 02-internal-detection.js                 ← dealer-internal vehicle filter
├── 03-segments.js                           ← THE 7 RULES (most important file)
├── 04-clustering-and-customer-assembly.js   ← Buyer-of-Record Gate + customer rollup
├── utilities/
│   ├── normalizers.js                       ← phone, email normalization
│   └── union-find.js                        ← clustering data structure
└── ui-reference/
    ├── run-loyalty-timeline.js              ← top-level orchestrator
    ├── show-loyalty-timeline-results.js     ← stats panel rendering
    ├── render-loyalty-table.js              ← table + filter + chip rendering
    ├── open-loyalty-export-modal.js         ← export schema preview UI
    ├── export-loyalty-timeline.js           ← CSV download trigger
    └── open-loyalty-detail-panel.js         ← per-customer detail view
```

---

## What ports cleanly

The four files at the top level (`01-event-stream.js` through
`04-clustering-and-customer-assembly.js`) plus `utilities/` are pure data
transformation. They have **no DOM dependencies** and **no Apps Script
specific APIs**. They lift directly into Node.js / TypeScript with minimal
changes.

These are the priority files for the port. Hand them to Claude Code with
prompts like:

> "Port this JavaScript module to TypeScript. The data shapes are documented
> in ARCHITECTURE.md. Add types for Event, Segment, and Customer based on
> that doc."

---

## What stays UI-bound

Everything in `ui-reference/` interacts with the DOM. It's included for
reference (so the dev team can see how the current tool surfaces things)
but **shouldn't be ported as-is** — the Azure version will have its own
UI framework (React, Vue, etc.) and the data API will be different (REST
endpoints, not in-memory).

The valuable parts to extract from `ui-reference/`:
- **Filter/sort logic** (in `render-loyalty-table.js`) — the
  `countWithoutFacet` function, the date-range filtering, the per-row
  vehicle facet matching. Pure logic, lift into the API layer.
- **Export schema** (in `open-loyalty-export-modal.js`) — the Convergence
  Standard 29-column field mapping. Lift into the export module.
- **Target row explosion** (in `run-loyalty-timeline.js`) — the loop that
  produces one row per (customer, current VIN). Lift into the engine.

The DOM rendering code itself doesn't transfer.

---

## Mapping to the proposed src/ structure

Following the layout in PORTING_GUIDE.md:

| Raw file | Maps to TypeScript module |
|---|---|
| `01-event-stream.js` | `src/engine/eventStream.ts` |
| `02-internal-detection.js` | `src/engine/internalDetection.ts` (or `src/ingest/dealerInternal.ts`) |
| `03-segments.js` | `src/engine/segments.ts` |
| `04-clustering-and-customer-assembly.js` | Split into `src/engine/clustering.ts` and `src/engine/customer.ts` |
| `utilities/normalizers.js` | `src/ingest/normalizers.ts` |
| `utilities/union-find.js` | `src/engine/unionFind.ts` |
| `ui-reference/run-loyalty-timeline.js` | Orchestration logic → `src/jobs/dailyIngest.ts`; target explosion → `src/engine/targets.ts` |
| `ui-reference/render-loyalty-table.js` | Filter/sort/chip logic → `src/api/queries.ts`; rendering → discard |
| `ui-reference/open-loyalty-export-modal.js` | Export schema → `src/api/export.ts`; modal UI → discard |
| `ui-reference/export-loyalty-timeline.js` | Discard (legacy export trigger) |
| `ui-reference/open-loyalty-detail-panel.js` | Reference for what data the detail endpoint should return |

---

## Special note on the 04 file (clustering and customer assembly)

`04-clustering-and-customer-assembly.js` is the biggest single file (~37 KB).
It contains:

- The `buildLoyaltyTimeline` orchestrator function
- The Buyer-of-Record Gate logic (`pairAllowed`, `tradeLinkedPairs`,
  `firstLastKey`)
- The PII clustering with high-cardinality filter
- The customer record assembly (per-VIN flags, time bucket assignment,
  drift detection, etc.)
- The 6-bucket time classifier (currently 5 in this version — see the note
  in ARCHITECTURE.md about updating to 6 for the Azure rebuild)

**For the port, split this file into:**
- `src/engine/clustering.ts` — Buyer-of-Record Gate + Union-Find clustering
- `src/engine/customer.ts` — customer record assembly, vinFlags, drift detection
- `src/engine/buckets.ts` — time bucket classifier (and update to 6 buckets here)
- `src/engine/index.ts` — the `buildLoyaltyTimeline` orchestrator

This is the most logically dense file and benefits most from being broken
apart.

---

## What's missing from this extraction

Things in `index.html` that aren't extracted here:

- **HTML scaffolding** — the `<head>`, CSS, base layout. The Azure version
  will have its own UI scaffold.
- **Hygiene zone code** — file-by-file deduplication. Out of scope for this
  handoff (the engine described in these docs is the Pipelines / Loyalty
  Timeline zone).
- **Compare & Match zone code** — cross-file overlap analysis. Out of scope.
- **Anomaly queue UI** — doesn't exist in this version (needs to be built
  per `ANOMALY_QUEUE_SPEC.md`).
- **Suppression UI** — doesn't exist in this version (needs to be built per
  `SUPPRESSION_RULES.md`).

If the dev team wants to see how the Hygiene or Compare & Match zones work,
they can open `index.html` directly.

---

## Validation strategy

Pair each ported file with the matching test scenario in
`ENGINE_VALIDATION_SCENARIOS.md`. After porting `03-segments.js` to
`src/engine/segments.ts`:

1. Run the Diskin household scenario through both
2. Confirm segment counts match
3. Confirm post-trade follow-up handling matches
4. Confirm anomalous inter-owner service flagging matches

After porting `04-clustering-and-customer-assembly.js`:

1. Run the Diskin household scenario through both
2. Confirm 4 separate customers result (Daniel, Margaret, Emily, Dianne)
3. Run the Pamela mega-cluster test
4. Confirm no Pamela has >2 sales
5. Run the cross-household trade test
6. Confirm Daniel and Margaret stay separate after the trade

The Python prototype in `prototypes/vin_spine_engine_v2.py` implements the
same logic and produces a baseline for comparison.

---

## License / ownership

All code is Convergence's. Built collaboratively with Claude (Anthropic)
during the engine v2 refactor work over an extended pairing session.
