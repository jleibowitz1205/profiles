// ===========================================================================
//  PROFILES — Engine module: top-level runner
//
//  One-call wrapper around the full pipeline. Returns:
//    { customers, targets, salesHistory, anomalies, stats }
//
//  Used by the UI uploader. In production this is what the API endpoint
//  /api/refresh would call after a DMS pull.
// ===========================================================================

function runProfilesEngine(salesRows, salesHeaders, serviceRows, serviceHeaders, opts) {
  // Clear engine-scoped globals before each run (so stats from a prior run
  // don't leak in).
  if (typeof window !== 'undefined') {
    window._loyaltyEngineStats = null;
    window._loyaltyAnomalies   = [];
  }

  var result = buildLoyaltyTimeline(salesRows, salesHeaders, serviceRows, serviceHeaders, opts);
  result.targets      = buildTargetRows(result.customers);
  result.salesHistory = buildSalesHistoryRows(result.customers);
  result.anomalies    = collectAnomalies(result);
  result.stats.totalTargets       = result.targets.length;
  result.stats.totalSalesHistory  = result.salesHistory.length;
  result.stats.totalAnomalies     = result.anomalies.length;
  return result;
}
