// ===========================================================================
// Extracted from index.html (Convergence List Hygiene Tool - Apps Script v2)
// Functions: exportLoyaltyTimeline
// ===========================================================================

function exportLoyaltyTimeline(bucket, prefiltered) {
  var result = pipelinesState.loyaltyResult;
  if (!result) return;
  var filtered;
  if (prefiltered) {
    filtered = prefiltered;
  } else if (bucket) {
    filtered = result.customers.filter(function(c){ return c.timeBucket === bucket; });
  } else {
    filtered = result.customers;
  }
  if (!filtered.length) { notify('No rows to export', 'error'); return; }

  // Convergence Standard Export schema: 10 core columns,
  // followed by quality + audit columns for downstream activation/verification.
  var headers = [
    // Convergence Standard 10
    'First Name', 'Last Name', 'Year', 'Make', 'Model', 'VIN',
    'Email Address', 'Cell Phone Number', 'Home Phone Number', 'Work Phone Number',
    // Quality + audit
    'Customer Category', 'Time Bucket', 'Days Since Last Interaction',
    '# Sales', '# Services', 'First Activity', 'Last Activity',
    'Phone Drift', 'Email Drift', 'Drifted Phones', 'Drifted Emails',
    'Previously Owned', 'Stopped Servicing',
    'Post-Trade Owner', 'Has Service Gap', 'Likely Lease Return', 'Confirmed Lease',
    'Merge Confidence', 'High Volume Flag'
  ];

  var rows = [headers];
  filtered.forEach(function(c){
    // Pick the primary current vehicle (first in list) for the Convergence Standard 6-col vehicle block
    var primaryVeh = (c.currentVehicles||[])[0] || {};
    var year  = primaryVeh.year  || '';
    var make  = primaryVeh.make  || '';
    var model = primaryVeh.model || '';
    var vin   = primaryVeh.vin   || (c.currentlyOwns && c.currentlyOwns[0]) || '';
    var highVolume = (c.numSales > 20 || c.numServices > 100) ? 'Y' : '';
    rows.push([
      c.firstName,
      c.lastName,
      year,
      make,
      model,
      vin,
      c.primaryEmail || '',
      c.cellPhone || '',
      c.homePhone || '',
      c.workPhone || '',
      // Quality + audit
      c.customerCategory || c.salesPattern,
      c.timeBucket,
      c.daysSinceLastInteraction != null ? c.daysSinceLastInteraction : '',
      c.numSales,
      c.numServices,
      c.firstActivityDate ? new Date(c.firstActivityDate).toISOString().slice(0,10) : '',
      c.lastActivityDate  ? new Date(c.lastActivityDate).toISOString().slice(0,10)  : '',
      c.hasPhoneDrift ? 'Y' : '',
      c.hasEmailDrift ? 'Y' : '',
      (c.driftedPhones||[]).join('; '),
      (c.driftedEmails||[]).join('; '),
      (c.previouslyOwned||[]).join('; '),
      (c.lostFromNetwork||[]).join('; '),
      c.isPostTradeOwner ? 'Y' : '',
      c.hasServiceGapAfterSale ? 'Y' : '',
      c.likelyLeaseReturn ? 'Y' : '',
      c.hasLeaseDealType ? 'Y' : '',
      c.mergeConfidence,
      highVolume
    ]);
  });

  var csv = rows.map(function(r){
    return r.map(function(v){
      var s = String(v == null ? '' : v);
      if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
        s = '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',');
  }).join('\n');

  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'loyalty_timeline_' + (bucket || 'all').replace(/\s+/g,'_') + '_' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  notify('Exported ' + filtered.length.toLocaleString() + ' customers');
}

// ─────────────────────────────────────────────────────────────────────────────
//  LOYALTY TIMELINE — CUSTOMER DETAIL PANEL (side drawer)
// ─────────────────────────────────────────────────────────────────────────────

