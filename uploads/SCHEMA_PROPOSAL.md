"""
VIN-Spine Engine — Python Validation Prototype
================================================

Reference implementation of the engine logic in pure Python. Useful for:
  - Validating the JavaScript engine against the same logic
  - Running ad-hoc analyses against CSV exports
  - Spot-checking specific customer/VIN scenarios

This implements the same 7 rules and Buyer-of-Record Gate as the production
JS engine in index.html.

USAGE:
  python3 vin_spine_engine_v2.py path/to/sales.csv path/to/service.csv

Expects the same CSV column conventions used by Convergence's existing
DMS export pipeline (Phone W Clean, Phone C Clean, Phone H Clean, Full Name,
Vinex Make, Vinex Model, Vinex Year, Vin, Trade Vin, Purchase Date, etc.)
"""

import csv
import re
import sys
from collections import defaultdict, Counter
from datetime import datetime

TODAY = datetime.now()

# ─────────────────────────────────────────────────────────────────────────────
# Parsers and normalizers
# ─────────────────────────────────────────────────────────────────────────────

DATE_FORMATS = [
    '%b %d, %Y, %I:%M %p',
    '%B %d, %Y, %I:%M %p',
    '%b %d, %Y',
    '%B %d, %Y',
    '%Y-%m-%d',
    '%m/%d/%Y',
    '%d-%b-%y',
    '%Y-%m-%dT%H:%M:%S',
]

def parse_date(s):
    if not s: return None
    s = str(s).strip()
    for fmt in DATE_FORMATS:
        try: return datetime.strptime(s, fmt)
        except ValueError: continue
    return None

def norm_vin(v):
    if not v: return ''
    s = re.sub(r'[^A-Z0-9]', '', str(v).upper())
    return s if len(s) == 17 else ''

def norm_phone(p):
    if not p: return ''
    digits = re.sub(r'\D', '', str(p))
    if len(digits) == 11 and digits.startswith('1'):
        digits = digits[1:]
    return digits if len(digits) == 10 else ''

def norm_email(e):
    if not e: return ''
    s = str(e).strip().lower()
    return s if '@' in s else ''

# ─────────────────────────────────────────────────────────────────────────────
# Name handling
# ─────────────────────────────────────────────────────────────────────────────

NAME_SUFFIXES = re.compile(r'^(jr|sr|ii|iii|iv|jr\.|sr\.)$', re.I)

def parse_full_name(full):
    """Parse 'MARGARET B DISKIN' → first='MARGARET', last='DISKIN'.
    Drops middle names/initials and JR/SR suffixes."""
    if not full: return ('', '')
    parts = str(full).strip().split()
    if not parts: return ('', '')
    if len(parts) == 1: return ('', parts[0])
    first = parts[0]
    rest = parts[1:]
    while len(rest) > 1 and NAME_SUFFIXES.match(rest[-1]):
        rest.pop()
    last = rest[-1] if rest else ''
    return (first, last)

def names_match(a, b):
    """Tolerates 'DAN' vs 'DANIEL' via 2-char prefix overlap."""
    if not a or not b: return False
    a = str(a).strip().lower()
    b = str(b).strip().lower()
    if a == b: return True
    if len(a) >= 2 and len(b) >= 2 and (a.startswith(b) or b.startswith(a)):
        return True
    return False

def first_last_key(first, last):
    """Generate a normalized key for two segments to compare names.
    'mar|diskin' for both 'MARGARET' and 'MARGARET B DISKIN'."""
    f = str(first or '').strip().lower()
    l = str(last or '').strip().lower()
    if len(f) >= 3:
        f = f[:3]
    lp = l.split()
    lw = lp[-1] if lp else ''
    return f + '|' + lw

# ─────────────────────────────────────────────────────────────────────────────
# Dealer-internal exclusion
# ─────────────────────────────────────────────────────────────────────────────

INTERNAL_EMAIL_PATTERNS = [
    re.compile(r'^recon@', re.I),
    re.compile(r'^usedcarmgrs?@', re.I),
]

INTERNAL_NAME_PATTERNS = [
    re.compile(r'team toyota of glen mills', re.I),
    re.compile(r'team toyota glen mills', re.I),
]

def is_dealer_internal(name, emails):
    """Returns True if this row is a dealer-internal record (recon dept,
    used car management) that should be excluded from customer relationships."""
    for em in (emails or []):
        for pat in INTERNAL_EMAIL_PATTERNS:
            if pat.match(em or ''):
                return True
    for pat in INTERNAL_NAME_PATTERNS:
        if pat.search(name or ''):
            return True
    return False

