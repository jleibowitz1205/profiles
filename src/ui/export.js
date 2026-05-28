// ===========================================================================
//  PROFILES — UI: Export modal
//  Convergence Standard 10 + audit/quality columns. CSV download.
// ===========================================================================

var ExportModal = (function() {
  var EXPORT_HEADERS = [
    'First Name', 'Last Name', 'Year', 'Make', 'Model', 'VIN',
    'Email Address', 'Cell Phone Number', 'Home Phone Number', 'Work Phone Number',
    'Customer Category', 'Time Bucket', 'Days Since Last Interaction',
    '# Sales', '# Services', 'First Activity', 'Last Activity',
    'Phone Drift', 'Email Drift', 'Drifted Phones', 'Drifted Emails',
    'Previously Owned', 'Stopped Servicing',
    'Post-Trade Owner', 'Has Service Gap', 'Likely Lease Return', 'Confirmed Lease',
    'Merge Confidence', 'High Volume Flag'
  ];

  var state = { rows: [], headers: EXPORT_HEADERS, selectedCols: null };

  function buildRow(c) {
    var year, make, model, vin;
    if (c.vin !== undefined) {
      year = c.vehicleYear || ''; make = c.vehicleMake || ''; model = c.vehicleModel || ''; vin = c.vin || '';
    } else {
      var primary = (c.currentVehicles || [])[0] || {};
      year = primary.year || ''; make = primary.make || ''; model = primary.model || '';
      vin = primary.vin || (c.currentlyOwns && c.currentlyOwns[0]) || '';
    }
    var highVolume = (c.numSales > 20 || c.numServices > 100) ? 'Y' : '';
    return {
      'First Name': c.firstName || '',
      'Last Name':  c.lastName  || '',
      'Year': year, 'Make': make, 'Model': model, 'VIN': vin,
      'Email Address': c.primaryEmail || '',
      'Cell Phone Number': c.cellPhone || '',
      'Home Phone Number': c.homePhone || '',
      'Work Phone Number': c.workPhone || '',
      'Customer Category': c.customerCategory || c.salesPattern || '',
      'Time Bucket': c.timeBucket || '',
      'Days Since Last Interaction': c.daysSinceLastInteraction != null ? c.daysSinceLastInteraction : '',
      '# Sales': c.numSales,
      '# Services': c.numServices,
      'First Activity': c.firstActivityDate ? new Date(c.firstActivityDate).toISOString().slice(0,10) : '',
      'Last Activity':  c.lastActivityDate  ? new Date(c.lastActivityDate).toISOString().slice(0,10)  : '',
      'Phone Drift': c.hasPhoneDrift ? 'Y' : '',
      'Email Drift': c.hasEmailDrift ? 'Y' : '',
      'Drifted Phones': (c.driftedPhones || []).join('; '),
      'Drifted Emails': (c.driftedEmails || []).join('; '),
      'Previously Owned': (c.previouslyOwned || []).join('; '),
      'Stopped Servicing': c.rowStoppedServicing !== undefined
        ? (c.rowStoppedServicing ? 'Y' : '')
        : ((c.lostFromNetwork || []).join('; ')),
      'Post-Trade Owner':  (c.rowPostTradeOwner   !== undefined ? c.rowPostTradeOwner   : c.isPostTradeOwner)        ? 'Y' : '',
      'Has Service Gap':   (c.rowServiceGap       !== undefined ? c.rowServiceGap       : c.hasServiceGapAfterSale)  ? 'Y' : '',
      'Likely Lease Return': (c.rowLikelyLease    !== undefined ? c.rowLikelyLease      : c.likelyLeaseReturn)        ? 'Y' : '',
      'Confirmed Lease':   (c.rowConfirmedLease   !== undefined ? c.rowConfirmedLease   : c.hasLeaseDealType)         ? 'Y' : '',
      'Merge Confidence': c.mergeConfidence || '',
      'High Volume Flag': highVolume
    };
  }

  function open(filteredRows, isFiltered) {
    if (!filteredRows || !filteredRows.length) {
      notify('No rows to export', 'error');
      return;
    }
    state.rows = filteredRows.map(buildRow);
    state.selectedCols = EXPORT_HEADERS.slice();

    var modal = document.getElementById('export-modal');
    var modalContent = modal.querySelector('.modal-content');
    var rowCount = state.rows.length;
    var dateStr = new Date().toISOString().slice(0,10);
    var defaultName = 'profiles_export_' + dateStr + '.csv';

    modalContent.innerHTML =
      '<div class="modal-header">' +
        '<h2>Export ' + (isFiltered ? 'filtered ' : '') + rowCount.toLocaleString() + ' rows</h2>' +
        '<div class="spacer" style="flex:1"></div>' +
        '<button class="btn btn-ghost" id="modal-close" title="Close">✕</button>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div style="margin-bottom:18px">' +
          '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Filename</label>' +
          '<input type="text" id="export-filename" class="filter-input" style="width:100%;padding:8px 12px" value="' + defaultName + '" />' +
        '</div>' +
        '<div style="margin-bottom:18px">' +
          '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px">Columns to include (Convergence Standard 29)</label>' +
          '<div id="export-cols" style="display:grid;grid-template-columns:repeat(2, 1fr);gap:4px 12px;font-size:12px">' +
            EXPORT_HEADERS.map(function(h, i) {
              var isCore = i < 10;
              return '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:2px 0">' +
                '<input type="checkbox" data-col="' + h + '" checked />' +
                '<span' + (isCore ? ' style="font-weight:600"' : '') + '>' + h + '</span>' +
                (isCore ? ' <span class="pill pill-purple" style="font-size:9px;padding:0 5px">core</span>' : '') +
              '</label>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div style="margin-bottom:8px"><label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px">Preview (first 3 rows)</label>' +
          '<pre id="export-preview" style="background:var(--gray-50);padding:12px;border-radius:8px;font-size:11px;line-height:1.4;overflow-x:auto;max-height:200px;border:1px solid var(--gray-200)"></pre>' +
        '</div>' +
      '</div>' +
      '<div class="modal-footer">' +
        '<button class="btn" id="modal-cancel">Cancel</button>' +
        '<button class="btn btn-primary" id="modal-download">↓ Download CSV</button>' +
      '</div>';

    modal.classList.remove('hidden');
    updatePreview();

    modalContent.querySelectorAll('input[data-col]').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var col = cb.getAttribute('data-col');
        if (cb.checked) {
          if (state.selectedCols.indexOf(col) === -1) state.selectedCols.push(col);
        } else {
          var i = state.selectedCols.indexOf(col);
          if (i !== -1) state.selectedCols.splice(i, 1);
        }
        // Preserve original order
        state.selectedCols.sort(function(a, b) { return EXPORT_HEADERS.indexOf(a) - EXPORT_HEADERS.indexOf(b); });
        updatePreview();
      });
    });
    modalContent.querySelector('#modal-close').onclick  = close;
    modalContent.querySelector('#modal-cancel').onclick = close;
    modalContent.querySelector('#modal-download').onclick = download;
  }

  function updatePreview() {
    var preview = document.getElementById('export-preview');
    var cols = state.selectedCols;
    var lines = [cols.join(',')];
    state.rows.slice(0, 3).forEach(function(r) {
      lines.push(cols.map(function(c) { return csvCell(r[c]); }).join(','));
    });
    if (state.rows.length > 3) lines.push('... and ' + (state.rows.length - 3) + ' more');
    preview.textContent = lines.join('\n');
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function download() {
    var cols = state.selectedCols;
    if (!cols.length) { notify('Pick at least one column', 'error'); return; }
    var lines = [cols.map(csvCell).join(',')];
    state.rows.forEach(function(r) {
      lines.push(cols.map(function(c) { return csvCell(r[c]); }).join(','));
    });
    var csv = lines.join('\n');
    var filename = document.getElementById('export-filename').value || 'profiles_export.csv';
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('Exported ' + state.rows.length.toLocaleString() + ' rows', 'success');
    close();
  }

  function close() {
    document.getElementById('export-modal').classList.add('hidden');
  }

  return { open: open, close: close };
})();
