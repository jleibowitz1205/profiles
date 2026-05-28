# Known Issues and Next Steps

Status as of May 19, 2026. Engine v2 is shipped and validated in Apps Script.
Active migration to Azure-hosted custom codebase with Claude Code.

---

## Active work

### 1. Migration to Azure custom codebase (primary path)

The Apps Script tool stays in production until the Azure system is live with
DMS feeds and validated.

Build sequence:
1. Schema setup on Azure (see `SCHEMA_PROPOSAL.md`)
2. Port engine logic into TypeScript modules (see `PORTING_GUIDE.md`)
3. Validate Azure engine output matches Apps Script + Python prototype on
   the same inputs (exact match required, see `ENGINE_VALIDATION_SCENARIOS.md`)
4. Build DMS ingestion adapters (per DMS provider)
5. Build daily scheduled job
6. Build UI on top of the API
7. Build anomaly queue UI (see `ANOMALY_QUEUE_SPEC.md`)
8. Build suppression framework (see `SUPPRESSION_RULES.md`)
9. Multi-tenant access control
10. Migrate first dealer (TTGM) to Azure
11. Validate against parallel Apps Script run for a sprint
12. Retire Apps Script once Azure is stable

### 2. Sales-History view (still incomplete, build in Azure version)

The Currently Owned view shows one row per (customer, currently-owned VIN).
Traded-back and stopped-servicing sales don't get rows. When user filters
"Last Sale: Feb 2024 → today" in current Apps Script tool, ~800 sales of
~12,665 are invisible.

**Design (per requirements):**
- View toggle: "Currently Owned" (default) and "Sales History"
- Sales History rows = SALE events only (no Adopted rows — Adopted stays in
  service pipeline)
- Status pill per Sales History row: Currently Owned / Traded Back /
  Stopped Servicing / Defected
- "Defected" status comes from data provider feed, NOT engine-inferred
- Default export still uses Currently Owned grain (texting use case)
- Sales History export grain available for analytics queries

Build in Azure version. Don't backport to Apps Script.

### 3. Business records (still incomplete, build in Azure version)

The Apps Script tool excludes ~20,154 business records from the analysis
entirely. These are real sales and service relationships that should be
warehoused.

**Design (per requirements):**
- Stop filtering them out — include in customer table
- Set `customer_type = 'business'` (one flat flag, no sub-categorization)
- Default texting view hides them via filter chip
- Email addresses kept for warehousing
- Sales History view shows them
- Business detection rule: keyword regex (LLC, INC, TRUST, CORP, LTD, etc.)
  plus specific name patterns Jim will document

### 4. Anomaly queue (NEW capability for Azure version)

See `ANOMALY_QUEUE_SPEC.md` for full spec. Surfaces engine-flagged data quality
concerns for operator investigation. Required for production launch.

### 5. Suppression framework (NEW capability for Azure version)

See `SUPPRESSION_RULES.md`. In-tool suppression rules applied at export time.
Required for production launch. Jim to specify the actual rules.

### 6. History tracking (NEW capability for Azure version)

Per the agreed snapshot + history model:
- Daily ingest produces new state
- Compare to previous state
- Log meaningful changes to `customer_history` table
- Enables queries like "show me everyone whose phone changed in the last 90 days"

### 7. Multi-tenancy

Per the agreed model: one application instance, multiple dealers tagged via
`dealer_id`. Per-dealer access control. Convergence admin role for cross-dealer
visibility.

### 8. Customer-level and vehicle-relationship-level analytics

Both surfaced. Customer counts (how many customers in Active bucket) AND
vehicle relationship counts (how many active vehicle relationships). They're
different numbers for multi-car households.

### 9. Deal Type admin override

Admin UI for manual Deal Type override on a specific sale event or all sales
of a specific VIN. Engine consults the override table when computing lease
detection.

### 10. Time zone handling

Multi-dealer support across time zones. Engine stores UTC, computes
"days since last interaction" in each dealer's local time zone (configured
on the dealer record).

