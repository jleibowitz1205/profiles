# Convergence List Hygiene Tool — Developer Handoff

**Version:** 2026-05-19 (engine v2 with VIN-spine model + Buyer-of-Record gate)
**Owner:** Jim @ Convergence Auto
**Target stack:** Custom codebase on Azure, developed with Claude Code

---

## What this tool is

A web application that processes dealer DMS exports (Sales + Service feeds) and
produces clean, texting-ready customer-vehicle records for SMS/email marketing
campaigns.

Core question it answers: **"Who currently has a car at this dealer that we
can text about that car?"**

The tool has three zones (tabs):
- **Hygiene** — deduplicates and standardizes individual files
- **Pipelines / Loyalty Timeline** — the main customer-vehicle analyzer (this handoff focuses here)
- **Compare & Match** — cross-references multiple files

---

## Current state vs target state

### Current state (validated and running)

Google Apps Script web app (single `index.html` file, ~556 KB).

The engine logic is fully validated:
- VIN-spine model with 7 segment-building rules
- Buyer-of-Record gate prevents mega-cluster bugs
- Per-(customer, currently-owned VIN) target rows for texting
- Per-row flags so Stopped Servicing / Post-trade / Lease apply to the right vehicle
- Convergence Standard 29-column export schema

### Target state (active migration)

Convergence's own codebase on Azure infrastructure, with Claude Code in the
development workflow.

**Confirmed architecture:**
- **Hosting:** Azure (compute service TBD by dev team)
- **Database:** dev team's choice (Azure SQL or Azure Database for PostgreSQL)
- **File storage:** Azure Blob Storage for CSV exports/imports
- **BI/Reporting:** TBD
- **Data ingestion:** Scheduled DMS pulls, daily, replacing manual CSV uploads
- **Multi-tenancy:** One application instance serving multiple dealers, with per-dealer data isolation
- **History tracking:** Snapshot + history model — drift events, category changes, bucket transitions all logged
- **Compliance:** Dealer-data agreement restrictions apply; data must remain in approved Azure regions

The Apps Script tool continues running until the new Azure system has live
DMS feeds and is validated against it.

---

## File contents of this package

```
convergence-list-hygiene-handoff/
├── README.md                          ← you are here
├── index.html                         ← current production tool (Apps Script)
├── ARCHITECTURE.md                    ← engine model and data flow
├── PORTING_GUIDE.md                   ← lifting the engine into Azure
├── SCHEMA_PROPOSAL.md                 ← suggested database schema
├── ANOMALY_QUEUE_SPEC.md              ← spec for the anomaly investigation UI
├── SUPPRESSION_RULES.md               ← placeholder for in-tool suppression
├── KNOWN_ISSUES_AND_NEXT_STEPS.md     ← what's done, what's open
├── ENGINE_VALIDATION_SCENARIOS.md     ← test cases proven against real data
├── raw-engine-code/                   ← engine + UI .js modules extracted from index.html
│   ├── README.md                      ← file map and port guidance
│   ├── 01-event-stream.js
│   ├── 02-internal-detection.js
│   ├── 03-segments.js                 ← the 7 rules
│   ├── 04-clustering-and-customer-assembly.js
│   ├── utilities/                     ← normalizers, union-find
│   └── ui-reference/                  ← table, export, detail panel rendering
└── prototypes/
    └── vin_spine_engine_v2.py         ← Python reference implementation
```

---

## Working with Claude Code

The dev team is using Claude Code for AI-assisted development. To get the most
out of it, structure the new codebase so Claude can reason about pieces in
isolation. Suggested layout:

```
src/
├── engine/
│   ├── eventStream.ts         # Stage 1: feed → events keyed by VIN
│   ├── internalDetection.ts   # Stage 2: dealer-internal exclusion
│   ├── segments.ts            # Stage 3: buildVinSegments — the 7 rules
│   ├── clustering.ts          # Stage 4: Buyer-of-Record Gate + Union-Find
│   ├── customer.ts            # Stage 5: assembleCustomer (vinFlags, etc.)
│   ├── targets.ts             # Stage 6: per-tenure rows
│   └── filters.ts             # filter/sort logic
├── ingest/
│   ├── csv.ts                 # CSV parsing (legacy uploads)
│   ├── dms/                   # one file per DMS partner integration
│   └── normalizers.ts         # phone, email, VIN, name
├── api/
│   ├── routes/                # web endpoints
│   └── export.ts              # Convergence Standard schema
├── jobs/
│   └── dailyIngest.ts         # scheduled DMS pull → engine → DB
├── history/
│   └── driftTracker.ts        # logs phone/email/bucket changes
├── suppression/
│   └── rules.ts               # in-tool suppression logic
├── anomalies/
│   └── queue.ts               # anomaly tracking for investigation
└── tests/
    └── scenarios/             # Diskin, Pamela, Tundra chain, etc.
```