JUNK_EMAIL_PATTERNS = [
    re.compile(r'^(no.?email|none|na|n/a|test|noemail|nomail|noreply|donotreply)@', re.I),
    re.compile(r'@(test\.|example\.|dealership\.|none\.|invalid\.|no\.|nodomain)', re.I),
]

def is_junk_email(e):
    if not e: return True
    for pat in JUNK_EMAIL_PATTERNS:
        if pat.search(e):
            return True
    return False

# ─────────────────────────────────────────────────────────────────────────────
# Event stream builder
# ─────────────────────────────────────────────────────────────────────────────

def build_event_stream(sales_path, service_path):
    """Reads both CSV files and produces events keyed by VIN."""
    events_by_vin = defaultdict(list)
    sale_count = 0
    sale_with_trade = 0
    service_count = 0
    sold_vin_set = set()

    # SALES
    with open(sales_path, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader):
            vin = norm_vin(row.get('Vin', ''))
            if not vin: continue
            date = parse_date(row.get('Purchase Date', ''))
            if not date: continue

            full = (row.get('Full Name') or '').strip()
            first, last = parse_full_name(full)
            email = norm_email(row.get('Email', ''))
            emails = [email] if email and not is_junk_email(email) else []
            phones = []
            for c in ('Phone C Clean', 'Phone H Clean', 'Phone W Clean'):
                p = norm_phone(row.get(c, ''))
                if p: phones.append(p)

            # Dealer-internal exclusion
            if is_dealer_internal(full, emails + [email]):
                continue

            event = {
                'type': 'sale', 'vin': vin, 'date': date,
                'firstName': first, 'lastName': last,
                'phones': phones, 'emails': emails,
                'phoneCell': norm_phone(row.get('Phone C Clean', '')),
                'phoneHome': norm_phone(row.get('Phone H Clean', '')),
                'phoneWork': norm_phone(row.get('Phone W Clean', '')),
                'year': (row.get('Vinex Year') or '').strip(),
                'make': (row.get('Vinex Make') or '').strip(),
                'model': (row.get('Vinex Model') or '').strip(),
                '_srcRow': idx,
            }
            events_by_vin[vin].append(event)
            sold_vin_set.add(vin)
            sale_count += 1

            trade_vin = norm_vin(row.get('Trade Vin', ''))
            if trade_vin:
                sale_with_trade += 1
                events_by_vin[trade_vin].append({
                    'type': 'trade-out', 'vin': trade_vin, 'date': date,
                    'firstName': first, 'lastName': last,
                    'phones': phones, 'emails': emails,
                    'tradeBuyerVin': vin,
                    '_srcRow': idx,
                })

    # SERVICES
    with open(service_path, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader):
            vin = norm_vin(row.get('Vin', ''))
            if not vin: continue
            date = parse_date(row.get('Dt Close Converted', ''))
            if not date: continue

            first = (row.get('First Name') or '').strip()
            last = (row.get('Last Name') or '').strip()
            email = norm_email(row.get('Email 1', ''))
            emails = [email] if email and not is_junk_email(email) else []
            phones = []
            for c in ('Phone C Clean', 'Phone H Clean', 'Phone W Clean'):
                p = norm_phone(row.get(c, ''))
                if p: phones.append(p)

            # Dealer-internal: strip attribution but keep the event (for VIN timeline)
            if is_dealer_internal(f'{last} {first}', emails):
                first, last = '', ''
                phones, emails = [], []

            events_by_vin[vin].append({
                'type': 'service', 'vin': vin, 'date': date,
                'firstName': first, 'lastName': last,
                'phones': phones, 'emails': emails,
                'year': (row.get('Vinex Year') or '').strip(),
                'make': (row.get('Vinex Make') or '').strip(),
                'model': (row.get('Vinex Model') or '').strip(),
                '_srcRow': idx,
            })
            service_count += 1

    # Sort events per VIN
    for vin in events_by_vin:
        events_by_vin[vin].sort(key=lambda e: e['date'])

    return events_by_vin, sale_count, sale_with_trade, service_count, sold_vin_set

# ─────────────────────────────────────────────────────────────────────────────
# Build segments (the 7 rules)
# ─────────────────────────────────────────────────────────────────────────────