---

## Confirmed locked decisions (don't re-litigate)

These were settled during the requirements review and are baked into the docs:

| Question | Decision |
|---|---|
| Adopted in Sales History view | No — Adopted stays in service pipeline only |
| Default view | Currently Owned |
| Status pill labels | "Currently Owned" / "Traded Back" / "Stopped Servicing" / "Defected" |
| Defected status source | Data provider, not engine-inferred |
| Date filter in Currently Owned | Customer-level most-recent (current behavior) |
| Business definition | Keyword regex + specific name patterns |
| Business texting | Excluded; emails warehoused |
| Business subcategorization | None — flat `customer_type = 'business'` |
| Engine validation threshold | Exact match required |
| Discrepancy handling | Investigate by hand |
| Apps Script timing | Stay until Azure has live DMS feeds and is validated |
| Database choice | Dev team's choice (Azure SQL or Postgres) |
| BI tool | TBD |
| Refresh cadence | Daily DMS pull |
| Tenancy model | Multi-tenant |
| Compliance | Dealer-data agreement restrictions apply |
| Stopped Servicing cliff | 18 months, universal standard |
| Time buckets | 0-6 / 6-12 / 12-18 / 18-24 / 25-35 / 36+ |
| Time zone handling | Required |
| Customer vs vehicle analytics | Surface both |
| Suppression | In-tool |
| Deal Type override | Admin-level manual |
| Anomaly queue UI | Required |
| Phone drift refinement | Single flag (no additive vs replacement split) |
| Default sort | Per-view (Currently Owned: Last Activity; Sales History: Sale Date) |
| Column visibility | Toggle per view |
| Saved view presets | Nice-to-have, later sprint |
| History tracking | Snapshot + history model |

---

## Medium priority — display polish (move to Azure)

### 11. Stats strip dual-counts

Stats panel header shows both customer counts and vehicle-relationship counts.
E.g., "29,019 customers across 30,891 vehicle relationships."

### 12. Adopted one-off vehicles in detail panel

When a customer has a single-service one-off vehicle (e.g., Daniel + 2006 VW
Beetle, one service Aug 2023), make sure the segment surfaces as its own
vehicle block in the detail panel.

---

## Phase 2 — bigger picture (after first Azure launch)

### 13. Inventory feed integration

When the dealer inventory feed is integrated:
- VIN traded back + on lot listing → "On Lot, For Sale"
- VIN traded back + not in inventory → "Wholesaled or Disposed"

Replaces the current "Traded back, unknown fate" honest-uncertainty.

### 14. Replace data-provider relationship (T2 → Convergence)

Long-term: Convergence becomes its own data provider. The cleaned, validated
customer-vehicle records this tool produces become the product. The "Defected"
status currently sourced from data provider is the early signal — eventually
Convergence itself feeds this back.

### 15. Loaner detection

If `anomalous_inter_owner_service` keeps resolving as "loaner attribution,"
add a loaner-vehicle detection step in the engine.

### 16. Household linking

Recognize legitimate household pairs (shared home phone, different surnames)
as "linked households" without merging them. Enables household-aware campaigns.

### 17. View presets

Saved filter/sort/column combinations (e.g., "Tundra Service Campaign" preset
that auto-applies filters).

### 18. Campaign tracking

Tie exports to campaigns. Track send → engagement → conversion at the
(customer, vehicle) row grain.

---

## Don't break these (regression tests)

The scenarios in `ENGINE_VALIDATION_SCENARIOS.md` must continue to pass on the
Azure engine. Highlights:

- Daniel + Margaret + Emily + Dianne stay as 4 separate customers
- Pamela Webster has 1 sale, not 9 unrelated VINs
- Victor Rosa is the current 2022 Tundra owner, not Daniel
- Cross-household trade doesn't merge Daniel and Margaret
- Post-trade follow-up services attach to closed segments
- Dealer-internal records excluded entirely
