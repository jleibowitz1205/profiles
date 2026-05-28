// ===========================================================================
//  PROFILES — Engine module: time-bucket classifier
//
//  Per ARCHITECTURE.md "Convergence standard" — 6 buckets (Azure target spec).
//  Apps Script v2 currently uses 5 (collapses Defection Risk + High Defection
//  Risk into one). The Azure rebuild splits them; this module is the new
//  standard.
//
//  Port note: keep as the single source of truth — engine, exports, and UI
//  all read from here. Lift directly to src/engine/buckets.ts
// ===========================================================================

var BUCKETS = [
  { key: 'Active',              label: 'Active',              min: 0,    max: 180,   range: '0–6 months',    color: '#5E10BC', bg: '#F0ECFD', tone: 'good',     dot: '🟣' },
  { key: 'Active-Watch',        label: 'Active-Watch',        min: 181,  max: 365,   range: '6–12 months',   color: '#7C3AED', bg: '#F3EFFD', tone: 'good',     dot: '🟣' },
  { key: 'At Risk',             label: 'At Risk',             min: 366,  max: 540,   range: '12–18 months',  color: '#CA8A04', bg: '#FEF9C3', tone: 'warn',     dot: '🟡' },
  { key: 'Defection Risk',      label: 'Defection Risk',      min: 541,  max: 720,   range: '18–24 months — past the cliff', color: '#EA580C', bg: '#FED7AA', tone: 'danger', dot: '🟠', cliff: true },
  { key: 'High Defection Risk', label: 'High Defection Risk', min: 721,  max: 1065,  range: '25–35 months',  color: '#DC2626', bg: '#FEE2E2', tone: 'danger',   dot: '🔴' },
  { key: 'Long Gone',           label: 'Long Gone',           min: 1066, max: Infinity, range: '36+ months', color: '#525252', bg: '#E5E5E5', tone: 'gone',     dot: '⚫' }
];

function classifyBucket(daysSinceLast) {
  if (daysSinceLast === null || daysSinceLast === undefined) return 'Unknown';
  for (var i = 0; i < BUCKETS.length; i++) {
    if (daysSinceLast <= BUCKETS[i].max) return BUCKETS[i].key;
  }
  return 'Long Gone';
}

function bucketDef(key) {
  for (var i = 0; i < BUCKETS.length; i++) {
    if (BUCKETS[i].key === key) return BUCKETS[i];
  }
  return null;
}