def build_segments(events_by_vin):
    segments = []
    stats = {
        'pre_sale_dealer_custody_skipped': 0,
        'post_trade_dealer_custody_skipped': 0,
        'post_trade_trader_followups': 0,
        'anomalous_inter_owner_services': 0,
    }

    for vin, evs in events_by_vin.items():
        current = None
        sale_count = 0
        first_sale_seen = False
        lockout = False
        last_closed_seg = None
        last_trader_first = None

        for e in evs:
            if e['type'] == 'sale':
                if current: segments.append(current)
                sale_count += 1
                first_sale_seen = True
                lockout = False
                last_closed_seg = None
                last_trader_first = None
                current = {
                    'vin': vin, 'type': 'sale-anchored',
                    'ownerFirst': e['firstName'], 'ownerLast': e['lastName'],
                    'phones': list(e['phones']), 'emails': list(e['emails']),
                    'start': e['date'], 'end': e['date'],
                    'isPostTradeOwner': sale_count > 1,
                    'serviceCount': 0,
                    'lastSaleDate': e['date'], 'lastServiceDate': None,
                    'year': e['year'], 'make': e['make'], 'model': e['model'],
                    'events': [e], 'flags': [],
                    'tradedOut': False,
                }
            elif e['type'] == 'trade-out':
                if current:
                    current['events'].append(e)
                    current['end'] = e['date']
                    current['tradedOut'] = True
                    last_closed_seg = current
                    last_trader_first = e['firstName']
                    segments.append(current)
                    current = None
                    lockout = True
            elif e['type'] == 'service':
                has_name = bool(e['firstName'])
                if current:
                    matches = names_match(e['firstName'], current['ownerFirst']) if has_name else False
                    current['events'].append(e)
                    current['end'] = e['date']
                    current['lastServiceDate'] = e['date']
                    current['serviceCount'] += 1
                    if matches:
                        for p in e['phones']:
                            if p not in current['phones']:
                                current['phones'].append(p)
                        for em in e['emails']:
                            if em not in current['emails']:
                                current['emails'].append(em)
                else:
                    if lockout:
                        if not has_name:
                            stats['post_trade_dealer_custody_skipped'] += 1
                        elif names_match(e['firstName'], last_trader_first):
                            if last_closed_seg:
                                last_closed_seg['events'].append(e)
                                last_closed_seg['flags'].append('post_trade_follow_up')
                                stats['post_trade_trader_followups'] += 1
                        else:
                            stats['anomalous_inter_owner_services'] += 1
                            if last_closed_seg:
                                last_closed_seg['flags'].append(f'anomalous_inter_owner_service:{e["firstName"]}')
                    elif not first_sale_seen:
                        if not has_name:
                            stats['pre_sale_dealer_custody_skipped'] += 1
                        else:
                            current = {
                                'vin': vin, 'type': 'service-only',
                                'ownerFirst': e['firstName'], 'ownerLast': e['lastName'],
                                'phones': list(e['phones']), 'emails': list(e['emails']),
                                'start': e['date'], 'end': e['date'],
                                'isPostTradeOwner': False, 'serviceCount': 1,
                                'lastSaleDate': None, 'lastServiceDate': e['date'],
                                'year': e['year'], 'make': e['make'], 'model': e['model'],
                                'events': [e], 'flags': [],
                                'tradedOut': False,
                            }
                    else:
                        if has_name:
                            current = {
                                'vin': vin, 'type': 'service-only',
                                'ownerFirst': e['firstName'], 'ownerLast': e['lastName'],
                                'phones': list(e['phones']), 'emails': list(e['emails']),
                                'start': e['date'], 'end': e['date'],
                                'isPostTradeOwner': False, 'serviceCount': 1,
                                'lastSaleDate': None, 'lastServiceDate': e['date'],
                                'year': e['year'], 'make': e['make'], 'model': e['model'],
                                'events': [e], 'flags': [],
                                'tradedOut': False,
                            }
        if current: segments.append(current)

    return segments, stats

# ─────────────────────────────────────────────────────────────────────────────
# Buyer-of-Record Gate clustering (see ARCHITECTURE.md for the rule)
# ─────────────────────────────────────────────────────────────────────────────

class UnionFind:
    def __init__(self, n):
        self.parent = list(range(n))
    def find(self, x):
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x
    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb: self.parent[ra] = rb

