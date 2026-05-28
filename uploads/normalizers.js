# Anomaly Queue Specification

The engine flags certain data-quality concerns and edge cases during its run.
Per the requirements, these need a dedicated UI surface so operators can
investigate and resolve them.

This document specifies what gets flagged, how the queue UI should work, and
how anomalies feed back into engine improvements.

---

## What gets flagged

Each anomaly is a structured event with a `type`, related entities (customers,
VINs, events), and structured details. Types currently produced by the engine:

### `anomalous_inter_owner_service`

**Trigger:** A service event on a VIN that was traded back, where the service
ticket's name doesn't match the trader.

**Example:** Daniel Diskin serviced his daughter Emily's 2022 Corolla Cross on
Dec 17, 2024 — two months AFTER Emily traded it in. The car was dealer
inventory at that moment, not Emily's, not Daniel's.

**Why it matters:** Could be:
- Family member bringing in another family member's car (legitimate but
  attribution is ambiguous)
- Loaner vehicle attribution error (Daniel was using this car as a loaner;
  the DMS attributed the service to him)
- Data entry error (wrong customer attached to the service ticket)

**Resolution paths:** Operator reviews, can:
- Mark "loaner attribution" — engine should consider adding a loaner
  detection step
- Mark "data error" — engine output is correct, no action needed
- Mark "legitimate family service" — possibly worth a future enhancement
  to link family members

### `cross_household_trade`

**Trigger:** A trade-in event where the buyer of the new car has a different
name than the prior owner of the traded-in VIN.

**Example:** Daniel buys a Camry on Apr 3, 2023 and trades in Margaret's 2015
Sienna as part of the deal. Margaret was the owner (per her prior service
tickets); Daniel is the buyer of the new car.

**Why it matters:** This is normal household behavior, not an error. But the
engine surfaces it so operators can understand:
- Margaret's relationship with us — she had a Sienna, now she doesn't
- Daniel's relationship — bought a Camry, paid using her trade equity
- Whether household consolidation marketing might be appropriate

**Resolution paths:** Usually "acknowledge" — these are real household trades.
Could be used for household-aware marketing in the future.

### `possible_duplicate`

**Trigger:** Two customer records share PII (phone or email) but the
Buyer-of-Record gate refused to merge them. They might be:
- True duplicates (data entry created two records for the same person)
- Legitimate households (different people, same home phone)
- Coincidental data overlap

**Example:** Daniel and Margaret share home phone `6106962387`. They're
separate customers per the rules, but flagged for visibility.

**Resolution paths:**
- "True duplicate" — operator manually merges the records (need a UI for this)
- "Same household" — keep separate, mark as known household pair
- "Coincidence" — keep separate, no further action

### `high_volume_customer`

**Trigger:** A customer record exceeds reasonable thresholds:
- `num_sales > 20`
- `num_services > 100`

**Example:** A commercial account that slipped through the business filter, or
a remaining over-merge from a gate edge case.

**Why it matters:** Likely a data quality issue or an unflagged business.

**Resolution paths:**
- Flag as business (add suppression rule, mark `customer_type = 'business'`)
- Investigate for over-merge (check VINs, names, see if the cluster is wrong)
- Acknowledge as legitimate high-volume (rare — usually fleet customers)

### `phone_drift`

**Trigger:** A customer's phone has changed from the value on their sale row
to a different value on subsequent service tickets.

**Example:** Daniel's sale row shows cell `6109960910`. Service tickets after
the sale show a different number. Engine logs both.

**Why it matters:** Could be:
- Customer changed phone numbers — opportunity to verify and update CRM
- Different family member dropped the car off — phone is theirs, not the
  buyer's
- Data entry error

**Resolution paths:** Surface for proactive outreach: "We noticed your phone
changed, can you verify?"

### `email_drift`

Same as phone drift, for emails.

### `service_gap`

**Trigger:** A customer bought a vehicle here, never traded it back, but
service activity on that VIN stopped 18+ months ago.

**Example:** Daniel's 2023 Camry — bought April 2023, last service October
2024, no trade event. He still technically owns it per our data, but
behavior says he's gone elsewhere for service.

