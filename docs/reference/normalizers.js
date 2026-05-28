// ===========================================================================
// Extracted from index.html (Convergence List Hygiene Tool - Apps Script v2)
// Functions: normLoyaltyPhone, normLoyaltyEmail
// ===========================================================================

function normLoyaltyPhone(p) {
  var s = String(p||'').replace(/\D/g,'');
  if (s.length === 11 && s.charAt(0) === '1') s = s.substring(1);
  return s.length === 10 ? s : '';
}

// ── Email normalization ─────────────────────────────────────────────────────

function normLoyaltyEmail(e) {
  var s = String(e||'').trim().toLowerCase();
  if (!s || s.indexOf('@') < 0) return '';
  return s;
}

// ── Internal vehicle detector — high service freq + no sale = loaner/shop ──

