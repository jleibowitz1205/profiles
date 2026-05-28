// ===========================================================================
// Extracted from index.html (Convergence List Hygiene Tool - Apps Script v2)
// Functions: buildVinSegments
// ===========================================================================

function buildVinSegments(eventsByVin) {
  // ─────────────────────────────────────────────────────────────────────────
  //  ENGINE v2 — Tenure builder
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
  // ─────────────────────────────────────────────────────────────────────────
  var segments = [];
  var engineStats = {
    pre_sale_dealer_custody_skipped: 0,
    post_trade_dealer_custody_skipped: 0,
    post_trade_trader_followups: 0,
    anomalous_inter_owner_services: 0
  };

  function namesMatch(eventFirst, ownerFirst) {
    if (!eventFirst || !ownerFirst) return false;
    var a = String(eventFirst).trim().toLowerCase();
    var b = String(ownerFirst).trim().toLowerCase();
    if (!a || !b) return false;
    if (a === b) return true;
    // Tolerate common nickname/initial variations (Dan ↔ Daniel, Mike ↔ Michael)
    if (a.length >= 2 && b.length >= 2 && (a.indexOf(b) === 0 || b.indexOf(a) === 0)) return true;
    return false;
  }

  Object.keys(eventsByVin).forEach(function(vin){
    var evs = eventsByVin[vin].slice().sort(function(a,b){ return a.date - b.date; });

    var currentSeg = null;
    var saleCount = 0;
    var firstSaleSeen = false;       // until we see a sale, pre-sale rules apply
    var postTradeLockout = false;    // true after a trade-out closes a segment
    var lastClosedSegment = null;    // for attaching post-trade follow-ups
    var lastTraderFirst = null;      // first name of the most recent trader

    evs.forEach(function(e){
      if (e.type === 'sale') {
        if (currentSeg) segments.push(currentSeg);
        saleCount++;
        firstSaleSeen = true;
        postTradeLockout = false;
        lastClosedSegment = null;
        lastTraderFirst = null;
        currentSeg = {
          vin: vin,
          ownerSnapshot: {
            firstName: e.firstName || '',
            lastName:  e.lastName  || '',
            phones:    (e.phones||[]).slice(),
            emails:    (e.emails||[]).slice()
          },
          saleTimePhones: (e.phones||[]).slice(),
          saleTimeEmails: (e.emails||[]).slice(),
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
          // Capture the trader's first name from the trade event (it's the buyer
          // of the next vehicle, who is the same person trading this one in).
          lastTraderFirst = e.firstName || currentSeg.ownerSnapshot.firstName;
          segments.push(currentSeg);
          lastClosedSegment = currentSeg;
          currentSeg = null;
          postTradeLockout = true;
        }
      } else if (e.type === 'service') {
        var hasName = !!(e.firstName);
        if (currentSeg) {
          // Active tenure — service attaches with name-match gate for PII contribution
          var matches = namesMatch(e.firstName, currentSeg.ownerSnapshot.firstName);
          currentSeg.events.push(e);
          currentSeg.endDate = e.date;
          if (matches) {
            (e.phones||[]).forEach(function(p){
              if (currentSeg.ownerSnapshot.phones.indexOf(p) === -1) currentSeg.ownerSnapshot.phones.push(p);
            });
            (e.emails||[]).forEach(function(em){
              if (currentSeg.ownerSnapshot.emails.indexOf(em) === -1) currentSeg.ownerSnapshot.emails.push(em);
            });
            if (e.lastName && !currentSeg.ownerSnapshot.lastName) {
              currentSeg.ownerSnapshot.lastName = e.lastName;
            }
          } else if (hasName) {
            // Different name on the service ticket — could be spouse/family.
            // Don't update buyer's PII slots; track for visibility.
            if (!currentSeg.nonMatchedServiceNames) currentSeg.nonMatchedServiceNames = [];
            var nameKey = (e.firstName + ' ' + (e.lastName||'')).trim();
            if (currentSeg.nonMatchedServiceNames.indexOf(nameKey) === -1) {
              currentSeg.nonMatchedServiceNames.push(nameKey);
            }
          }
        } else {
          // No active tenure — figure out what kind of orphan this is
          if (postTradeLockout) {
            // Post-trade dealer-custody phase
            if (!hasName) {
              // No name → dealer prep on inventory between owners, skip
              engineStats.post_trade_dealer_custody_skipped++;
            } else if (namesMatch(e.firstName, lastTraderFirst)) {
              // Same name as trader → post-trade follow-up service
              // Attach to closed segment (the trader's prior chapter)
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
              // Different name — anomalous inter-owner service
              // (e.g., family member brings in already-traded car)
              // Flag the closed segment but DON'T create a new Adopted relationship
              engineStats.anomalous_inter_owner_services++;
              if (lastClosedSegment) {
                var flag = 'anomalous_inter_owner_service:' + e.firstName;
                if (lastClosedSegment.flags.indexOf(flag) === -1) {
                  lastClosedSegment.flags.push(flag);
                }
              }
            }
          } else if (!firstSaleSeen) {
            // Pre-sale phase — VIN hasn't been sold here yet
            if (!hasName) {
              // No name → dealer prep, skip
              engineStats.pre_sale_dealer_custody_skipped++;
            } else {
              // Has a name → legitimate Adopted segment. Someone owned the car
              // before the dealer (bought elsewhere), brought it here for service.
              currentSeg = {
                vin: vin,
                ownerSnapshot: {
                  firstName: e.firstName || '',
                  lastName:  e.lastName  || '',
                  phones:    (e.phones||[]).slice(),
                  emails:    (e.emails||[]).slice()
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
            // Mid-history orphan (very rare). Treat as Adopted if named, skip otherwise.
            if (hasName) {
              currentSeg = {
                vin: vin,
                ownerSnapshot: {
                  firstName: e.firstName || '',
                  lastName:  e.lastName  || '',
                  phones:    (e.phones||[]).slice(),
                  emails:    (e.emails||[]).slice()
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
  if (typeof window !== 'undefined') window._loyaltyEngineStats = engineStats;
  return segments;
}

// ── Union-Find for clustering segments into customers ───────────────────────

