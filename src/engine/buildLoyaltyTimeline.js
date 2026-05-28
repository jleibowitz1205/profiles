// ===========================================================================
//  PROFILES — Engine module: main orchestrator (buildLoyaltyTimeline)
//  Source: Apps Script v2 (Convergence List Hygiene Tool), verbatim.
//
//  Pipeline (per ARCHITECTURE.md):
//    Stage 1: buildEventStream      — CSV → events keyed by VIN
//    Stage 2: detectInternalVehicles — drop loaners/shop cars
//    Stage 3: buildVinSegments      — apply the 7 rules per VIN
//    Stage 4: Buyer-of-Record Gate + Union-Find clustering
//    Stage 5: customer record assembly (vinFlags, drift, buckets)
//
//  Port note: split this file into clustering.ts + customer.ts + index.ts
//  per PORTING_GUIDE.md when porting to TypeScript.
// ===========================================================================

function buildLoyaltyTimeline(salesRows, salesHeaders, serviceRows, serviceHeaders, opts) {
  var t0 = Date.now();
  opts = opts || {};
  var DEFECTION_DAYS   = opts.defectionThresholdDays  || 540;   // 18 months
  var LONG_GONE_DAYS   = opts.longGoneThresholdDays   || 1096;  // 36 months
  var SERVICE_GAP_DAYS = opts.serviceGapThresholdDays || 540;   // 18 months

  // ── Step 1: Build event stream ────────────────────────────────────────────
  var streamResult = buildEventStream(salesRows, salesHeaders, serviceRows, serviceHeaders);
  var events = streamResult.events;
  var unparseableDates = streamResult.unparseableDates;
  var hasDealTypeColumn = streamResult.hasDealTypeColumn;

  // ── Step 2: Group events by VIN ───────────────────────────────────────────
  var eventsByVin = {};
  events.forEach(function(e) {
    if (!eventsByVin[e.vin]) eventsByVin[e.vin] = [];
    eventsByVin[e.vin].push(e);
  });

  // ── Step 3: Detect internal/dealer vehicles ───────────────────────────────
  var soldVinSet = new Set();
  events.forEach(function(e) { if (e.type === 'sale') soldVinSet.add(e.vin); });
  var internalVins = detectInternalVehicles(eventsByVin, soldVinSet);
  if (internalVins.size > 0) {
    internalVins.forEach(function(vin) { delete eventsByVin[vin]; });
  }

  // ── Step 4: Build VIN segments (one segment = one owner's tenure on a VIN) ──
  var segments = buildVinSegments(eventsByVin);

  // ── Step 5: Cluster segments into customers ───────────────────────────────
  var byPhone = {};
  var byEmail = {};

  segments.forEach(function(seg, i) {
    seg.ownerSnapshot.phones.forEach(function(p) {
      if (isJunkPhone(p)) return;
      if (!byPhone[p]) byPhone[p] = [];
      byPhone[p].push(i);
    });
    seg.ownerSnapshot.emails.forEach(function(e) {
      if (isJunkEmail(e)) return;
      if (!byEmail[e]) byEmail[e] = [];
      byEmail[e].push(i);
    });
  });

  // High-cardinality rejection: any phone/email that touches > N segments is
  // not a real customer identifier (dealer line, default value, salesperson
  // contact). Drop it from PII clustering entirely.
  var HIGH_CARDINALITY_THRESHOLD = 25;
  var rejectedPhones = [];
  var rejectedEmails = [];
  Object.keys(byPhone).forEach(function(p) {
    if (byPhone[p].length > HIGH_CARDINALITY_THRESHOLD) {
      rejectedPhones.push({ phone: p, segments: byPhone[p].length });
      delete byPhone[p];
    }
  });
  Object.keys(byEmail).forEach(function(e) {
    if (byEmail[e].length > HIGH_CARDINALITY_THRESHOLD) {
      rejectedEmails.push({ email: e, segments: byEmail[e].length });
      delete byEmail[e];
    }
  });

  // ── BUYER-OF-RECORD GATE ─────────────────────────────────────────────────
  // Shared PII can only merge segments when there is independent evidence
  // they belong to the same person: shared VIN, trade-link chain, or close
  // name match. See ARCHITECTURE.md for the full rationale.
  var segIdxByVin = {};
  var tradeOutSegByBuyerVin = {};
  var saleSegByOwnVin = {};
  segments.forEach(function(seg, i) {
    if (!segIdxByVin[seg.vin]) segIdxByVin[seg.vin] = [];
    segIdxByVin[seg.vin].push(i);
    if (seg.tradedOut) {
      seg.events.forEach(function(e) {
        if (e.type === 'trade-out' && e.tradeBuyerVin) {
          if (!tradeOutSegByBuyerVin[e.tradeBuyerVin]) tradeOutSegByBuyerVin[e.tradeBuyerVin] = [];
          tradeOutSegByBuyerVin[e.tradeBuyerVin].push(i);
        }
      });
    }
    if (!seg.serviceOnly) {
      if (!saleSegByOwnVin[seg.vin]) saleSegByOwnVin[seg.vin] = [];
      saleSegByOwnVin[seg.vin].push(i);
    }
  });

  function firstLastKey(first, last) {
    var f = String(first || '').trim().toLowerCase();
    var l = String(last  || '').trim().toLowerCase();
    if (!f && !l) return '';
    if (f.length >= 3) f = f.slice(0, 3);
    var lp = l.split(/\s+/);
    var lw = lp.length ? lp[lp.length - 1] : '';
    return f + '|' + lw;
  }
  var tradeLinkedPairs = {};
  function markPairLinked(i, j) {
    if (i === j) return;
    var a = Math.min(i, j), b = Math.max(i, j);
    tradeLinkedPairs[a + ':' + b] = true;
  }
  Object.keys(tradeOutSegByBuyerVin).forEach(function(buyerVin) {
    var traderSegs = tradeOutSegByBuyerVin[buyerVin];
    var buyerSegs  = saleSegByOwnVin[buyerVin] || [];
    traderSegs.forEach(function(ti) {
      var traderSeg = segments[ti];
      var tradeEvent = null;
      for (var k = 0; k < traderSeg.events.length; k++) {
        if (traderSeg.events[k].type === 'trade-out') { tradeEvent = traderSeg.events[k]; break; }
      }
      if (!tradeEvent) return;
      var buyerKey = firstLastKey(tradeEvent.firstName, tradeEvent.lastName);
      var ownerKey = firstLastKey(traderSeg.ownerSnapshot.firstName, traderSeg.ownerSnapshot.lastName);
      if (buyerKey && ownerKey && buyerKey !== ownerKey) {
        return; // cross-household trade — do not bridge
      }
      buyerSegs.forEach(function(bi) { markPairLinked(ti, bi); });
    });
  });

  function lastWord(name) {
    var s = String(name || '').trim().toLowerCase();
    if (!s) return '';
    var parts = s.split(/\s+/);
    return parts[parts.length - 1];
  }
  var segLastWord = segments.map(function(s) { return lastWord(s.ownerSnapshot.lastName); });
  var segFirstPrefix = segments.map(function(s) {
    var f = String(s.ownerSnapshot.firstName || '').trim().toLowerCase();
    return f.length >= 3 ? f.slice(0, 3) : f;
  });

  function pairAllowed(i, j) {
    if (i === j) return true;
    if (segments[i].vin === segments[j].vin) return true;
    var a = Math.min(i, j), b = Math.max(i, j);
    if (tradeLinkedPairs[a + ':' + b]) return true;
    var fp1 = segFirstPrefix[i], fp2 = segFirstPrefix[j];
    var lw1 = segLastWord[i],    lw2 = segLastWord[j];
    if (fp1 && fp2 && fp1 === fp2 && lw1 && lw2 && lw1 === lw2) return true;
    return false;
  }

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

  // Group segments into clusters
  var clusters = {};
  segments.forEach(function(seg, i) {
    var root = uf.find(i);
    if (!clusters[root]) clusters[root] = [];
    clusters[root].push(i);
  });

  // ── Step 6: Convert clusters → customer records ──────────────────────────
  var now = new Date();
  var customers = [];
  var possibleDuplicatePairs = 0;

  // Per-VIN vehicle-info lookup — sale wins over service, most recent wins.
  var vehicleInfoByVin = {};
  events.forEach(function(e) {
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

  Object.keys(clusters).forEach(function(rootKey) {
    var segIdxs = clusters[rootKey];
    var segs = segIdxs.map(function(i) { return segments[i]; });

    var firstNames = [];
    var lastNames = [];
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

    var mostRecentSaleName = null;
    var mostRecentServiceName = null;
    var mostRecentServiceOnlyVin = null;
    var saleTimePhonesAll = [];
    var saleTimeEmailsAll = [];
    var mostRecentSaleSegment = null;

    segs.forEach(function(seg) {
      if (seg.ownerSnapshot.firstName && firstNames.indexOf(seg.ownerSnapshot.firstName) === -1) firstNames.push(seg.ownerSnapshot.firstName);
      if (seg.ownerSnapshot.lastName  && lastNames.indexOf(seg.ownerSnapshot.lastName)  === -1) lastNames.push(seg.ownerSnapshot.lastName);
      seg.ownerSnapshot.phones.forEach(function(p) { if (phones.indexOf(p) === -1) phones.push(p); });
      seg.ownerSnapshot.emails.forEach(function(e) { if (emails.indexOf(e) === -1) emails.push(e); });
      if (seg.postTradeOwner) isPostTradeOwner = true;

      if (!seg.serviceOnly && seg.saleTimePhones) {
        seg.saleTimePhones.forEach(function(p) {
          if (saleTimePhonesAll.indexOf(p) === -1) saleTimePhonesAll.push(p);
        });
        seg.saleTimeEmails.forEach(function(em) {
          if (saleTimeEmailsAll.indexOf(em) === -1) saleTimeEmailsAll.push(em);
        });
        if (!mostRecentSaleSegment || seg.startDate > mostRecentSaleSegment.date) {
          mostRecentSaleSegment = {
            date:   seg.startDate,
            phones: (seg.saleTimePhones || []).slice(),
            emails: (seg.saleTimeEmails || []).slice()
          };
        }
      }

      seg.events.forEach(function(e) {
        allEvents.push(e);
        if (e.type === 'sale') {
          numSales++;
          if (!lastSaleDate || e.date > lastSaleDate) lastSaleDate = e.date;
          if (!mostRecentSaleName || e.date > mostRecentSaleName.date) {
            mostRecentSaleName = { date: e.date, first: e.firstName || '', last: e.lastName || '' };
          }
        } else if (e.type === 'service') {
          numServices++;
          if (!lastServiceDate || e.date > lastServiceDate) lastServiceDate = e.date;
          if (!mostRecentServiceName || e.date > mostRecentServiceName.date) {
            mostRecentServiceName = { date: e.date, first: e.firstName || '', last: e.lastName || '' };
          }
        }
        if (!firstActivityDate || e.date < firstActivityDate) firstActivityDate = e.date;
        if (!lastActivityDate  || e.date > lastActivityDate)  lastActivityDate  = e.date;
      });

      // VIN ownership accounting
      if (seg.tradedOut) {
        if (previouslyOwned.indexOf(seg.vin) === -1) previouslyOwned.push(seg.vin);
      } else if (seg.serviceOnly) {
        if (!mostRecentServiceOnlyVin || seg.endDate > mostRecentServiceOnlyVin.date) {
          mostRecentServiceOnlyVin = { vin: seg.vin, date: seg.endDate };
        }
      } else {
        if (currentlyOwns.indexOf(seg.vin) === -1) currentlyOwns.push(seg.vin);
      }
    });

    // Adopted-customer current-vehicle fallback
    if (currentlyOwns.length === 0 && mostRecentServiceOnlyVin) {
      currentlyOwns.push(mostRecentServiceOnlyVin.vin);
    }

    // Phone / email drift detection (vs the most-recent sale segment)
    var hasPhoneDrift = false;
    var hasEmailDrift = false;
    var driftedPhones = [];
    var driftedEmails = [];
    if (mostRecentSaleSegment) {
      phones.forEach(function(p) {
        if (mostRecentSaleSegment.phones.indexOf(p) === -1 && saleTimePhonesAll.indexOf(p) === -1) {
          driftedPhones.push(p);
          hasPhoneDrift = true;
        }
      });
      emails.forEach(function(em) {
        if (mostRecentSaleSegment.emails.indexOf(em) === -1 && saleTimeEmailsAll.indexOf(em) === -1) {
          driftedEmails.push(em);
          hasEmailDrift = true;
        }
      });
    }

    // Pick displayed name: most recent SALE wins, fallback to most recent SERVICE for Adopted
    var displayFirst = '';
    var displayLast = '';
    if (mostRecentSaleName) {
      displayFirst = mostRecentSaleName.first;
      displayLast  = mostRecentSaleName.last;
    } else if (mostRecentServiceName) {
      displayFirst = mostRecentServiceName.first;
      displayLast  = mostRecentServiceName.last;
    }

    // Customer category
    var customerCategory;
    if (numSales >= 2) customerCategory = 'Home-grown — Repeat';
    else if (numSales === 1) customerCategory = 'Home-grown — First-time';
    else customerCategory = 'Adopted';
    var salesPattern = customerCategory;

    // Resolve Cell / Home / Work via name-matched event ranking
    var bestCell = '', bestHome = '', bestWork = '';
    var bestCellDate = null, bestHomeDate = null, bestWorkDate = null;
    var bestCellSource = '', bestHomeSource = '', bestWorkSource = '';
    var isAdopted = customerCategory === 'Adopted';

    function consider(ev, slot, value) {
      if (!value) return;
      var eventQualifies;
      if (isAdopted) {
        eventQualifies = true;
      } else {
        if (ev.type === 'sale') eventQualifies = true;
        else if (ev.type === 'service') {
          var evFirst = String(ev.firstName || '').trim().toLowerCase();
          var ownerFirst = String(displayFirst || '').trim().toLowerCase();
          eventQualifies = evFirst && ownerFirst &&
            (evFirst === ownerFirst ||
             (evFirst.length >= 2 && ownerFirst.length >= 2 &&
              (evFirst.indexOf(ownerFirst) === 0 || ownerFirst.indexOf(evFirst) === 0)));
        } else {
          eventQualifies = false;
        }
      }
      if (!eventQualifies) return;
      var weight = ev.type === 'sale' ? 1 : 0;
      var rank = ev.date.getTime() * 10 + weight;
      if (slot === 'cell' && (!bestCellDate || rank > bestCellDate)) { bestCell = value; bestCellDate = rank; bestCellSource = ev.type; }
      else if (slot === 'home' && (!bestHomeDate || rank > bestHomeDate)) { bestHome = value; bestHomeDate = rank; bestHomeSource = ev.type; }
      else if (slot === 'work' && (!bestWorkDate || rank > bestWorkDate)) { bestWork = value; bestWorkDate = rank; bestWorkSource = ev.type; }
    }

    allEvents.forEach(function(ev) {
      consider(ev, 'cell', ev.phoneCell);
      consider(ev, 'home', ev.phoneHome);
      consider(ev, 'work', ev.phoneWork);
    });

    var bestEmail = '';
    var bestEmailDate = null;
    allEvents.forEach(function(ev) {
      var emList = ev.emails || [];
      if (!emList.length) return;
      var qualifies;
      if (isAdopted) qualifies = true;
      else if (ev.type === 'sale') qualifies = true;
      else if (ev.type === 'service') {
        var evFirst = String(ev.firstName || '').trim().toLowerCase();
        var ownerFirst = String(displayFirst || '').trim().toLowerCase();
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

    // Lost-from-network detection
    var salesByDate = allEvents.filter(function(e) { return e.type === 'sale'; })
                               .sort(function(a, b) { return a.date - b.date; });
    salesByDate.forEach(function(saleEv) {
      var bought = saleEv.vin;
      if (previouslyOwned.indexOf(bought) !== -1) return;
      if (lostFromNetwork.indexOf(bought) !== -1) return;
      if (currentlyOwns.indexOf(bought) === -1) return;

      var lastSvcOnVin = null;
      allEvents.forEach(function(e) {
        if (e.type === 'service' && e.vin === bought) {
          if (!lastSvcOnVin || e.date > lastSvcOnVin) lastSvcOnVin = e.date;
        }
      });
      var saleAge = Math.floor((now - saleEv.date) / 86400000);
      var svcAge = lastSvcOnVin ? Math.floor((now - lastSvcOnVin) / 86400000) : null;

      var isLost = false;
      if (!lastSvcOnVin && saleAge > SERVICE_GAP_DAYS) {
        isLost = true;
      } else if (svcAge !== null && svcAge > SERVICE_GAP_DAYS) {
        isLost = true;
      }
      if (isLost) {
        lostFromNetwork.push(bought);
        var ci = currentlyOwns.indexOf(bought);
        if (ci !== -1) currentlyOwns.splice(ci, 1);
      }
    });

    var daysSinceLast = lastActivityDate
      ? Math.floor((now - lastActivityDate) / 86400000)
      : null;
    var timeBucket = classifyBucket(daysSinceLast);

    // Lease-suggestive flags + per-VIN flag map
    var hasServiceGapAfterSale = false;
    var hasReplacementSale = numSales >= 2;
    var likelyLeaseReturn = false;
    var vinFlags = {};
    function setVinFlag(vin, flag, value) {
      if (!vin) return;
      if (!vinFlags[vin]) vinFlags[vin] = {};
      vinFlags[vin][flag] = value;
    }

    var salesEventsList = allEvents.filter(function(e) { return e.type === 'sale'; });
    salesEventsList.forEach(function(saleEv) {
      var lastSvcOnVin = null;
      allEvents.forEach(function(e) {
        if (e.type === 'service' && e.vin === saleEv.vin && e.date >= saleEv.date) {
          if (!lastSvcOnVin || e.date > lastSvcOnVin) lastSvcOnVin = e.date;
        }
      });
      if (lastSvcOnVin) {
        var daysSinceLastSvcOnVin = Math.floor((now - lastSvcOnVin) / 86400000);
        if (daysSinceLastSvcOnVin > SERVICE_GAP_DAYS) {
          hasServiceGapAfterSale = true;
          setVinFlag(saleEv.vin, 'serviceGap', true);
          var monthsFromSaleToLastSvc = Math.floor((lastSvcOnVin - saleEv.date) / (86400000 * 30));
          if (hasReplacementSale && monthsFromSaleToLastSvc >= 30 && monthsFromSaleToLastSvc <= 42) {
            likelyLeaseReturn = true;
            setVinFlag(saleEv.vin, 'likelyLease', true);
          }
        }
      }
    });

    var hasLeaseDealType = false;
    if (hasDealTypeColumn) {
      salesEventsList.forEach(function(e) {
        var dt = (e.dealType || '').toLowerCase();
        if (dt.indexOf('lease') !== -1) {
          hasLeaseDealType = true;
          setVinFlag(e.vin, 'confirmedLease', true);
        }
      });
    }

    segs.forEach(function(seg) {
      if (seg.postTradeOwner) setVinFlag(seg.vin, 'postTradeOwner', true);
    });
    lostFromNetwork.forEach(function(vin) { setVinFlag(vin, 'stoppedServicing', true); });

    // Merge confidence
    var uniqueVins = {};
    segs.forEach(function(s) { uniqueVins[s.vin] = true; });
    var hasVinOverlap = false;
    if (Object.keys(uniqueVins).length === 1) hasVinOverlap = true;
    else if (segs.length === 1) hasVinOverlap = true;
    else {
      segs.forEach(function(s) {
        s.events.forEach(function(e) {
          if (e.type === 'trade-out' && uniqueVins[e.tradeBuyerVin]) hasVinOverlap = true;
        });
      });
    }
    var mergeConfidence = (segs.length === 1 || hasVinOverlap) ? 'Merged' : 'Possible Duplicate';
    var duplicateReason = '';
    if (mergeConfidence === 'Possible Duplicate') {
      duplicateReason = 'Linked by PII (phone/email) across non-overlapping VINs — verify before merging';
      possibleDuplicatePairs++;
    }

    function vinInfoLine(v) {
      var info = vehicleInfoByVin[v];
      var saleDateForVin = null;
      var lastSvcForVin  = null;
      allEvents.forEach(function(e) {
        if (e.vin !== v) return;
        if (e.type === 'sale') {
          if (!saleDateForVin || e.date > saleDateForVin) saleDateForVin = e.date;
        }
        if (e.type === 'service') {
          if (!lastSvcForVin || e.date > lastSvcForVin) lastSvcForVin = e.date;
        }
      });
      if (!info) {
        return { vin: v, year: '', make: '', model: '', label: v, saleDate: saleDateForVin, lastServiceDate: lastSvcForVin };
      }
      var label = [info.year, info.make, info.model].filter(function(x) { return x; }).join(' ').trim();
      return { vin: v, year: info.year, make: info.make, model: info.model, label: label, saleDate: saleDateForVin, lastServiceDate: lastSvcForVin };
    }
    var currentVehicles  = currentlyOwns.map(vinInfoLine);
    var previousVehicles = previouslyOwned.map(vinInfoLine);
    var lostVehicles     = lostFromNetwork.map(vinInfoLine);

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
      vinFlags: vinFlags,
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
      events: allEvents.sort(function(a, b) { return a.date - b.date; })
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
    customerCategoryCounts: {},
    mergeConfidenceCounts: {},
    postTradeOwnerCount: 0,
    lostFromNetworkCount: 0,
    serviceGapCount: 0,
    likelyLeaseReturnCount: 0,
    confirmedLeaseCount: 0,
    rejectedPhones: rejectedPhones.length,
    rejectedEmails: rejectedEmails.length,
    gateAllowed: gateAllowed,
    gateBlocked: gateBlocked,
    hasDealTypeColumn: hasDealTypeColumn,
    elapsedMs: 0
  };

  customers.forEach(function(c) {
    stats.timeBucketCounts[c.timeBucket]                  = (stats.timeBucketCounts[c.timeBucket]                  || 0) + 1;
    stats.salesPatternCounts[c.salesPattern]              = (stats.salesPatternCounts[c.salesPattern]              || 0) + 1;
    stats.customerCategoryCounts[c.customerCategory]      = (stats.customerCategoryCounts[c.customerCategory]      || 0) + 1;
    stats.mergeConfidenceCounts[c.mergeConfidence]        = (stats.mergeConfidenceCounts[c.mergeConfidence]        || 0) + 1;
    if (c.isPostTradeOwner) stats.postTradeOwnerCount++;
    if (c.lostFromNetwork.length) stats.lostFromNetworkCount++;
    if (c.hasServiceGapAfterSale) stats.serviceGapCount++;
    if (c.likelyLeaseReturn) stats.likelyLeaseReturnCount++;
    if (c.hasLeaseDealType) stats.confirmedLeaseCount++;
  });

  stats.thresholds = {
    defectionThresholdDays: DEFECTION_DAYS,
    longGoneThresholdDays:  LONG_GONE_DAYS,
    serviceGapThresholdDays: SERVICE_GAP_DAYS
  };
  stats.elapsedMs = Date.now() - t0;

  if (typeof window !== 'undefined' && window._loyaltyEngineStats) {
    stats.engineV2 = window._loyaltyEngineStats;
  }

  return {
    customers: customers,
    stats: stats,
    debug: { segments: segments.length, clusters: Object.keys(clusters).length }
  };
}
