# Engine Validation Scenarios

Hand-traced test cases proven against real production data. Use these as
acceptance tests for any future engine changes.

Each scenario describes:
- The input data (events in chronological order)
- The expected engine output (customer records, vehicle attribution)
- Why this scenario matters

---

## Scenario 1: Diskin household — 4 separate customers sharing surname

### Input data

**Sale events (Sales file):**

| Date | Buyer | Vehicle bought | Trade-in |
|---|---|---|---|
| Sep 26, 2022 | DANIEL EDISON DISKIN | 2022 Tundra `5TFNA5DB8NX049408` | 2013 Tundra `5TFHY5F16DX319909` |
| Apr 3, 2023 | DANIEL EDISON DISKIN | 2023 Camry `4T1R11BK7PU096555` | 2015 Sienna `5TDDK3DC1FS112345` (Margaret's car) |
| May 8, 2023 | MARGARET B DISKIN | 2023 Sienna `5TDESKFC1PS080297` | (none) |
| Sep 30, 2022 | DIANNE DISKIN | (a 2022 vehicle) | (none) |
| Oct 24, 2024 | EMILY GREY DISKIN | 2024 Corolla Cross Hybrid `7MUFBABGXRV055575` | 2022 Corolla Cross `7MUCAABG0NV002271` |
| Nov 6, 2024 | DANIEL EDISON DISKIN | 2025 Tundra `5TFNA5EC7SX038452` | 2022 Tundra (his own from 2022) |
| Feb 21, 2025 | DANIEL EDISON DISKIN | 2024 BZ4X `JTMABACA8RA089459` | (none) |

**PII per customer:**

| Customer | Email | Cell | Home | Work |
|---|---|---|---|---|
| Daniel Edison Diskin | dandiskin@outlook.com | 6109960910 | **6106962387** | 6105586800 |
| Margaret B Diskin | cubreportr@yahoo.com | 6109997601 | **6106962387** (shared) | 6109997601 |
| Emily Grey Diskin | emilydiskin@gmail.com | 6103167343 | 6104446620 (different) | — |
| Dianne Diskin | olds56conv@aol.com | 6109057322 | — | — |

### Expected output

**Daniel's record:**
- Category: Home-grown — Repeat
- Bucket: Active (last activity ~Mar 5, 2026)
- Sales: 4
- Currently Owns: 2025 Tundra, 2024 BZ4X
- Stopped Servicing: 2023 Camry
- Previously Owned (Traded Back): 2022 Tundra
- Phones: 6109960910, 6106962387, 6105586800 (NO 6109997601 — that's Margaret's)
- Emails: dandiskin@outlook.com (NO cubreportr@yahoo.com)

**Margaret's record:**
- Category: Home-grown — First-time
- Sales: 1
- Currently Owns: 2023 Sienna
- Previously Owned (Traded Back via cross-household trade): 2015 Sienna
- Phones: 6109997601, 6106962387 (NO 6109960910)
- Emails: cubreportr@yahoo.com (NO dandiskin@outlook.com)
- Flagged: Possible Duplicate (because of shared home phone with Daniel)

**Emily's record:**
- Sales: 1
- Currently Owns: 2024 Corolla Cross Hybrid
- Previously Owned: 2022 Corolla Cross

**Dianne's record:**
- Sales: 1
- (no current vehicle if she defected)
- Stopped Servicing flag if applicable

### Why this matters

This scenario tests the **Buyer-of-Record Gate** rules. Daniel and Margaret
share a home phone but are different humans with different cells and emails.
The old engine would have merged them via the shared home phone, creating a
single mega-record. The new engine keeps them separate because:

1. Their first names differ (Daniel vs Margaret) → name-match rule fails
2. They share no VINs (until the cross-household trade)
3. The trade-link rule (Apr 3, 2023 sale where Daniel trades Margaret's
   Sienna) checks names and finds they don't match → no link created

---

## Scenario 2: 2022 Tundra ownership chain

### Input data

| Date | Event | Owner |
|---|---|---|
| Sep 26, 2022 | Sale (Daniel buys) | Daniel |
| Multiple services 2022-2024 | Services attributed to "DANIEL DISKIN" | Daniel |
| Nov 6, 2024 | Trade-out (Daniel trades it in when buying 2025 Tundra) | (transition) |
| Nov 14, 2024 | Service attributed to "DANIEL DISKIN" | (anomaly — see below) |
| Nov 23, 2024 | Service with no name | (dealer prep) |
| Feb 6, 2025 | Service with no name | (pre-sale prep) |
| Feb 7, 2025 | Sale (Victor Rosa buys) | Victor |

### Expected output

**VIN `5TFNA5DB8NX049408` should have TWO tenures:**

1. **Daniel's tenure**: Sep 26, 2022 → Nov 6, 2024, `tradedOut: true`
   - The Nov 14 service (post-trade follow-up) attaches to this CLOSED segment
     as a `post_trade_follow_up` event — does NOT create a new "Daniel adopts
     his own traded car" tenure
2. **Victor's tenure**: Feb 7, 2025 → present, `postTradeOwner: true`

**Skipped events:**
- Nov 23, 2024 (no name) → `post_trade_dealer_custody_skipped`
- Feb 6, 2025 (no name) → `pre_sale_dealer_custody_skipped`

**Daniel's record:**
- Has the 2022 Tundra in `previouslyOwned`, not `currentlyOwns`
- Has the 2025 Tundra in `currentlyOwns`

**Victor's record:**
- Has the 2022 Tundra in `currentlyOwns`
- Flagged `Post-trade Owner` on this specific vehicle row

### Why this matters

This tests **three rules at once**: trade-out delimits tenures, the
post-trade-follow-up attachment rule, and the post-trade dealer-custody skip.
Without these, Daniel would appear to "adopt his own previously-traded Tundra"
which is nonsense.

---

## Scenario 3: Cross-household trade (Daniel trades Margaret's Sienna)

### Input data

- Mar 9, 2023: Margaret services her 2015 Sienna (`5TDDK3DC1FS112345`).
  Service ticket has Margaret's PII.
- Apr 3, 2023: Daniel buys a Camry and trades in the 2015 Sienna. Sale row
  has Daniel's PII.

### Expected output

**Margaret's record:**
- Has the 2015 Sienna in `previouslyOwned` (traded back)
- The Mar 9 service event is on her record (her name on it)
- The Apr 3 trade-out CLOSES her segment on the 2015 Sienna

**Daniel's record:**
- Does NOT show the 2015 Sienna in any of his vehicle lists
- The Apr 3 sale of HIS Camry is properly recorded
- Engine notes the cross-household trade (Daniel trading someone else's car)

### Why this matters

This tests the trade-link rule's NAME CHECK. When a trade-out event's buyer
name (Daniel) differs from the closed segment's owner name (Margaret), the
trade-link is NOT created. This prevents Daniel's Camry segment from being
PII-bridged to Margaret's Sienna segment.

Without this check, Daniel's Camry sale event would attach via trade-link to
Margaret's Sienna segment → shared PII bridging → mega-merge of Daniel and
Margaret. The old engine had this bug.

---

## Scenario 4: Pamela Webster — no longer a mega-cluster

### Input data (production, not visible in test files)

In production data, the old engine attributed 9+ VINs to a single PAMELA
WEBSTER customer record, including vehicles whose actual buyers had surnames:
Anderson, Nunn, Bloxom, Sommers, Wilander, Barraza, Hopkins, McAnany.

### Expected output

PAMELA WEBSTER's current record:
- 1 sale (2026 Toyota Grand Highlander Hybrid)
- 1 currently-owned vehicle
- Her own phone and email only

The other 8 customers (Anderson, Nunn, etc.) each appear as their OWN
customer records with their OWN vehicles.

### Why this matters

This is the headline mega-cluster fix. The Buyer-of-Record Gate prevents PII
from one customer's record from "leaking" through some shared data point
(a salesperson's email, a co-signer's phone, a typo) into other customers'
records.

The 52 different Pamelas in the dataset each have 1-2 sales max under the new
engine. None is a mega-cluster.

---

## Scenario 5: Dealer-internal records excluded

### Input data

- A sale row with buyer name "TEAM TOYOTA OF GLEN MILLS" and email
  `usedcarmgrs@teamtoyotaglenmills.com`
- A service row with the same dealer attribution and email `recon@teamtoyotaglenmills.com`

### Expected output

- The sale row: dropped entirely. No customer record created for "Team Toyota
  of Glen Mills." The VIN doesn't appear as sold.
- The service row: event kept (so the VIN's timeline includes it for context),
  but the PII is stripped. The segment builder treats it as anonymous dealer
  prep and does not create a customer relationship.

### Why this matters

These are internal acquisitions and recon work. Treating them as customers
would inflate counts and pollute texting exports. The engine surfaces them as
"dealer custody" activity on the VIN timeline without creating phantom
customer records.

---

## Scenario 6: Dianne Diskin — unrelated 4th Diskin

### Input data

DIANNE DISKIN has email `olds56conv@aol.com`, cell `6109057322` — NO overlap
with Daniel, Margaret, or Emily's PII.

### Expected output

Dianne appears as her OWN separate customer record. No PII bridges to anyone
else despite sharing surname.

### Why this matters

This validates the right behavior when there's NO PII bridge to begin with —
the engine doesn't try to merge same-surname people just because they share a
surname. The buyer-of-record principle stands: each person's record is
defined by their unique identity, not by family name.

---

## Numbers to compare against (production data, TTGM as of May 19, 2026)

- Total sales rows processed: ~12,665
- Total service rows processed: ~158,898
- Customers identified: 29,019
- Home-grown: 11,620 (764 Repeat / 10,856 First-time)
- Adopted: 17,399
- Stopped servicing flags: 4,269
- Likely lease patterns: 55
- Possible duplicates: 2,977
- Internal vehicles excluded (loaners/shop): 18
- Business names currently filtered (should be included as Phase 4): 20,154

If these numbers shift dramatically after a code change, investigate.

- Tundra-current-owner export (any year, currently owned): 991 rows
- Total target rows: ~29,266 (about 247 more than customer count, due to
  multi-vehicle customers)

---

## Bucket validation scenarios (Azure version)

The Azure version uses 6 buckets vs Apps Script's 5. Specific test cases:

### Boundary case: 540 days (exactly 18 months)

A customer whose last activity was exactly 540 days ago should land in the
**At Risk** bucket, not Defection Risk. The cliff is BETWEEN At Risk (12-18)
and Defection Risk (18-24).

Boundary semantics:
- `days_since <= 540` → At Risk
- `days_since > 540 && days_since <= 720` → Defection Risk
- `days_since > 720 && days_since <= 1065` → High Defection Risk
- `days_since > 1065` → Long Gone

### Defected status from data provider

When data provider feeds "defected" status on a customer:
- Status appears as `Defected` pill on Sales History view rows for the
  defected VIN(s)
- Engine doesn't override it — uses what the data provider says
- "Defected" is independent of time bucket — a customer can be Defected per
  data provider AND in any time bucket per engine inference

### Multi-tenant isolation tests

- Customer A at Dealer 1 with phone `5551234567`
- Customer B at Dealer 2 with phone `5551234567`
- Engine must NOT merge them — they're different dealers, different customers
- Their `dealer_id` values differ; clustering only operates within a dealer

### Daily run history tracking

After Daniel's first daily run:
- `customer_history` shows initial creation events

After his service ticket arrives (drift):
- `customer_history` shows `phone_drift_detected` event with prior and new values

When his bucket transitions (e.g., from Active to Active-Watch):
- `customer_history` shows `bucket_transition` event with prior bucket and new bucket

These should all be queryable.
