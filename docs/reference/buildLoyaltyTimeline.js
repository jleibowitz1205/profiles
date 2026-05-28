// ===========================================================================
// Extracted from index.html (Convergence List Hygiene Tool - Apps Script v2)
// Functions: buildLoyaltyTimeline
// ===========================================================================

function buildLoyaltyTimeline(salesRows, salesHeaders, serviceRows, serviceHeaders, opts) {
  var t0 = Date.now();
  opts = opts || {};
  var DEFECTION_DAYS  = opts.defectionThresholdDays  || 540;   // 18 months
  var LONG_GONE_DAYS  = opts.longGoneThresholdDays   || 1096;  // 36 months
  var SERVICE_GAP_DAYS = opts.serviceGapThresholdDays || 540;  // 18 months

  // ── Step 1: Build event stream ────────────────────────────────────────────
  var streamResult = buildEventStream(salesRows, salesHeaders, serviceRows, serviceHeaders);
  var events = streamResult.events;
  var unparseableDates = streamResult.unparseableDates;
  var hasDealTypeColumn = streamResult.hasDealTypeColumn;

  // ── Step 2: Group events by VIN ───────────────────────────────────────────
  var eventsByVin = {};
  events.forEach(function(e){
    if (!eventsByVin[e.vin]) eventsByVin[e.vin] = [];
    eventsByVin[e.vin].push(e);
  });

  // ── Step 3: Detect internal/dealer vehicles ───────────────────────────────
  var soldVinSet = new Set();
  events.forEach(function(e){ if (e.type === 'sale') soldVinSet.add(e.vin); });
  var internalVins = detectInternalVehicles(eventsByVin, soldVinSet);

  // Filter out internal-vehicle events
  if (internalVins.size > 0) {
    internalVins.forEach(function(vin){ delete eventsByVin[vin]; });
  }

  // ── Step 4: Build VIN segments (one segment = one owner's tenure on a VIN)
  var segments = buildVinSegments(eventsByVin);

  // ── Step 5: Cluster segments into customers ───────────────────────────────
  // Index segments by phone and email for matching
  var byPhone = {};
  var byEmail = {};

  // Junk phones — placeholder/throwaway values. Never merge on these.
  var JUNK_PHONE_PATTERNS = [
    /^(\d)\1{9}$/,              // any digit repeated 10x (0000000000, 1111111111, ...)
    /^1234567890$/,
    /^999\d{7}$/,               // 999 prefix
    /^555\d{7}$/                // 555 placeholder
  ];
  function isJunkPhone(p) {
    return JUNK_PHONE_PATTERNS.some(function(re){ return re.test(p); });
  }
  function isJunkEmail(e) {
    if (!e) return true;
    var lc = String(e).toLowerCase();
    // Common placeholder addresses
    if (/^(no.?email|none|na|n\/a|test|noemail|nomail|noreply|donotreply)@/i.test(lc)) return true;
    // Dealer recon/internal addresses
    if (/^(recon|usedcarmgrs|usedcarmgr|service|sales|info|admin)@.*teamtoyota/i.test(lc)) return true;
    // Test/invalid domains
    if (/@(test\.|example\.|dealership\.|none\.|invalid\.|no\.|nodomain)/i.test(lc)) return true;
    if (/^[^@]+@(test|example|none|invalid)$/i.test(lc)) return true;
    return false;
  }

  segments.forEach(function(seg, i){
    seg.ownerSnapshot.phones.forEach(function(p){
      if (isJunkPhone(p)) return;
      if (!byPhone[p]) byPhone[p] = [];
      byPhone[p].push(i);
    });
    seg.ownerSnapshot.emails.forEach(function(e){
      if (isJunkEmail(e)) return;
      if (!byEmail[e]) byEmail[e] = [];
      byEmail[e].push(i);
    });
  });

  // High-cardinality rejection: a phone/email appearing across many segments is
  // NOT a real customer identifier (dealer's line, default value, etc.). Real
  // customers might have 2-5 segments per phone (multi-car household over years).
  // Beyond ~25 segments is suspicious — drop it from the union step.
  var HIGH_CARDINALITY_THRESHOLD = 25;
  var rejectedPhones = [];
  var rejectedEmails = [];
  Object.keys(byPhone).forEach(function(p){
    if (byPhone[p].length > HIGH_CARDINALITY_THRESHOLD) {
      rejectedPhones.push({ phone: p, segments: byPhone[p].length });
      delete byPhone[p];
    }
  });
  Object.keys(byEmail).forEach(function(e){
    if (byEmail[e].length > HIGH_CARDINALITY_THRESHOLD) {
      rejectedEmails.push({ email: e, segments: byEmail[e].length });
      delete byEmail[e];
    }
  });
  if (rejectedPhones.length || rejectedEmails.length) {
    console.log('[Loyalty Timeline] Suppressed high-cardinality identifiers:',
      rejectedPhones.length, 'phones,', rejectedEmails.length, 'emails');
    if (rejectedPhones.length) console.log('  Sample rejected phones:', rejectedPhones.slice(0, 10));
    if (rejectedEmails.length) console.log('  Sample rejected emails:', rejectedEmails.slice(0, 10));
  }

  // ── BUYER-OF-RECORD GATE ──────────────────────────────────────────────
  // PII bridges (shared phone/email) are only allowed to merge segments when
  // there's independent evidence they belong to the same person:
  //   1. Segments share a VIN (proven shared ownership of a specific car), OR
  //   2. Segments are connected by a trade-link chain (a trade-out from one
  //      VIN feeds the sale of another — same person did the trade)
  // Shared PII WITHOUT this evidence is treated as household/coincidence and
  // does NOT merge. This keeps spouses, family members at same address, and
  // unrelated customers sharing a dealer-default phone correctly separated.
  //
  // Build:
  //   - segIdxByVin:    vin → [segment indices that touched this VIN]
  //   - tradeLinks:     segIdx → set of segIdx connected by trade-link chains
  // ───────────────────────────────────────────────────────────────────────
  var segIdxByVin = {};
  var tradeOutSegByBuyerVin = {};   // segments that ended in trade-out, keyed by the buyer-of-next-car's VIN
  var saleSegByOwnVin       = {};   // sale-anchored segments, keyed by their own VIN
  segments.forEach(function(seg, i){
    if (!segIdxByVin[seg.vin]) segIdxByVin[seg.vin] = [];
    segIdxByVin[seg.vin].push(i);
    if (seg.tradedOut) {
      // Find the trade-out event in this segment to learn the buyer VIN
      seg.events.forEach(function(e){
        if (e.type === 'trade-out' && e.tradeBuyerVin) {
          if (!tradeOutSegByBuyerVin[e.tradeBuyerVin]) tradeOutSegByBuyerVin[e.tradeBuyerVin] = [];
          tradeOutSegByBuyerVin[e.tradeBuyerVin].push(i);
        }
      });
    }
    if (!seg.serviceOnly) {
      // Sale-anchored segment — index by its own VIN so trade-link chains can find it
      if (!saleSegByOwnVin[seg.vin]) saleSegByOwnVin[seg.vin] = [];
      saleSegByOwnVin[seg.vin].push(i);
    }
  });

  // Build trade-link adjacency: trader's closed segment ↔ trader's next sale segment
  // (a person who traded in VIN X to buy VIN Y → segments on X and Y are linked)
  //
  // IMPORTANT: Only link when the trader and the buyer of the next car are the
  // SAME PERSON. In a cross-household trade (e.g., Daniel trades in his wife
  // Margaret's car as part of HIS deal), the owner of the traded VIN (Margaret)
  // is different from the buyer of the new car (Daniel). They are NOT the same
  // person and must not be PII-bridged.
  //
  // We detect this by comparing the closed segment's OWNER name (which the
  // engine attributed via service-event name matching) to the trade event's
  // attribution (which is the BUYER's name from the sale row). If they
  // mismatch, the trade-link is NOT created.
  function firstLastKey(first, last) {
    var f = String(first||'').trim().toLowerCase();
    var l = String(last||'').trim().toLowerCase();
    if (!f && !l) return '';
    if (f.length >= 3) f = f.slice(0, 3);
    var lp = l.split(/\s+/);
    var lw = lp.length ? lp[lp.length - 1] : '';
    return f + '|' + lw;
  }
  var tradeLinkedPairs = {};  // "i:j" key (i<j) → true
  function markPairLinked(i, j) {
    if (i === j) return;
    var a = Math.min(i, j), b = Math.max(i, j);
    tradeLinkedPairs[a + ':' + b] = true;
  }
  Object.keys(tradeOutSegByBuyerVin).forEach(function(buyerVin){
    var traderSegs = tradeOutSegByBuyerVin[buyerVin];
    var buyerSegs  = saleSegByOwnVin[buyerVin] || [];
    traderSegs.forEach(function(ti){
      var traderSeg = segments[ti];
      // Find the trade-out event to get the BUYER's name (the person initiating
      // the trade-in by buying the next car). This is the SAME name as the
      // buyer of the new VIN.
      var tradeEvent = null;
      for (var k = 0; k < traderSeg.events.length; k++) {
        if (traderSeg.events[k].type === 'trade-out') { tradeEvent = traderSeg.events[k]; break; }
      }
      if (!tradeEvent) return;
      var buyerKey = firstLastKey(tradeEvent.firstName, tradeEvent.lastName);
      // Owner of the traded segment: whoever the engine attributed as the owner
      // (from service-event name matching or from the original sale).
      var ownerKey = firstLastKey(traderSeg.ownerSnapshot.firstName, traderSeg.ownerSnapshot.lastName);
      // Only allow the link if buyer and owner are the same person (or one is unknown).
      // If both are known and different → cross-household trade, NO link.
      if (buyerKey && ownerKey && buyerKey !== ownerKey) {
        return;  // cross-household trade — don't bridge
      }
      buyerSegs.forEach(function(bi){
        markPairLinked(ti, bi);
      });
    });
  });

  function normalizeNameKey(first, last) {
    var f = String(first||'').trim().toLowerCase();
    var l = String(last||'').trim().toLowerCase();
    if (f.length >= 3) f = f.slice(0, 3);
    return f + '|' + l;
  }

  // Last-word extractor — given "B DISKIN" or "EDISON DISKIN", returns "diskin".
  // Used by the gate's name match so middle-name parsing artifacts don't block merges.
  function lastWord(name) {
    var s = String(name||'').trim().toLowerCase();
    if (!s) return '';
    var parts = s.split(/\s+/);
    return parts[parts.length - 1];
  }

  // Pre-compute name keys + last-word for each segment for fast lookup in pairAllowed
  var segNameKey = segments.map(function(s){
    return normalizeNameKey(s.ownerSnapshot.firstName, s.ownerSnapshot.lastName);
  });
  var segLastWord = segments.map(function(s){
    return lastWord(s.ownerSnapshot.lastName);
  });
  var segFirstPrefix = segments.map(function(s){
    var f = String(s.ownerSnapshot.firstName||'').trim().toLowerCase();
    return f.length >= 3 ? f.slice(0, 3) : f;
  });

  function pairAllowed(i, j) {
    if (i === j) return true;
    if (segments[i].vin === segments[j].vin) return true;       // shared VIN
    var a = Math.min(i, j), b = Math.max(i, j);
    if (tradeLinkedPairs[a + ':' + b]) return true;              // trade-link chain
    // Same-person multi-purchase (no trade between): allow if names match closely.
    // Match rule: first-name prefix matches AND last-word of last-name matches.
    // This tolerates "MARGARET DISKIN" vs "MARGARET B DISKIN" middle-initial drift,
    // while still keeping "DANIEL DISKIN" vs "MARGARET DISKIN" separate.
    var fp1 = segFirstPrefix[i], fp2 = segFirstPrefix[j];
    var lw1 = segLastWord[i],    lw2 = segLastWord[j];
    if (fp1 && fp2 && fp1 === fp2 && lw1 && lw2 && lw1 === lw2) return true;
    return false;
  }

  // Union all segments that share a phone or email — but ONLY if each pair is
  // allowed by the buyer-of-record gate (shared VIN, trade-link, or name match).
  // We check ALL pairs in each group (not just anchored at index 0) so that one
  // bad pair early in the list doesn't prevent other valid merges.
  var uf = makeUnionFind(segments.length);
  var gateBlocked = 0;
  var gateAllowed = 0;
  function tryUnionGrp(grp) {
    if (grp.length < 2) return;
    for (var ii = 0; ii < grp.length; ii++) {
      for (var jj = ii + 1; jj < grp.length; jj++) {
        if (pairAllowed(grp[ii], grp[jj])) {
          uf.union(grp[ii], grp[jj]);
          gateAllowed++;
        } else {
          gateBlocked++;
        }
      }
    }
  }
  Object.values(byPhone).forEach(tryUnionGrp);
  Object.values(byEmail).forEach(tryUnionGrp);
  if (typeof window !== 'undefined') {
    window._loyaltyClusterStats = { gateBlocked: gateBlocked, gateAllowed: gateAllowed };
    console.log('[Loyalty Timeline] Buyer-of-record gate: ' + gateAllowed + ' PII bridges allowed, ' + gateBlocked + ' blocked.');
  }

  // Group segments into clusters
  var clusters = {};
  segments.forEach(function(seg, i){
    var root = uf.find(i);
    if (!clusters[root]) clusters[root] = [];
    clusters[root].push(i);
  });

  // ── Step 6: Convert clusters → customer records ──────────────────────────
  var now = new Date();
  var customers = [];
  var possibleDuplicatePairs = 0;

  // Build per-VIN vehicle info lookup (year/make/model) — sale event wins over service,
  // most recent wins within each type. Trade-out events fill in for vehicles never sold here.
  var vehicleInfoByVin = {};
  events.forEach(function(e){
    if (!e.vehicleYear && !e.vehicleMake && !e.vehicleModel) return;
    var info = vehicleInfoByVin[e.vin];
    var priority = e.type === 'sale' ? 3 : e.type === 'trade-out' ? 2 : 1;
    if (!info || priority > info._priority ||
        (priority === info._priority && e.date > info._date)) {
      vehicleInfoByVin[e.vin] = {
        year:  e.vehicleYear  || (info ? info.year  : ''),
        make:  e.vehicleMake  || (info ? info.make  : ''),
        model: e.vehicleModel || (info ? info.model : ''),
        _priority: priority,
        _date: e.date
      };
    }
  });

  Object.keys(clusters).forEach(function(rootKey){
    var segIdxs = clusters[rootKey];
    var segs = segIdxs.map(function(i){ return segments[i]; });

    // Merge PII across all segments — collect everything, then pick display name from MOST RECENT SALE
    var firstNames = [];           // all unique first names seen across segments (kept for export/audit)
    var lastNames = [];            // all unique last names seen across segments
    var phones = [];
    var emails = [];
    var allEvents = [];
    var currentlyOwns = [];
    var previouslyOwned = [];
    var lostFromNetwork = [];
    var numSales = 0;
    var numServices = 0;
    var lastSaleDate = null;
    var lastServiceDate = null;
    var firstActivityDate = null;
    var lastActivityDate = null;
    var isPostTradeOwner = false;

    // Track most-recent-sale name and most-recent-service name separately —
    // we lock buyer identity to the sale event per the VIN-anchored rule
    var mostRecentSaleName = null;       // { date, first, last }
    var mostRecentServiceName = null;    // { date, first, last } — fallback for Adopted
    var mostRecentServiceOnlyVin = null; // { vin, date } — used to pick the "current" vehicle for Adopted customers
    var saleTimePhonesAll = [];          // union of phones-at-sale across all of this customer's sale segments
    var saleTimeEmailsAll = [];          // union of emails-at-sale across all of this customer's sale segments
    var mostRecentSaleSegment = null;    // { phones, emails, date } — for drift comparison

    segs.forEach(function(seg){
      if (seg.ownerSnapshot.firstName && firstNames.indexOf(seg.ownerSnapshot.firstName) === -1) firstNames.push(seg.ownerSnapshot.firstName);
      if (seg.ownerSnapshot.lastName  && lastNames.indexOf(seg.ownerSnapshot.lastName)  === -1) lastNames.push(seg.ownerSnapshot.lastName);
      seg.ownerSnapshot.phones.forEach(function(p){ if (phones.indexOf(p) === -1) phones.push(p); });
      seg.ownerSnapshot.emails.forEach(function(e){ if (emails.indexOf(e) === -1) emails.push(e); });
      if (seg.postTradeOwner) isPostTradeOwner = true;

      // Collect sale-time PII from sale-anchored segments
      if (!seg.serviceOnly && seg.saleTimePhones) {
        seg.saleTimePhones.forEach(function(p){
          if (saleTimePhonesAll.indexOf(p) === -1) saleTimePhonesAll.push(p);
        });
        seg.saleTimeEmails.forEach(function(em){
          if (saleTimeEmailsAll.indexOf(em) === -1) saleTimeEmailsAll.push(em);
        });
        if (!mostRecentSaleSegment || seg.startDate > mostRecentSaleSegment.date) {
          mostRecentSaleSegment = {
            date:    seg.startDate,
            phones:  (seg.saleTimePhones||[]).slice(),
            emails:  (seg.saleTimeEmails||[]).slice()
          };
        }
      }

      seg.events.forEach(function(e){
        allEvents.push(e);
        if (e.type === 'sale') {
          numSales++;
          if (!lastSaleDate || e.date > lastSaleDate) lastSaleDate = e.date;
          // Lock buyer identity to the most recent sale's PII
          if (!mostRecentSaleName || e.date > mostRecentSaleName.date) {
            mostRecentSaleName = {
              date:  e.date,
              first: e.firstName || '',
              last:  e.lastName  || ''
            };
          }
        } else if (e.type === 'service') {
          numServices++;
          if (!lastServiceDate || e.date > lastServiceDate) lastServiceDate = e.date;
          // Track most recent service name only as fallback for Adopted customers
          if (!mostRecentServiceName || e.date > mostRecentServiceName.date) {
            mostRecentServiceName = {
              date:  e.date,
              first: e.firstName || '',
              last:  e.lastName  || ''
            };
          }
        }
        if (!firstActivityDate || e.date < firstActivityDate) firstActivityDate = e.date;
        if (!lastActivityDate  || e.date > lastActivityDate)  lastActivityDate  = e.date;
      });

      // VIN ownership accounting
      if (seg.tradedOut) {
        if (previouslyOwned.indexOf(seg.vin) === -1) previouslyOwned.push(seg.vin);
      } else if (seg.serviceOnly) {
        // Service-only segment (Adopted customer for this VIN — never bought it here).
        // Track for later: most-recent service-only VIN becomes their "current vehicle"
        if (!mostRecentServiceOnlyVin || seg.endDate > mostRecentServiceOnlyVin.date) {
          mostRecentServiceOnlyVin = { vin: seg.vin, date: seg.endDate };
        }
      } else {
        // Sale-anchored segment (Home-grown) — vehicle is currently owned
        if (currentlyOwns.indexOf(seg.vin) === -1) currentlyOwns.push(seg.vin);
      }
    });

    // If no sale-anchored vehicles exist (pure Adopted customer) but they have service activity,
    // surface their MOST RECENT serviced VIN as their current vehicle.
    if (currentlyOwns.length === 0 && mostRecentServiceOnlyVin) {
      currentlyOwns.push(mostRecentServiceOnlyVin.vin);
    }

    // ── Phone/Email Drift detection ────────────────────────────────────────────
    // For sale customers: do current phones differ from sale-time phones?
    // If so, flag for verification ("phone might have changed since the sale").
    var hasPhoneDrift = false;
    var hasEmailDrift = false;
    var driftedPhones = [];
    var driftedEmails = [];
    if (mostRecentSaleSegment) {
      phones.forEach(function(p){
        if (mostRecentSaleSegment.phones.indexOf(p) === -1 && saleTimePhonesAll.indexOf(p) === -1) {
          driftedPhones.push(p);
          hasPhoneDrift = true;
        }
      });
      emails.forEach(function(em){
        if (mostRecentSaleSegment.emails.indexOf(em) === -1 && saleTimeEmailsAll.indexOf(em) === -1) {
          driftedEmails.push(em);
          hasEmailDrift = true;
        }
      });
    }

    // ── Resolve Cell / Home / Work per Convergence Standard schema ────────────
    // Rule: most recent name-matched event wins per slot. Sale events outrank service.
    // For Adopted customers (no sale), use service events as-is.
    var bestCell = '', bestHome = '', bestWork = '';
    var bestCellDate = null, bestHomeDate = null, bestWorkDate = null;
    var bestCellSource = '', bestHomeSource = '', bestWorkSource = '';
    var isAdopted = customerCategory === 'Adopted';

    function consider(ev, slot, value) {
      if (!value) return;
      // For sale customers: only count if event is a sale OR is a name-matched service
      var eventQualifies;
      if (isAdopted) {
        eventQualifies = true;
      } else {
        if (ev.type === 'sale') eventQualifies = true;
        else if (ev.type === 'service') {
          var evFirst = String(ev.firstName||'').trim().toLowerCase();
          var ownerFirst = String(displayFirst||'').trim().toLowerCase();
          eventQualifies = evFirst && ownerFirst &&
            (evFirst === ownerFirst ||
             (evFirst.length >= 2 && ownerFirst.length >= 2 &&
              (evFirst.indexOf(ownerFirst) === 0 || ownerFirst.indexOf(evFirst) === 0)));
        } else {
          eventQualifies = false;
        }
      }
      if (!eventQualifies) return;
      // Sale events get priority weighting — same date, sale wins over service
      var weight = ev.type === 'sale' ? 1 : 0;
      var rank = ev.date.getTime() * 10 + weight;
      if (slot === 'cell' && (!bestCellDate || rank > bestCellDate)) { bestCell = value; bestCellDate = rank; bestCellSource = ev.type; }
      else if (slot === 'home' && (!bestHomeDate || rank > bestHomeDate)) { bestHome = value; bestHomeDate = rank; bestHomeSource = ev.type; }
      else if (slot === 'work' && (!bestWorkDate || rank > bestWorkDate)) { bestWork = value; bestWorkDate = rank; bestWorkSource = ev.type; }
    }

    allEvents.forEach(function(ev){
      consider(ev, 'cell', ev.phoneCell);
      consider(ev, 'home', ev.phoneHome);
      consider(ev, 'work', ev.phoneWork);
    });

    // Best email — most-recent qualifying event with any email
    var bestEmail = '';
    var bestEmailDate = null;
    allEvents.forEach(function(ev){
      var emList = ev.emails || [];
      if (!emList.length) return;
      var qualifies;
      if (isAdopted) qualifies = true;
      else if (ev.type === 'sale') qualifies = true;
      else if (ev.type === 'service') {
        var evFirst = String(ev.firstName||'').trim().toLowerCase();
        var ownerFirst = String(displayFirst||'').trim().toLowerCase();
        qualifies = evFirst && ownerFirst &&
          (evFirst === ownerFirst ||
           (evFirst.length >= 2 && ownerFirst.length >= 2 &&
            (evFirst.indexOf(ownerFirst) === 0 || ownerFirst.indexOf(evFirst) === 0)));
      } else qualifies = false;
      if (!qualifies) return;
      var weight = ev.type === 'sale' ? 1 : 0;
      var rank = ev.date.getTime() * 10 + weight;
      if (!bestEmailDate || rank > bestEmailDate) {
        bestEmail = emList[0];
        bestEmailDate = rank;
      }
    });

    // Pick the displayed buyer name: most recent SALE wins.
    // For Adopted (no sales ever), fall back to most recent service event.
    var displayFirst = '';
    var displayLast  = '';
    if (mostRecentSaleName) {
      displayFirst = mostRecentSaleName.first;
      displayLast  = mostRecentSaleName.last;
    } else if (mostRecentServiceName) {
      displayFirst = mostRecentServiceName.first;
      displayLast  = mostRecentServiceName.last;
    }

    // Detect "lost from network": customer bought a VIN here, but evidence suggests
    // it's no longer in their possession AND not in our inventory.
    // Conditions:
    //   - Customer bought VIN X
    //   - No trade-out event seen for VIN X (we didn't take it back)
    //   - Service activity on VIN X stopped >18 months ago (default)
    //   - Customer has no service activity on ANY vehicle in last 12 months
    //     (so it's not just "they have a new car, this one's a spare")
    var salesByDate = allEvents.filter(function(e){ return e.type === 'sale'; })
                                .sort(function(a,b){ return a.date - b.date; });

    salesByDate.forEach(function(saleEv){
      var bought = saleEv.vin;
      // Already accounted for in trade chain?
      if (previouslyOwned.indexOf(bought) !== -1) return;
      if (lostFromNetwork.indexOf(bought) !== -1) return;
      if (currentlyOwns.indexOf(bought) === -1) return;

      // Last service on THIS VIN
      var lastSvcOnVin = null;
      allEvents.forEach(function(e){
        if (e.type === 'service' && e.vin === bought) {
          if (!lastSvcOnVin || e.date > lastSvcOnVin) lastSvcOnVin = e.date;
        }
      });

      // No service ever on this VIN AND sale was >18 months ago → lost
      // OR last service on this VIN was >18 months ago AND no recent service on any vehicle → lost
      var saleAge = Math.floor((now - saleEv.date) / 86400000);
      var svcAge = lastSvcOnVin ? Math.floor((now - lastSvcOnVin) / 86400000) : null;
      var customerRecentSvc = lastServiceDate ? Math.floor((now - lastServiceDate) / 86400000) : null;

      var isLost = false;
      if (!lastSvcOnVin && saleAge > SERVICE_GAP_DAYS) {
        // Bought, never serviced here, gone
        isLost = true;
      } else if (svcAge !== null && svcAge > SERVICE_GAP_DAYS) {
        // Service stopped on this VIN long ago. If they're servicing OTHER vehicles
        // recently, this specific VIN is gone but they're still a customer.
        // If they have no recent service at all, both this VIN AND the customer are gone.
        isLost = true;
      }

      if (isLost) {
        lostFromNetwork.push(bought);
        var ci = currentlyOwns.indexOf(bought);
        if (ci !== -1) currentlyOwns.splice(ci, 1);
      }
    });

    // Surface the lost-from-network VINs into the per-VIN flag map (built later
    // below). We can't write to vinFlags here yet — it's declared after this block.
    // The flag will be set when vinFlags is created.

    // Days since last interaction
    var daysSinceLast = lastActivityDate
      ? Math.floor((now - lastActivityDate) / 86400000)
      : null;

    // Time bucket — brand-neutral, 18-month "defection cliff" at default settings
    var timeBucket;
    if (daysSinceLast === null) timeBucket = 'Unknown';
    else if (daysSinceLast <= 180) timeBucket = 'Active';
    else if (daysSinceLast <= 365) timeBucket = 'Active-Watch';
    else if (daysSinceLast <= DEFECTION_DAYS) timeBucket = 'At Risk';
    else if (daysSinceLast <= LONG_GONE_DAYS) timeBucket = 'High Defection Risk';
    else timeBucket = 'Long Gone';

    // Sales pattern
    // ── Customer category — origin + repeat pattern (Option C framing) ────────
    // Home-grown — Repeat:  bought here AND multiple sales
    // Home-grown — First-time:  bought here, single sale
    // Adopted: never bought here, only services with us
    var customerCategory;
    if (numSales >= 2) customerCategory = 'Home-grown — Repeat';
    else if (numSales === 1) customerCategory = 'Home-grown — First-time';
    else customerCategory = 'Adopted';
    // Keep legacy salesPattern for any code still referencing it
    var salesPattern = customerCategory;

    // ── Lease-suggestive flags ───────────────────────────────────────────────
    // hasServiceGapAfterSale: did service activity stop on a sold VIN well
    // before the data file ends? (suggests vehicle left their possession)
    var hasServiceGapAfterSale = false;
    var hasReplacementSale = numSales >= 2;
    var likelyLeaseReturn = false;

    // Per-VIN flag map: keyed by VIN, so target rows can pick up the
    // correct flag for THEIR specific vehicle (not just "customer has any...")
    var vinFlags = {};
    function setVinFlag(vin, flag, value) {
      if (!vin) return;
      if (!vinFlags[vin]) vinFlags[vin] = {};
      vinFlags[vin][flag] = value;
    }

    // For each sale, find last service date on THAT VIN and check the gap
    var salesEventsList = allEvents.filter(function(e){ return e.type === 'sale'; });
    salesEventsList.forEach(function(saleEv){
      var lastSvcOnVin = null;
      allEvents.forEach(function(e){
        if (e.type === 'service' && e.vin === saleEv.vin && e.date >= saleEv.date) {
          if (!lastSvcOnVin || e.date > lastSvcOnVin) lastSvcOnVin = e.date;
        }
      });
      if (lastSvcOnVin) {
        var daysSinceLastSvcOnVin = Math.floor((now - lastSvcOnVin) / 86400000);
        if (daysSinceLastSvcOnVin > SERVICE_GAP_DAYS) {
          hasServiceGapAfterSale = true;
          setVinFlag(saleEv.vin, 'serviceGap', true);
          // Check for lease-return pattern: gap is roughly 30-40 months from sale
          var monthsFromSaleToLastSvc = Math.floor((lastSvcOnVin - saleEv.date) / (86400000 * 30));
          if (hasReplacementSale && monthsFromSaleToLastSvc >= 30 && monthsFromSaleToLastSvc <= 42) {
            likelyLeaseReturn = true;
            setVinFlag(saleEv.vin, 'likelyLease', true);
          }
        }
      }
    });

    // Direct deal-type signal (overrides inference when available)
    var hasLeaseDealType = false;
    if (hasDealTypeColumn) {
      salesEventsList.forEach(function(e){
        var dt = (e.dealType||'').toLowerCase();
        if (dt.indexOf('lease') !== -1) {
          hasLeaseDealType = true;
          setVinFlag(e.vin, 'confirmedLease', true);
        }
      });
    }

    // Per-VIN post-trade-owner flag — derived from segment.postTradeOwner
    segs.forEach(function(seg){
      if (seg.postTradeOwner) setVinFlag(seg.vin, 'postTradeOwner', true);
    });

    // Per-VIN stopped-servicing flag — derived from lostFromNetwork list
    lostFromNetwork.forEach(function(vin){ setVinFlag(vin, 'stoppedServicing', true); });

    // Merge confidence: clusters that share VIN history = Merged; clusters built purely
    // from phone/email match across non-overlapping VINs = Possible Duplicate
    // Detect by: if any TWO segments in this cluster share VINs OR are on adjacent VINs
    // via a trade event, it's Merged. Otherwise it's Possible Duplicate.
    var uniqueVins = {};
    segs.forEach(function(s){ uniqueVins[s.vin] = true; });
    var hasVinOverlap = false;
    if (Object.keys(uniqueVins).length === 1) {
      hasVinOverlap = true; // single VIN, trivially overlapping
    } else if (segs.length === 1) {
      hasVinOverlap = true; // single segment, no clustering needed
    } else {
      // Multi-VIN multi-segment cluster — check for trade-event bridges
      // A trade-out event on VIN X bridges to whatever VIN was bought (tradeBuyerVin)
      segs.forEach(function(s){
        s.events.forEach(function(e){
          if (e.type === 'trade-out' && uniqueVins[e.tradeBuyerVin]) {
            hasVinOverlap = true;
          }
        });
      });
    }

    var mergeConfidence = (segs.length === 1 || hasVinOverlap) ? 'Merged' : 'Possible Duplicate';
    var duplicateReason = '';
    if (mergeConfidence === 'Possible Duplicate') {
      duplicateReason = 'Linked by PII (phone/email) across non-overlapping VINs — verify before merging';
      possibleDuplicatePairs++;
    }

    // Pre-resolve vehicle info for each VIN this customer owns/owned, including
    // the per-VIN sale date and last-service date. The target-row date filters
    // (Last Sale / Last Service) need to match THIS vehicle's dates, not the
    // customer's most-recent across all vehicles.
    function vinInfoLine(v) {
      var info = vehicleInfoByVin[v];
      var saleDateForVin = null;
      var lastSvcForVin  = null;
      allEvents.forEach(function(e){
        if (e.vin !== v) return;
        if (e.type === 'sale') {
          if (!saleDateForVin || e.date > saleDateForVin) saleDateForVin = e.date;
        }
        if (e.type === 'service') {
          if (!lastSvcForVin || e.date > lastSvcForVin) lastSvcForVin = e.date;
        }
      });
      if (!info) {
        return { vin: v, year:'', make:'', model:'', label: v,
                 saleDate: saleDateForVin, lastServiceDate: lastSvcForVin };
      }
      var label = [info.year, info.make, info.model].filter(function(x){ return x; }).join(' ').trim();
      return { vin: v, year: info.year, make: info.make, model: info.model, label: label,
               saleDate: saleDateForVin, lastServiceDate: lastSvcForVin };
    }
    var currentVehicles    = currentlyOwns.map(vinInfoLine);
    var previousVehicles   = previouslyOwned.map(vinInfoLine);
    var lostVehicles       = lostFromNetwork.map(vinInfoLine);

    customers.push({
      customerKey: rootKey,
      mergeConfidence: mergeConfidence,
      duplicateReason: duplicateReason,
      firstName: displayFirst,
      lastName:  displayLast,
      allFirstNames: firstNames,
      allLastNames:  lastNames,
      phones: phones,
      emails: emails,
      cellPhone: bestCell,
      homePhone: bestHome,
      workPhone: bestWork,
      primaryEmail: bestEmail,
      cellPhoneSource: bestCellSource,
      homePhoneSource: bestHomeSource,
      workPhoneSource: bestWorkSource,
      saleTimePhones: saleTimePhonesAll,
      saleTimeEmails: saleTimeEmailsAll,
      mostRecentSalePhones: mostRecentSaleSegment ? mostRecentSaleSegment.phones : [],
      mostRecentSaleEmails: mostRecentSaleSegment ? mostRecentSaleSegment.emails : [],
      driftedPhones: driftedPhones,
      driftedEmails: driftedEmails,
      hasPhoneDrift: hasPhoneDrift,
      hasEmailDrift: hasEmailDrift,
      currentlyOwns: currentlyOwns,
      previouslyOwned: previouslyOwned,
      lostFromNetwork: lostFromNetwork,
      currentVehicles: currentVehicles,
      previousVehicles: previousVehicles,
      lostVehicles: lostVehicles,
      vinFlags: vinFlags,                                       // per-VIN flag map for target-row enrichment
      isPostTradeOwner: isPostTradeOwner,
      numSales: numSales,
      numServices: numServices,
      firstActivityDate: firstActivityDate,
      lastActivityDate:  lastActivityDate,
      lastSaleDate: lastSaleDate,
      lastServiceDate: lastServiceDate,
      daysSinceLastInteraction: daysSinceLast,
      timeBucket: timeBucket,
      salesPattern: salesPattern,
      customerCategory: customerCategory,
      hasServiceGapAfterSale: hasServiceGapAfterSale,
      hasReplacementSale: hasReplacementSale,
      likelyLeaseReturn: likelyLeaseReturn,
      hasLeaseDealType: hasLeaseDealType,
      events: allEvents.sort(function(a,b){ return a.date - b.date; })
    });
  });

  // ── Step 7: Stats ─────────────────────────────────────────────────────────
  var stats = {
    totalSalesRows:    salesRows   ? salesRows.length   : 0,
    totalServiceRows:  serviceRows ? serviceRows.length : 0,
    uniqueSoldVins:    soldVinSet.size,
    uniqueServiceVins: 0,
    totalEvents: events.length,
    unparseableDates: unparseableDates,
    internalVehiclesDetected: internalVins.size,
    internalVehicleVins: Array.from(internalVins).slice(0, 10),
    totalCustomers: customers.length,
    possibleDuplicatePairs: possibleDuplicatePairs,
    timeBucketCounts: {},
    salesPatternCounts: {},
    mergeConfidenceCounts: {},
    postTradeOwnerCount: 0,
    lostFromNetworkCount: 0,
    elapsedMs: 0  // filled in below
  };

  // Count unique service VINs from raw service rows
  if (serviceRows && serviceHeaders) {
    var svVinCol = findCol(serviceHeaders, ['vin']);
    var svSet = new Set();
    if (svVinCol) {
      serviceRows.forEach(function(r){
        var v = normLoyaltyVin(r[svVinCol]);
        if (v.length === 17) svSet.add(v);
      });
    }
    stats.uniqueServiceVins = svSet.size;
  }

  // Cross-file overlap stats
  if (salesRows && serviceRows) {
    var tradeVinSet = new Set();
    events.forEach(function(e){
      if (e.type === 'sale' && e.tradeVin) tradeVinSet.add(e.tradeVin);
    });
    var serviceVinSet = new Set();
    Object.keys(eventsByVin).forEach(function(v){
      eventsByVin[v].forEach(function(e){
        if (e.type === 'service') serviceVinSet.add(v);
      });
    });
    var soldAndServiced = 0, tradedAndServiced = 0;
    soldVinSet.forEach(function(v){ if (serviceVinSet.has(v)) soldAndServiced++; });
    tradeVinSet.forEach(function(v){ if (serviceVinSet.has(v)) tradedAndServiced++; });
    stats.soldAndServiced = soldAndServiced;
    stats.tradedAndLaterServiced = tradedAndServiced;
    stats.uniqueTradeVins = tradeVinSet.size;
  }

  customers.forEach(function(c){
    stats.timeBucketCounts[c.timeBucket]      = (stats.timeBucketCounts[c.timeBucket]||0) + 1;
    stats.salesPatternCounts[c.salesPattern]   = (stats.salesPatternCounts[c.salesPattern]||0) + 1;
    stats.customerCategoryCounts = stats.customerCategoryCounts || {};
    stats.customerCategoryCounts[c.customerCategory] = (stats.customerCategoryCounts[c.customerCategory]||0) + 1;
    stats.mergeConfidenceCounts[c.mergeConfidence] = (stats.mergeConfidenceCounts[c.mergeConfidence]||0) + 1;
    if (c.isPostTradeOwner) stats.postTradeOwnerCount++;
    if (c.lostFromNetwork.length) stats.lostFromNetworkCount++;
    if (c.hasServiceGapAfterSale) stats.serviceGapCount = (stats.serviceGapCount||0) + 1;
    if (c.likelyLeaseReturn) stats.likelyLeaseReturnCount = (stats.likelyLeaseReturnCount||0) + 1;
    if (c.hasLeaseDealType) stats.confirmedLeaseCount = (stats.confirmedLeaseCount||0) + 1;
  });

  stats.hasDealTypeColumn = hasDealTypeColumn;
  stats.thresholds = {
    defectionThresholdDays: DEFECTION_DAYS,
    longGoneThresholdDays:  LONG_GONE_DAYS,
    serviceGapThresholdDays: SERVICE_GAP_DAYS
  };

  stats.elapsedMs = Date.now() - t0;

  // Surface engine v2 filtering stats — counts of events skipped/reclassified
  // by the dealer-custody and post-trade rules. Useful for QA/sanity-checking.
  if (typeof window !== 'undefined' && window._loyaltyEngineStats) {
    stats.engineV2 = window._loyaltyEngineStats;
  }

  return {
    customers: customers,
    stats: stats,
    debug: { segments: segments.length, clusters: Object.keys(clusters).length }
  };
}

// Expose for browser console testing in Phase 1A:
//   buildLoyaltyTimeline(salesRows, salesHeaders, serviceRows, serviceHeaders)


// ─────────────────────────────────────────────────────────────────────────────
//  LOYALTY TIMELINE — RUNNER + UI
// ─────────────────────────────────────────────────────────────────────────────