Each engine rule (especially the 7 segment rules) deserves its own file or
function with a clear comment block. Easier to maintain, easier to debug,
easier for Claude Code to reason about.

---

## Critical design principles (do not break these)

1. **VIN as the spine, not the customer.** Building customer records first and
   attaching VINs (the old approach) caused mega-cluster bugs.

2. **Buyer-of-record wins identity.** For households where two people buy cars
   at the same dealer, each car belongs to whoever bought it. Same surname
   doesn't override this.

3. **Trade events close tenures, full stop.** When VIN X is traded in, the
   prior owner's relationship with X ends. They cannot be a "current owner"
   of X anymore.

4. **Don't auto-merge based on shared PII alone.** Shared phone or email is
   only allowed to merge segments if they ALSO share a VIN, are trade-link
   connected (same person traded one car for another, names match), or have
   matching first+last names. This prevents household members from being
   incorrectly merged.

5. **Engine claims nothing about a VIN's fate after trade-back** until either
   a new sale event or an inventory feed says otherwise. No guessing
   "wholesaled" or "on lot." Honest "unknown fate" until evidence arrives.

6. **Adopted customers stay in the service pipeline only.** They never appear
   in Sales History views (no sale event to anchor on).

7. **Businesses are excluded from texting but stored for warehousing.** Email
   addresses are kept; texting workflows skip them via `customerType: business`
   flag.

---

## Time buckets (Convergence standard)

These are the loyalty buckets the engine assigns based on days-since-last-activity:

| Bucket | Days | Color | Meaning |
|---|---|---|---|
| Active | 0–180 (0–6 months) | 🟣 | Engaged customer |
| Active-Watch | 181–365 (6–12 months) | 🟣 | Recent but slipping |
| At Risk | 366–540 (12–18 months) | 🟡 | Approaching the cliff |
| Defection Risk | 541–720 (18–24 months) | 🟠 | Past the cliff, early defection |
| High Defection Risk | 721–1065 (25–35 months) | 🔴 | Deep defection, recovery hard |
| Long Gone | 1066+ (36+ months) | ⚫ | Effectively lost |

The **cliff** is at 18 months. Activity past that point indicates the customer
is defecting and needs winback effort.

These are universal Convergence standards, not configurable per-dealer.

---

## Customer categories

- **Home-grown — Repeat:** Bought 2+ vehicles here
- **Home-grown — First-time:** Bought 1 vehicle here
- **Adopted:** Bought elsewhere, services here

A single customer can have BOTH Home-grown VINs and Adopted VINs. The category
shown is the customer-level rollup; per-VIN relationships are tracked
separately in `vinFlags` and the detail panel.

---

## Views

The tool surfaces two views of the same underlying data:

### Currently Owned (default)
- One row per (customer, currently-owned VIN)
- Texting-first
- Default sort: Last Activity descending
- Excludes traded-back vehicles (no current ownership)
- Excludes stopped-servicing vehicles (no current relationship)
- Adopted relationships INCLUDED if customer currently services with us

### Sales History
- One row per SALE EVENT (sales only — no Adopted rows)
- Analyst-first
- Default sort: Sale Date descending
- Status pill: Currently Owned / Traded Back / Stopped Servicing / Defected
- Includes traded-back and stopped-servicing for full sales accounting
- "Defected" status comes from data provider feed (not engine-inferred)

### Anomalies (investigation queue)
- Surfaces engine-flagged data quality concerns
- See `ANOMALY_QUEUE_SPEC.md`

---

## Customer categories vs vehicle relationships

The tool reports both:

- **Customer-level counts:** Active, Adopted, Home-grown counts at the customer level
- **Vehicle-relationship-level counts:** Same dimensions at the per-tenure level

Customers with multiple current vehicles count once at the customer level but
multiple times at the vehicle-relationship level. Both numbers are useful and
both should be surfaced.

---

## Contact / context

Jim is the product owner and current builder. The tool serves Convergence
Auto's dealer clients (Team Toyota of Glen Mills is the primary test bed).
The texting use case is the north star.
