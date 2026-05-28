// ===========================================================================
//  PROFILES — Engine module: normalizers
//  Source: Apps Script v2 (Convergence List Hygiene Tool), verbatim.
//  Port note: pure functions, lift directly to src/ingest/normalizers.ts
// ===========================================================================

// ── Phone normalization — strips formatting, drops leading "1" on 11-digit US ──
function normLoyaltyPhone(p) {
  var s = String(p || '').replace(/\D/g, '');
  if (s.length === 11 && s.charAt(0) === '1') s = s.substring(1);
  return s.length === 10 ? s : '';
}

// ── Email normalization — lowercases, returns '' if no '@' ─────────────────
function normLoyaltyEmail(e) {
  var s = String(e || '').trim().toLowerCase();
  if (!s || s.indexOf('@') < 0) return '';
  return s;
}

// ── VIN normalization — uppercase A-Z0-9 only, must be exactly 17 chars ────
function normLoyaltyVin(v) {
  if (!v) return '';
  var s = String(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === 17 ? s : '';
}

// ── Column-finder — looks up a header by case-insensitive name (or alternates)
function findCol(headers, names) {
  if (!headers) return -1;
  var lower = headers.map(function(h) { return String(h || '').toLowerCase().replace(/\s+/g, ''); });
  for (var i = 0; i < names.length; i++) {
    var needle = String(names[i]).toLowerCase().replace(/\s+/g, '');
    var idx = lower.indexOf(needle);
    if (idx !== -1) return idx;
  }
  return -1;
}

// ── Date parser — accepts a handful of common DMS-export formats ────────────
function parseLoyaltyDate(s) {
  if (!s) return null;
  s = String(s).trim();
  if (!s) return null;
  // Try native Date.parse first (covers ISO and most JS-friendly formats)
  var t = Date.parse(s);
  if (!isNaN(t)) return new Date(t);
  // "Apr 3, 2023, 10:30 AM" style
  var m = s.match(/^([A-Za-z]{3,9}) (\d{1,2}),? (\d{4})(?:,? (\d{1,2}):(\d{2}) ?(AM|PM))?$/i);
  if (m) {
    var monthMap = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11,
                     january:0,february:1,march:2,april:3,june:5,july:6,august:7,september:8,october:9,november:10,december:11 };
    var mo = monthMap[m[1].toLowerCase().slice(0, m[1].length >= 4 ? m[1].length : 3)];
    if (mo === undefined) mo = monthMap[m[1].toLowerCase().slice(0,3)];
    var day = parseInt(m[2], 10);
    var year = parseInt(m[3], 10);
    var hour = m[4] ? parseInt(m[4], 10) : 0;
    var min  = m[5] ? parseInt(m[5], 10) : 0;
    if (m[6] && m[6].toUpperCase() === 'PM' && hour < 12) hour += 12;
    if (m[6] && m[6].toUpperCase() === 'AM' && hour === 12) hour = 0;
    return new Date(year, mo, day, hour, min);
  }
  // m/d/yyyy
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    var y = parseInt(m[3], 10);
    if (y < 100) y += y < 50 ? 2000 : 1900;
    return new Date(y, parseInt(m[1], 10) - 1, parseInt(m[2], 10));
  }
  return null;
}

// ── Junk-detectors for placeholder phones & emails ─────────────────────────
var JUNK_PHONE_PATTERNS = [
  /^(\d)\1{9}$/,           // any digit repeated 10x
  /^1234567890$/,
  /^999\d{7}$/,            // 999 prefix
  /^555\d{7}$/             // 555 placeholder
];
function isJunkPhone(p) {
  return JUNK_PHONE_PATTERNS.some(function(re) { return re.test(p); });
}

function isJunkEmail(e) {
  if (!e) return true;
  var lc = String(e).toLowerCase();
  if (/^(no.?email|none|na|n\/a|test|noemail|nomail|noreply|donotreply)@/i.test(lc)) return true;
  if (/^(recon|usedcarmgrs|usedcarmgr|service|sales|info|admin)@/i.test(lc)) return true;
  if (/@(test\.|example\.|dealership\.|none\.|invalid\.|no\.|nodomain)/i.test(lc)) return true;
  if (/^[^@]+@(test|example|none|invalid)$/i.test(lc)) return true;
  return false;
}

// ── Dealer-internal record detector (used in ingest) ───────────────────────
var INTERNAL_EMAIL_PATTERNS = [/^recon@/i, /^usedcarmgrs?@/i];
var INTERNAL_NAME_PATTERNS  = [/dealership account/i, /\bteam\b.*\b(toyota|honda|ford|chevy)\b/i];

function isDealerInternal(name, emails) {
  for (var i = 0; i < (emails || []).length; i++) {
    for (var j = 0; j < INTERNAL_EMAIL_PATTERNS.length; j++) {
      if (INTERNAL_EMAIL_PATTERNS[j].test(emails[i] || '')) return true;
    }
  }
  for (var k = 0; k < INTERNAL_NAME_PATTERNS.length; k++) {
    if (INTERNAL_NAME_PATTERNS[k].test(name || '')) return true;
  }
  return false;
}

// ── Name parsing — "MARGARET B DISKIN" → first="MARGARET" last="DISKIN" ────
var NAME_SUFFIX_RE = /^(jr|sr|ii|iii|iv|jr\.|sr\.)$/i;
function parseFullName(full) {
  if (!full) return { first: '', last: '' };
  var parts = String(full).trim().split(/\s+/);
  if (!parts.length) return { first: '', last: '' };
  if (parts.length === 1) return { first: '', last: parts[0] };
  var first = parts[0];
  var rest = parts.slice(1);
  while (rest.length > 1 && NAME_SUFFIX_RE.test(rest[rest.length - 1])) rest.pop();
  return { first: first, last: rest[rest.length - 1] || '' };
}
