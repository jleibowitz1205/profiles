// ===========================================================================
// Extracted from index.html (Convergence List Hygiene Tool - Apps Script v2)
// Functions: detectInternalVehicles
// ===========================================================================

function detectInternalVehicles(eventsByVin, soldVinSet) {
  var internalVins = new Set();
  Object.keys(eventsByVin).forEach(function(vin) {
    var evs = eventsByVin[vin];
    var serviceCount = 0;
    evs.forEach(function(e){ if (e.type === 'service') serviceCount++; });
    // Heuristic: >25 service visits AND not sold here = internal vehicle
    if (serviceCount > 25 && !soldVinSet.has(vin)) {
      internalVins.add(vin);
    }
  });
  return internalVins;
}

// ── Build event stream from sales + service rows ────────────────────────────

