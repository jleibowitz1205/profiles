// ===========================================================================
//  PROFILES — Engine module: internal-vehicle detection
//  Source: Apps Script v2 (Convergence List Hygiene Tool), verbatim.
//
//  Heuristic: a VIN with >25 service visits that was NEVER sold here is
//  almost certainly a dealer loaner, courtesy vehicle, or shop car.
//  Excluded from customer relationships.
// ===========================================================================

function detectInternalVehicles(eventsByVin, soldVinSet) {
  var internalVins = new Set();
  Object.keys(eventsByVin).forEach(function(vin) {
    var evs = eventsByVin[vin];
    var serviceCount = 0;
    evs.forEach(function(e) { if (e.type === 'service') serviceCount++; });
    if (serviceCount > 25 && !soldVinSet.has(vin)) {
      internalVins.add(vin);
    }
  });
  return internalVins;
}
