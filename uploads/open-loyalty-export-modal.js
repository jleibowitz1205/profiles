// ===========================================================================
// Extracted from index.html (Convergence List Hygiene Tool - Apps Script v2)
// Functions: runLoyaltyTimeline
// ===========================================================================

function runLoyaltyTimeline() {
  var sides = ['a','b','c','d','e','f'].filter(function(s){ return pipelinesState[s]&&pipelinesState[s].rows&&pipelinesState[s].rows.length; });
  if (sides.length < 1) { notify('Load at least 1 file (List A = sales OR service)', 'error'); return; }

  // Convention: List A = sales, List B = service. Engine works with either or both.
  // If only one list is loaded, we sniff which type it is by header signature.
  var salesRows = null, salesHeaders = null, serviceRows = null, serviceHeaders = null;

  function isSalesShape(headers) {
    var lc = headers.map(function(h){ return String(h||'').toLowerCase().replace(/\s+/g,''); });
    return lc.indexOf('tradevin') !== -1 || lc.indexOf('trade vin'.replace(/\s+/g,'')) !== -1 || lc.indexOf('purchasedate') !== -1;
  }
  function isServiceShape(headers) {
    var lc = headers.map(function(h){ return String(h||'').toLowerCase().replace(/\s+/g,''); });
    return lc.indexOf('dtcloseconverted') !== -1;
  }

  sides.forEach(function(s){
    var lst = pipelinesState[s];
    if (!salesRows && isSalesShape(lst.headers)) {
      salesRows = lst.rows; salesHeaders = lst.headers;
    } else if (!serviceRows && isServiceShape(lst.headers)) {
      serviceRows = lst.rows; serviceHeaders = lst.headers;
    } else if (!salesRows) {
      // Fallback: first list = sales
      salesRows = lst.rows; salesHeaders = lst.headers;
    } else if (!serviceRows) {
      serviceRows = lst.rows; serviceHeaders = lst.headers;
    }
  });

  if (!salesRows && !serviceRows) {
    notify('Could not identify sales or service file', 'error');
    return;
  }

  notify('Running Loyalty Timeline analysis...', 'info');

  // Run engine — async-ish via setTimeout so the notify renders
  setTimeout(function(){
    try {
      var result = buildLoyaltyTimeline(salesRows, salesHeaders, serviceRows, serviceHeaders);
      // Build per-(customer, current-VIN) target rows. Each currently-owned VIN
      // becomes one target row. Flags get computed per-VIN from c.vinFlags so the
      // Stopped Servicing / Post-trade / Lease flags only fire on the row they
      // actually apply to (not on every row for the customer).
      var targets = [];
      function flagsForVin(c, vin) {
        var vf = (c.vinFlags || {})[vin] || {};
        return {
          // Per-row flags — only true if THIS vehicle has the condition
          rowStoppedServicing: !!vf.stoppedServicing,
          rowPostTradeOwner:   !!vf.postTradeOwner,
          rowLikelyLease:      !!vf.likelyLease,
          rowConfirmedLease:   !!vf.confirmedLease,
          rowServiceGap:       !!vf.serviceGap
        };
      }
      result.customers.forEach(function(c){
        var current = c.currentVehicles || [];
        if (current.length === 0) {
          // Customer with no current vehicle — still surface them as a row
          targets.push({
            _customer: c,
            customerKey: c.customerKey,
            firstName: c.firstName, lastName: c.lastName,
            phones: c.phones, emails: c.emails,
            cellPhone: c.cellPhone, homePhone: c.homePhone, workPhone: c.workPhone,
            primaryEmail: c.primaryEmail,
            vin: '', vehicleYear: '', vehicleMake: '', vehicleModel: '', vehicleLabel: '(no current vehicle)',
            isCurrentVehicle: false,
            timeBucket: c.timeBucket,
            customerCategory: c.customerCategory,
            mergeConfidence: c.mergeConfidence,
            numSales: c.numSales, numServices: c.numServices,
            lastSaleDate: c.lastSaleDate, lastServiceDate: c.lastServiceDate,
            lastActivityDate: c.lastActivityDate, firstActivityDate: c.firstActivityDate,
            daysSinceLastInteraction: c.daysSinceLastInteraction,
            // Per-row flags — for the (no current vehicle) case, surface customer-level
            // flags only if there's a meaningful lost-vehicle to attribute them to.
            // We surface customer-level rolled-up flag for the orphan row.
            rowStoppedServicing: (c.lostFromNetwork||[]).length > 0,
            rowPostTradeOwner:   !!c.isPostTradeOwner,
            rowLikelyLease:      !!c.likelyLeaseReturn && !c.hasLeaseDealType,
            rowConfirmedLease:   !!c.hasLeaseDealType,
            rowServiceGap:       !!c.hasServiceGapAfterSale,
            // Customer-level rolled-up flags (preserved for legacy callers/exports)
            isPostTradeOwner: c.isPostTradeOwner,
            lostFromNetwork: c.lostFromNetwork,
            hasServiceGapAfterSale: c.hasServiceGapAfterSale,
            likelyLeaseReturn: c.likelyLeaseReturn,
            hasLeaseDealType: c.hasLeaseDealType,
            hasPhoneDrift: c.hasPhoneDrift, hasEmailDrift: c.hasEmailDrift,
            driftedPhones: c.driftedPhones, driftedEmails: c.driftedEmails,
            salesPattern: c.salesPattern
          });
        } else {
          current.forEach(function(cv){
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
              // Per-VIN dates for THIS vehicle (used by row-level date filters)
              lastSaleDate:    cv.saleDate    || null,
              lastServiceDate: cv.lastServiceDate || null,
              // Customer-level last activity (any vehicle) for the activity filter
              lastActivityDate: c.lastActivityDate, firstActivityDate: c.firstActivityDate,
              daysSinceLastInteraction: c.daysSinceLastInteraction,
              // Per-row flags — only true if THIS row's VIN has the condition
              rowStoppedServicing: rf.rowStoppedServicing,
              rowPostTradeOwner:   rf.rowPostTradeOwner,
              rowLikelyLease:      rf.rowLikelyLease,
              rowConfirmedLease:   rf.rowConfirmedLease,
              rowServiceGap:       rf.rowServiceGap,
              // Customer-level rolled-up flags (preserved for legacy callers/exports)
              isPostTradeOwner: c.isPostTradeOwner,
              lostFromNetwork: c.lostFromNetwork,
              hasServiceGapAfterSale: c.hasServiceGapAfterSale,
              likelyLeaseReturn: c.likelyLeaseReturn,
              hasLeaseDealType: c.hasLeaseDealType,
              hasPhoneDrift: c.hasPhoneDrift, hasEmailDrift: c.hasEmailDrift,
              driftedPhones: c.driftedPhones, driftedEmails: c.driftedEmails,
              salesPattern: c.salesPattern,
              // Customer-level dates (for any code that still needs them)
              _customerLastSaleDate:    c.lastSaleDate,
              _customerLastServiceDate: c.lastServiceDate
            });
          });
        }
      });
      result.targets = targets;
      result.stats.totalTargets = targets.length;
      console.log('[Loyalty Timeline] Built ' + targets.length + ' (customer × current-vehicle) target rows from ' + result.customers.length + ' customers.');

      pipelinesState.loyaltyResult = result;
      pipelinesState.loyaltyFilters = { vin:'', phone:'', email:'', first:'', last:'', buckets:[], categories:[], flags:[], confidence:[], makes:[], models:[], years:[], activityFrom:'', activityTo:'', saleFrom:'', saleTo:'', serviceFrom:'', serviceTo:'', sort: [{ field:'lastActivityDate', dir:'desc' }] };
      showLoyaltyTimelineResults();
    } catch(e) {
      notify('Loyalty Timeline failed: ' + e.message, 'error');
      console.error('[Loyalty Timeline]', e);
    }
  }, 50);
}

