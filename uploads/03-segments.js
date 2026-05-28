// ===========================================================================
// Extracted from index.html (Convergence List Hygiene Tool - Apps Script v2)
// Functions: openLoyaltyExportModal
// ===========================================================================

function openLoyaltyExportModal(filtered, hasFilter) {
  if (!filtered || !filtered.length) {
    notify('No rows to export', 'error');
    return;
  }

  // Convergence Standard 10 + audit/quality columns (same shape as the direct export)
  var headers = [
    // Convergence Standard 10 — placed FIRST so passthrough mode hands the right column order to downstream
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

  // Convert each row into a flat record keyed by the export headers.
  // Rows are now per-(customer, current-VIN) targets, so each row has its own vehicle.
  var rows = filtered.map(function(c){
    // Vehicle for this row — directly on the target.
    // Fallback to currentVehicles[0] if we got a customer-shaped object (legacy callers).
    var year, make, model, vin;
    if (c.vin !== undefined) {  // target-shaped row
      year  = c.vehicleYear  || '';
      make  = c.vehicleMake  || '';
      model = c.vehicleModel || '';
      vin   = c.vin || '';
    } else {  // legacy customer-shaped row
      var primaryVeh = (c.currentVehicles||[])[0] || {};
      year  = primaryVeh.year  || '';
      make  = primaryVeh.make  || '';
      model = primaryVeh.model || '';
      vin   = primaryVeh.vin   || (c.currentlyOwns && c.currentlyOwns[0]) || '';
    }
    var highVolume = (c.numSales > 20 || c.numServices > 100) ? 'Y' : '';
    return {
      'First Name':          c.firstName || '',
      'Last Name':           c.lastName || '',
      'Year':                year,
      'Make':                make,
      'Model':               model,
      'VIN':                 vin,
      'Email Address':       c.primaryEmail || '',
      'Cell Phone Number':   c.cellPhone || '',
      'Home Phone Number':   c.homePhone || '',
      'Work Phone Number':   c.workPhone || '',
      'Customer Category':   c.customerCategory || c.salesPattern || '',
      'Time Bucket':         c.timeBucket || '',
      'Days Since Last Interaction': c.daysSinceLastInteraction != null ? c.daysSinceLastInteraction : '',
      '# Sales':             c.numSales,
      '# Services':          c.numServices,
      'First Activity':      c.firstActivityDate ? new Date(c.firstActivityDate).toISOString().slice(0,10) : '',
      'Last Activity':       c.lastActivityDate  ? new Date(c.lastActivityDate).toISOString().slice(0,10)  : '',
      'Phone Drift':         c.hasPhoneDrift ? 'Y' : '',
      'Email Drift':         c.hasEmailDrift ? 'Y' : '',
      'Drifted Phones':      (c.driftedPhones||[]).join('; '),
      'Drifted Emails':      (c.driftedEmails||[]).join('; '),
      'Previously Owned':    (c.previouslyOwned||[]).join('; '),
      // Per-row flag values when present (target-shaped rows), fall back to customer-level
      'Stopped Servicing':   (c.rowStoppedServicing !== undefined ? (c.rowStoppedServicing ? 'Y' : '') : ((c.lostFromNetwork||[]).join('; '))),
      'Post-Trade Owner':    (c.rowPostTradeOwner !== undefined ? c.rowPostTradeOwner : c.isPostTradeOwner) ? 'Y' : '',
      'Has Service Gap':     (c.rowServiceGap !== undefined ? c.rowServiceGap : c.hasServiceGapAfterSale) ? 'Y' : '',
      'Likely Lease Return': (c.rowLikelyLease !== undefined ? c.rowLikelyLease : c.likelyLeaseReturn) ? 'Y' : '',
      'Confirmed Lease':     (c.rowConfirmedLease !== undefined ? c.rowConfirmedLease : c.hasLeaseDealType) ? 'Y' : '',
      'Merge Confidence':    c.mergeConfidence || '',
      'High Volume Flag':    highVolume
    };
  });

  // Hand off to the shared Hygiene-style modal infrastructure.
  // Passthrough mode means the modal uses the rows + headers exactly as we provide them —
  // no further standardization (we've already done it).
  _exportContext  = 'loyalty';
  _exportRawRows  = rows;
  _exportRawHdrs  = headers;
  _pendingMappings = {};  // no mapping needed — headers are already Convergence Standard
  _exportMode     = 'passthrough';
  try { localStorage.setItem('convergence_export_mode', 'passthrough'); } catch(e) {}

  // Open the modal (same one Hygiene uses)
  var modal = document.getElementById('export-modal');
  if (!modal) {
    notify('Export modal not found', 'error');
    return;
  }
  modal.classList.add('open');
  var copyConfirm = document.getElementById('copy-confirm');
  if (copyConfirm) { copyConfirm.style.display = 'none'; copyConfirm.classList.add('hidden'); }

  var dateEl = document.getElementById('export-date');
  if (dateEl && !dateEl.value) dateEl.value = (typeof getDefaultDate === 'function') ? getDefaultDate() : new Date().toISOString().slice(0,10);

  // Prefill dealer/listType — pull from the loaded files if we can
  var dealerEl = document.getElementById('export-dealer');
  var listEl   = document.getElementById('export-listtype');
  // Try to infer dealer from first loaded file
  var srcFile = '';
  ['a','b','c','d','e','f'].forEach(function(s){
    if (!srcFile && pipelinesState[s] && pipelinesState[s].name) srcFile = pipelinesState[s].name;
  });
  if (dealerEl && !dealerEl.value && srcFile && typeof parseDealerFromFilename === 'function') {
    var parsed = parseDealerFromFilename(srcFile);
    if (parsed.dealer) dealerEl.value = parsed.dealer;
  }
  if (listEl && !listEl.value) listEl.value = 'LoyaltyTimeline';

  // Build the column picker and preview using the modal's own helpers
  if (typeof buildExportColPicker === 'function') buildExportColPicker(headers);
  if (typeof updateExportModeUI === 'function')   updateExportModeUI();
  if (typeof refreshExportTextarea === 'function') refreshExportTextarea();
  if (typeof updateFilenamePreview === 'function') updateFilenamePreview();
  ['export-date','export-dealer','export-listtype'].forEach(function(id){
    var el = document.getElementById(id);
    if (el && typeof updateFilenamePreview === 'function') el.oninput = updateFilenamePreview;
  });
}