def cluster_segments(segments):
    """Cluster segments into customers using Buyer-of-Record Gate."""
    # Indexes
    seg_idx_by_vin = defaultdict(list)
    trade_out_seg_by_buyer_vin = defaultdict(list)
    sale_seg_by_own_vin = defaultdict(list)
    for i, seg in enumerate(segments):
        seg_idx_by_vin[seg['vin']].append(i)
        if seg['tradedOut']:
            for e in seg['events']:
                if e['type'] == 'trade-out' and e.get('tradeBuyerVin'):
                    trade_out_seg_by_buyer_vin[e['tradeBuyerVin']].append(i)
        if seg['type'] == 'sale-anchored':
            sale_seg_by_own_vin[seg['vin']].append(i)

    # Trade-link adjacency with name check
    trade_linked = set()
    def mark_linked(i, j):
        if i == j: return
        a, b = min(i, j), max(i, j)
        trade_linked.add((a, b))

    for buyer_vin, trader_segs in trade_out_seg_by_buyer_vin.items():
        buyer_segs = sale_seg_by_own_vin.get(buyer_vin, [])
        for ti in trader_segs:
            trader_seg = segments[ti]
            trade_event = next((e for e in trader_seg['events'] if e['type'] == 'trade-out'), None)
            if not trade_event: continue
            buyer_key_first = (trade_event['firstName'] or '').strip().lower()[:3]
            owner_key_first = (trader_seg['ownerFirst'] or '').strip().lower()[:3]
            if buyer_key_first and owner_key_first and buyer_key_first != owner_key_first:
                continue  # cross-household trade — don't bridge
            for bi in buyer_segs:
                mark_linked(ti, bi)

    # Name keys for fast lookup
    def seg_name_keys(seg):
        f = (seg['ownerFirst'] or '').strip().lower()
        l = (seg['ownerLast'] or '').strip().lower()
        first_prefix = f[:3] if len(f) >= 3 else f
        last_words = l.split()
        last_word = last_words[-1] if last_words else ''
        return first_prefix, last_word

    seg_keys = [seg_name_keys(s) for s in segments]

    def pair_allowed(i, j):
        if i == j: return True
        if segments[i]['vin'] == segments[j]['vin']: return True
        a, b = min(i, j), max(i, j)
        if (a, b) in trade_linked: return True
        fp1, lw1 = seg_keys[i]
        fp2, lw2 = seg_keys[j]
        if fp1 and fp2 and fp1 == fp2 and lw1 and lw2 and lw1 == lw2:
            return True
        return False

    # PII indexes with high-cardinality filter
    HIGH_CARDINALITY = 25
    by_phone = defaultdict(list)
    by_email = defaultdict(list)
    for i, seg in enumerate(segments):
        for p in seg['phones']:
            by_phone[p].append(i)
        for em in seg['emails']:
            by_email[em].append(i)
    # Drop high-cardinality
    by_phone = {p: ix for p, ix in by_phone.items() if len(ix) <= HIGH_CARDINALITY}
    by_email = {em: ix for em, ix in by_email.items() if len(ix) <= HIGH_CARDINALITY}

    # Union with gate
    uf = UnionFind(len(segments))
    gate_allowed = 0
    gate_blocked = 0
    for grp in list(by_phone.values()) + list(by_email.values()):
        if len(grp) < 2: continue
        for ii in range(len(grp)):
            for jj in range(ii + 1, len(grp)):
                if pair_allowed(grp[ii], grp[jj]):
                    uf.union(grp[ii], grp[jj])
                    gate_allowed += 1
                else:
                    gate_blocked += 1

    # Assemble clusters
    clusters = defaultdict(list)
    for i in range(len(segments)):
        root = uf.find(i)
        clusters[root].append(i)
    return clusters, gate_allowed, gate_blocked

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main(sales_path, service_path):
    print(f"VIN-Spine Engine v2 — Python validation")
    print(f"Sales: {sales_path}")
    print(f"Service: {service_path}")
    print()

    events_by_vin, n_sale, n_trade, n_service, sold_vins = build_event_stream(sales_path, service_path)
    print(f"Sales events: {n_sale:,} (of which {n_trade:,} had trade-in)")
    print(f"Service events: {n_service:,}")
    print(f"Distinct VINs: {len(events_by_vin):,}")
    print()

    segments, stats = build_segments(events_by_vin)
    print(f"Segments built: {len(segments):,}")
    print(f"  Pre-sale dealer-custody skipped: {stats['pre_sale_dealer_custody_skipped']:,}")
    print(f"  Post-trade dealer-custody skipped: {stats['post_trade_dealer_custody_skipped']:,}")
    print(f"  Post-trade trader follow-ups: {stats['post_trade_trader_followups']:,}")
    print(f"  Anomalous inter-owner services: {stats['anomalous_inter_owner_services']:,}")
    print()

    clusters, gate_allowed, gate_blocked = cluster_segments(segments)
    print(f"Customer clusters: {len(clusters):,}")
    print(f"  Buyer-of-record gate: {gate_allowed:,} PII bridges allowed, {gate_blocked:,} blocked")
    print()

    # Type breakdown
    by_type = Counter(s['type'] for s in segments)
    print(f"Segment types:")
    for t, n in by_type.most_common():
        print(f"  {t}: {n:,}")
    print()

    # Trade-out / post-trade counts
    traded = sum(1 for s in segments if s['tradedOut'])
    post_trade = sum(1 for s in segments if s['isPostTradeOwner'])
    print(f"Trade-out segments (vehicle left customer): {traded:,}")
    print(f"Post-trade owner segments (bought a trade-in): {post_trade:,}")

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: python3 vin_spine_engine_v2.py SALES.csv SERVICE.csv")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