**Why it matters:** This is the "Stopped Servicing" / defection signal.
Already surfaced as a per-row flag in the table, but also worth showing in
the anomaly queue for proactive winback campaigns.

### `pre_sale_dealer_custody_high`

**Trigger:** The count of pre-sale dealer-custody service events exceeds a
threshold for the run.

**Why it matters:** If this number spikes, something has changed in the DMS
data structure (e.g., service tickets are arriving without names that
previously had them). Worth investigating.

**Resolution paths:** This is more of a system-health flag than a
per-customer anomaly. Maybe surface in a separate "System Health" panel
rather than the customer-anomaly queue.

---

## UI surface

### Anomalies tab (new view)

A dedicated tab alongside Currently Owned and Sales History. Shows the
anomaly queue.

### Default view

| Column | Description |
|---|---|
| Anomaly Type | The `anomaly_type` value |
| Customer(s) | Customer name(s) involved (linked to detail panels) |
| VIN(s) | Related VIN(s) |
| Detected | When the engine flagged it |
| Status | open / investigating / resolved / suppressed |
| Details | Type-specific context summary |
| Actions | Resolve / Investigate / Suppress / Open customer detail |

### Filters

- By anomaly type (chip group)
- By status (open by default)
- By date range (detected_at)
- By dealer (Convergence admin only)

### Sort

Default: detected_at descending (newest first).
Secondary sorts: by type, by status, by customer name.

### Bulk actions

Operator can select multiple rows and:
- Resolve as batch (e.g., "all cross-household trades acknowledged")
- Suppress as batch (don't show again until next change)
- Export to CSV for offline review

### Per-anomaly detail panel

Clicking an anomaly opens a panel showing:
- Full context of the anomaly
- The customer records involved (Daniel's record, Emily's record)
- The events involved (the Dec 17 service, the trade-in event)
- Engine's reasoning (which rule fired, what data triggered it)
- Action buttons:
  - **Resolve** — mark as handled, optionally add notes
  - **Suppress** — don't re-flag this specific anomaly in future runs
  - **Escalate** — flag for Convergence engineering review (e.g., a bug
    suspected in the engine)

### Resolution workflow

1. Operator opens an anomaly
2. Reviews context, decides action
3. Selects resolution type and adds notes
4. Engine re-runs may produce the same anomaly again — suppression rules
   should prevent re-flagging when the underlying data hasn't changed

### Suppression of recurring anomalies

If an anomaly is the same kind on the same VIN with the same customers, and
operator marked it resolved last time, don't re-flag it. A simple hash of
(anomaly_type, sorted customer_ids, sorted vins) can dedupe.

---

## Feeding back into engine improvements

The anomaly queue isn't just for one-off resolution. It's also Convergence's
quality signal for improving the engine.

### Quarterly review

Every quarter, look at:
- Which anomaly types fire most often?
- Which resolutions are most common?
- Are there patterns suggesting new engine rules?

### Example improvements that could come out of anomaly review

- **Loaner detection.** If `anomalous_inter_owner_service` keeps resolving as
  "loaner attribution," consider adding a loaner-vehicle detection step (e.g.,
  service on a dealer-owned VIN within X days of a customer's other service
  visit).
- **Family linking.** If `cross_household_trade` patterns are frequent, add a
  household-pair detection (without merging customers).
- **Business name pattern updates.** If high-volume customers keep being
  manually flagged as businesses, learn from their names and add patterns to
  the business filter.

### Metrics to track

- Anomalies detected per day (trend over time — should stabilize)
- Resolution time (median time from detected_at to resolved_at)
- Resolution distribution by type (acknowledged / fixed-in-source / engine-bug)
- Re-detection rate (anomalies that get resolved then re-fire)

---

## Implementation phasing

### Phase 1 (must-have)
- Anomalies table with all current types
- Anomaly tab in UI with filter/sort/detail
- Resolve / Suppress actions
- Notes field for resolution context

### Phase 2 (should-have)
- Bulk actions
- Export to CSV
- Escalation workflow
- Per-anomaly deduplication / re-flag suppression

### Phase 3 (nice-to-have)
- Quarterly review dashboard
- Engine improvement suggestions surfaced automatically
- Loaner detection enhancement (driven by anomaly resolution patterns)
- Family linking enhancement
