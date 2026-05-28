// ===========================================================================
//  PROFILES — Engine module: segment builder (THE 7 RULES)
//  Source: Apps Script v2 (Convergence List Hygiene Tool), verbatim.
//
//  A "segment" (a.k.a. "tenure") is one person's ownership/service period on
//  one VIN at this dealer. The VIN is the spine; tenures are chapters.
//
//  Validated rules applied:
//   1. Trade events delimit tenures (sale opens; trade-out closes)
//   2. Service events attach to the active tenure if a name match is present
//   3. Pre-sale services with NO name = dealer prep, skipped
//   4. Post-trade services with NO name = dealer custody, skipped
//   5. Post-trade services with the TRADER's name = follow-up, attached to closed
//      segment (NOT a new Adopted relationship for the trader)
//   6. Post-trade services with a DIFFERENT name = anomalous, flagged but not
//      creating a new relationship (e.g., family member brings in already-traded car)
//   7. Pre-sale services with a name = legitimate Adopted segment (someone owned
//      the car before the dealer ever sold it, brought it here for service)
//
//  Port note: this is the highest-stakes module. Pair every change with the
//  scenarios in ENGINE_VALIDATION_SCENARIOS.md. Lift to src/engine/segments.ts
// ===========================================================================

function buildVinSegments(eventsByVin) {
  var segments = [];
  var engineStats = {
    pre_sale_dealer_custody_skipped: 0,
    post_trade_dealer_custody_skipped: 0,
    post_trade_trader_followups: 0,
    anomalous_inter_owner_services: 0
  };
  // Anomaly records for the queue (see ANOMALY_QUEUE_SPEC.md)
  var anomalies = [];

  function namesMatch(eventFirst, ownerFirst) {
    if (!eventFirst || !ownerFirst) return false;
    var a = String(eventFirst).trim().toLowerCase();
    var b = String(ownerFirst).trim().toLowerCase();
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length >= 2 && b.length >= 2 && (a.indexOf(b) === 0 || b.indexOf(a) === 0)) return true;
    return false;
  }

  Object.keys(eventsByVin).forEach(function(vin) {
    var evs = eventsByVin[vin].slice().sort(function(a, b) { return a.date - b.date; });

    var currentSeg = null;
    var saleCount = 0;
    var firstSaleSeen = false;
    var postTradeLockout = false;
    var lastClosedSegment = null;
    var lastTraderFirst = null;
    var lastTraderLast  = null;

    evs.forEach(function(e) {
      if (e.type === 'sale') {
        if (currentSeg) segments.push(currentSeg);
        saleCount++;
        firstSaleSeen = true;
        postTradeLockout = false;
        lastClosedSegment = null;
        lastTraderFirst = null;
        lastTraderLast  = null;
        currentSeg = {
          vin: vin,
          ownerSnapshot: {
            firstName: e.firstName || '',
            lastName:  e.lastName  || '',
            phones:    (e.phones || []).slice(),
            emails:    (e.emails || []).slice()
          },
          saleTimePhones: (e.phones || []).slice(),
          saleTimeEmails: (e.emails || []).slice(),
          events: [e],
          startDate: e.date,
          endDate:   e.date,
          postTradeOwner: saleCount > 1,
          flags: []
        };
      } else if (e.type === 'trade-out') {
        if (currentSeg) {
          currentSeg.events.push(e);
          currentSeg.endDate = e.date;
          currentSeg.tradedOut = true;
          // Cross-household trade detection: trade event's buyer name vs the
          // segment's owner name. Different = anomaly.
          var ownerFirst = currentSeg.ownerSnapshot.firstName;
          var ownerLast  = currentSeg.ownerSnapshot.lastName;
          if (e.firstName && ownerFirst && !namesMatch(e.firstName, ownerFirst)) {
            anomalies.push({
              type: 'cross_household_trade',
              vin: vin,
              date: e.date,
              detail: 'Vehicle traded in by ' + (e.firstName + ' ' + e.lastName).trim() +
                      ' but prior owner of record was ' + (ownerFirst + ' ' + ownerLast).trim(),
              priorOwner: { first: ownerFirst, last: ownerLast },
              trader:     { first: e.firstName, last: e.lastName }
            });
            currentSeg.flags.push('cross_household_trade');
          }
          lastTraderFirst = e.firstName || ownerFirst;
          lastTraderLast  = e.lastName  || ownerLast;
          segments.push(currentSeg);
          lastClosedSegment = currentSeg;
          currentSeg = null;
          postTradeLockout = true;
        }
      } else if (e.type === 'service') {
        var hasName = !!(e.firstName);
        if (currentSeg) {
          var matches = namesMatch(e.firstName, currentSeg.ownerSnapshot.firstName);
          currentSeg.events.push(e);
          currentSeg.endDate = e.date;
          if (matches) {
            (e.phones || []).forEach(function(p) {
              if (currentSeg.ownerSnapshot.phones.indexOf(p) === -1) currentSeg.ownerSnapshot.phones.push(p);
            });
            (e.emails || []).forEach(function(em) {
              if (currentSeg.ownerSnapshot.emails.indexOf(em) === -1) currentSeg.ownerSnapshot.emails.push(em);
            });
            if (e.lastName && !currentSeg.ownerSnapshot.lastName) {
              currentSeg.ownerSnapshot.lastName = e.lastName;
            }
          } else if (hasName) {
            if (!currentSeg.nonMatchedServiceNames) currentSeg.nonMatchedServiceNames = [];
            var nameKey = (e.firstName + ' ' + (e.lastName || '')).trim();
            if (currentSeg.nonMatchedServiceNames.indexOf(nameKey) === -1) {
              currentSeg.nonMatchedServiceNames.push(nameKey);
            }
          }
        } else {
          if (postTradeLockout) {
            if (!hasName) {
              engineStats.post_trade_dealer_custody_skipped++;
            } else if (namesMatch(e.firstName, lastTraderFirst)) {
              if (lastClosedSegment) {
                lastClosedSegment.events.push(e);
                if (!lastClosedSegment.postTradeFollowUps) lastClosedSegment.postTradeFollowUps = [];
                lastClosedSegment.postTradeFollowUps.push(e);
                if (lastClosedSegment.flags.indexOf('post_trade_follow_up') === -1) {
                  lastClosedSegment.flags.push('post_trade_follow_up');
                }
                engineStats.post_trade_trader_followups++;
              }
            } else {
              engineStats.anomalous_inter_owner_services++;
              anomalies.push({
                type: 'anomalous_inter_owner_service',
                vin: vin,
                date: e.date,
                detail: 'Service ticket attributed to ' + (e.firstName + ' ' + (e.lastName||'')).trim() +
                        ' on a vehicle traded in by ' + (lastTraderFirst + ' ' + (lastTraderLast||'')).trim(),
                attribution: { first: e.firstName, last: e.lastName },
                trader:      { first: lastTraderFirst, last: lastTraderLast }
              });
              if (lastClosedSegment) {
                var flag = 'anomalous_inter_owner_service:' + e.firstName;
                if (lastClosedSegment.flags.indexOf(flag) === -1) {
                  lastClosedSegment.flags.push(flag);
                }
              }
            }
          } else if (!firstSaleSeen) {
            if (!hasName) {
              engineStats.pre_sale_dealer_custody_skipped++;
            } else {
              currentSeg = {
                vin: vin,
                ownerSnapshot: {
                  firstName: e.firstName || '',
                  lastName:  e.lastName  || '',
                  phones:    (e.phones || []).slice(),
                  emails:    (e.emails || []).slice()
                },
                saleTimePhones: [],
                saleTimeEmails: [],
                events: [e],
                startDate: e.date,
                endDate:   e.date,
                serviceOnly: true,
                flags: []
              };
            }
          } else {
            if (hasName) {
              currentSeg = {
                vin: vin,
                ownerSnapshot: {
                  firstName: e.firstName || '',
                  lastName:  e.lastName  || '',
                  phones:    (e.phones || []).slice(),
                  emails:    (e.emails || []).slice()
                },
                saleTimePhones: [],
                saleTimeEmails: [],
                events: [e],
                startDate: e.date,
                endDate:   e.date,
                serviceOnly: true,
                flags: []
              };
            }
          }
        }
      }
    });

    if (currentSeg) segments.push(currentSeg);
  });

  // Stash engine stats globally so the caller can log them
  if (typeof window !== 'undefined') {
    window._loyaltyEngineStats = engineStats;
    window._loyaltyAnomalies   = anomalies;
  }
  return segments;
}
