// ===========================================================================
//  PROFILES — Engine module: target row explosion
//  Source: extracted from runLoyaltyTimeline.js (Apps Script v2), verbatim.
//
//  Takes the customer records produced by buildLoyaltyTimeline and explodes
//  them into per-(customer, current-VIN) "target rows" for the table view.
//  Each row carries exactly one vehicle, and its flags fire only when THIS
//  specific vehicle has the condition (not "any of the customer's").
//
//  Port note: lift to src/engine/targets.ts
// ===========================================================================

function buildTargetRows(customers) {
  var targets = [];

  function flagsForVin(c, vin) {
    var vf = (c.vinFlags || {})[vin] || {};
    return {
      rowStoppedServicing: !!vf.stoppedServicing,
      rowPostTradeOwner:   !!vf.postTradeOwner,
      rowLikelyLease:      !!vf.likelyLease,
      rowConfirmedLease:   !!vf.confirmedLease,
      rowServiceGap:       !!vf.serviceGap
    };
  }

  customers.forEach(function(c) {
    var current = c.currentVehicles || [];
    if (current.length === 0) {
      targets.push(_buildOrphanTarget(c));
    } else {
      current.forEach(function(cv) {
        var rf = flagsForVin(c, cv.vin);
        targets.push({
          _customer: c,
          customerKey: c.customerKey,
          firstName: c.firstName, lastName: c.lastName,
          phones: c.phones, emails: c.emails,
          cellPhone: c.cellPhone, homePhone: c.homePhone, workPhone: c.workPhone,
          primaryEmail: c.primaryEmail,
          vin: cv.vin,
          vehicleYear:  cv.year,
          vehicleMake:  cv.make,
          vehicleModel: cv.model,
          vehicleLabel: cv.label,
          isCurrentVehicle: true,
          timeBucket: c.timeBucket,
          customerCategory: c.customerCategory,
          mergeConfidence: c.mergeConfidence,
          numSales: c.numSales, numServices: c.numServices,
          lastSaleDate:    cv.saleDate    || null,
          lastServiceDate: cv.lastServiceDate || null,
          lastActivityDate: c.lastActivityDate,
          firstActivityDate: c.firstActivityDate,
          daysSinceLastInteraction: c.daysSinceLastInteraction,
          rowStoppedServicing: rf.rowStoppedServicing,
          rowPostTradeOwner:   rf.rowPostTradeOwner,
          rowLikelyLease:      rf.rowLikelyLease,
          rowConfirmedLease:   rf.rowConfirmedLease,
          rowServiceGap:       rf.rowServiceGap,
          isPostTradeOwner: c.isPostTradeOwner,
          lostFromNetwork: c.lostFromNetwork,
          hasServiceGapAfterSale: c.hasServiceGapAfterSale,
          likelyLeaseReturn: c.likelyLeaseReturn,
          hasLeaseDealType: c.hasLeaseDealType,
          hasPhoneDrift: c.hasPhoneDrift,
          hasEmailDrift: c.hasEmailDrift,
          driftedPhones: c.driftedPhones,
          driftedEmails: c.driftedEmails,
          salesPattern: c.salesPattern
        });
      });
    }
  });

  return targets;
}

function _buildOrphanTarget(c) {
  return {
    _customer: c,
    customerKey: c.customerKey,
    firstName: c.firstName, lastName: c.lastName,
    phones: c.phones, emails: c.emails,
    cellPhone: c.cellPhone, homePhone: c.homePhone, workPhone: c.workPhone,
    primaryEmail: c.primaryEmail,
    vin: '', vehicleYear: '', vehicleMake: '', vehicleModel: '',
    vehicleLabel: '(no current vehicle)',
    isCurrentVehicle: false,
    timeBucket: c.timeBucket,
    customerCategory: c.customerCategory,
    mergeConfidence: c.mergeConfidence,
    numSales: c.numSales, numServices: c.numServices,
    lastSaleDate: c.lastSaleDate, lastServiceDate: c.lastServiceDate,
    lastActivityDate: c.lastActivityDate, firstActivityDate: c.firstActivityDate,
    daysSinceLastInteraction: c.daysSinceLastInteraction,
    rowStoppedServicing: (c.lostFromNetwork || []).length > 0,
    rowPostTradeOwner:   !!c.isPostTradeOwner,
    rowLikelyLease:      !!c.likelyLeaseReturn && !c.hasLeaseDealType,
    rowConfirmedLease:   !!c.hasLeaseDealType,
    rowServiceGap:       !!c.hasServiceGapAfterSale,
    isPostTradeOwner: c.isPostTradeOwner,
    lostFromNetwork: c.lostFromNetwork,
    hasServiceGapAfterSale: c.hasServiceGapAfterSale,
    likelyLeaseReturn: c.likelyLeaseReturn,
    hasLeaseDealType: c.hasLeaseDealType,
    hasPhoneDrift: c.hasPhoneDrift, hasEmailDrift: c.hasEmailDrift,
    driftedPhones: c.driftedPhones, driftedEmails: c.driftedEmails,
    salesPattern: c.salesPattern
  };
}

// ── Sales History rows — one row per SALE event (no Adopted) ────────────────
//  Per ARCHITECTURE.md "Sales History" view:
//    - One row per SALE EVENT
//    - Adopted excluded (no sale)
//    - Status pill: Currently Owned / Traded Back / Stopped Servicing
//      ("Defected" status currently a placeholder — comes from a data
//       provider feed in production, not engine-inferred)
//
//  Port note: lift to src/api/queries/salesHistory.ts
function buildSalesHistoryRows(customers) {
  var rows = [];
  customers.forEach(function(c) {
    (c.events || []).forEach(function(e) {
      if (e.type !== 'sale') return;
      var vin = e.vin;
      var status;
      if ((c.previouslyOwned || []).indexOf(vin) !== -1)      status = 'Traded Back';
      else if ((c.lostFromNetwork || []).indexOf(vin) !== -1) status = 'Stopped Servicing';
      else if ((c.currentlyOwns   || []).indexOf(vin) !== -1) status = 'Currently Owned';
      else                                                    status = 'Unknown';
      // Find matching current/prev vehicle entry for the year/make/model
      var match = ((c.currentVehicles||[]).concat(c.previousVehicles||[]).concat(c.lostVehicles||[])).find(function(v){ return v.vin === vin; }) || {};
      rows.push({
        _customer: c,
        customerKey: c.customerKey,
        firstName: c.firstName,
        lastName:  c.lastName,
        phones:    c.phones,
        emails:    c.emails,
        primaryEmail: c.primaryEmail,
        cellPhone:    c.cellPhone,
        saleDate:  e.date,
        vin:       vin,
        vehicleYear:  match.year  || e.vehicleYear  || '',
        vehicleMake:  match.make  || e.vehicleMake  || '',
        vehicleModel: match.model || e.vehicleModel || '',
        vehicleLabel: match.label || [e.vehicleYear, e.vehicleMake, e.vehicleModel].filter(Boolean).join(' '),
        status:    status,
        dealType:  e.dealType || '',
        timeBucket: c.timeBucket,
        customerCategory: c.customerCategory
      });
    });
  });
  rows.sort(function(a, b) { return b.saleDate - a.saleDate; });
  return rows;
}
