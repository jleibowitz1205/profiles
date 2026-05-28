// ===========================================================================
//  PROFILES — UI: Anomalies view
//  Per ANOMALY_QUEUE_SPEC.md. Each anomaly has type, status, detail,
//  related customers/VINs. Resolve / Suppress actions stub for the
//  engineering team to wire into the backend.
// ===========================================================================

function renderAnomalies() {
  var host = document.getElementById('view-anomalies');
  var r = App.state.result;
  var f = App.state.anomalyFilters;

  var anomalies = r.anomalies.filter(function(a) {
    if (f.types.length && f.types.indexOf(a.type) === -1) return false;
    if (f.statuses.length && f.statuses.indexOf(a.status) === -1) return false;
    return true;
  });
  applySort(anomalies, f.sort);

  // Count by type for chip labels (respects status filter)
  var typeCounts = {};
  r.anomalies.forEach(function(a) {
    if (f.statuses.length && f.statuses.indexOf(a.status) === -1) return;
    typeCounts[a.type] = (typeCounts[a.type] || 0) + 1;
  });
  var statusCounts = {};
  r.anomalies.forEach(function(a) { statusCounts[a.status] = (statusCounts[a.status]||0) + 1; });

  function chip(group, value, label, count) {
    var active = (f[group] || []).indexOf(value) !== -1;
    var dim = (count === 0 && !active) ? ' dim' : '';
    return '<button class="chip' + (active ? ' active' : '') + dim + '" data-agroup="' + group + '" data-avalue="' + escapeHtml(value) + '">' +
           label + (count !== undefined ? ' <span class="ct">' + count + '</span>' : '') + '</button>';
  }

  var typeChips = Object.keys(ANOMALY_TYPES).map(function(t) {
    var def = ANOMALY_TYPES[t];
    return chip('types', t, def.label, typeCounts[t] || 0);
  }).join(' ');

  var statusChips = ['open', 'investigating', 'resolved', 'suppressed'].map(function(s) {
    return chip('statuses', s, s.charAt(0).toUpperCase() + s.slice(1), statusCounts[s] || 0);
  }).join(' ');

  var rowsHtml = '';
  if (!anomalies.length) {
    rowsHtml = '<tr><td colspan="6" style="padding:40px;text-align:center" class="muted">No anomalies match the current filters</td></tr>';
  } else {
    anomalies.slice(0, 250).forEach(function(a) {
      var def = ANOMALY_TYPES[a.type] || { label: a.type, color: '#666', bg: '#eee' };
      var dateStr = a.detectedAt ? (a.detectedAt instanceof Date ? a.detectedAt : new Date(a.detectedAt)).toISOString().slice(0,10) : '—';
      var ckey = (a.customerKeys||[])[0];
      var custLink = ckey
        ? '<span class="name-link" data-ckey="' + escapeHtml(String(ckey)) + '">View customer ›</span>'
        : '<span class="muted">—</span>';
      var vinShort = a.vin ? a.vin.slice(-6) : ((a.vins||[]).slice(0,2).map(function(v){return v.slice(-6);}).join(', ') || '—');
      var statusPill = a.status === 'open' ? 'pill-warn' : a.status === 'resolved' ? 'pill-good' : a.status === 'suppressed' ? 'pill-gray' : 'pill-info';
      rowsHtml +=
        '<tr data-aid="' + a.id + '">' +
        '<td><span class="pill" style="background:' + def.bg + ';color:' + def.color + '">' + def.label + '</span></td>' +
        '<td class="mono">' + dateStr + '</td>' +
        '<td class="mono">' + vinShort + '</td>' +
        '<td>' + custLink + '</td>' +
        '<td style="font-size:12px">' + escapeHtml(a.detail || '') + '</td>' +
        '<td><span class="pill ' + statusPill + '">' + a.status + '</span></td>' +
        '</tr>';
    });
  }

  host.innerHTML = '<div class="card">' +
    '<div class="card-header">' +
      '<h2>Anomalies</h2>' +
      '<span class="label">' + anomalies.length.toLocaleString() + ' of ' + r.anomalies.length.toLocaleString() + '</span>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn-sm" id="btn-an-clear">Clear filters</button>' +
    '</div>' +
    '<div class="filter-panel">' +
      '<div class="filter-row"><span class="filter-label">Type</span>' + typeChips + '</div>' +
      '<div class="filter-row"><span class="filter-label">Status</span>' + statusChips + '</div>' +
    '</div>' +
    '<div class="table-wrap"><table class="tbl">' +
      '<thead><tr><th>Type</th><th>Detected</th><th>VIN(s)</th><th>Customer</th><th>Detail</th><th>Status</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody>' +
    '</table></div>' +
    '<div style="padding:14px 20px;background:var(--gray-50);font-size:11.5px;color:var(--gray-600);border-top:1px solid var(--gray-200)">' +
      '<strong>Engineering note:</strong> Per ANOMALY_QUEUE_SPEC.md the production version supports Resolve / Investigate / Suppress / Escalate per anomaly, plus bulk actions and per-anomaly notes. Status changes persist in the customer_history table.' +
    '</div>' +
  '</div>';

  host.querySelectorAll('.chip').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var g = btn.getAttribute('data-agroup');
      var v = btn.getAttribute('data-avalue');
      var arr = f[g];
      if (!arr) return;
      var i = arr.indexOf(v);
      if (i === -1) arr.push(v); else arr.splice(i, 1);
      App.renderAll();
    });
  });
  host.querySelectorAll('.name-link').forEach(function(link) {
    link.addEventListener('click', function(ev) {
      ev.stopPropagation();
      Detail.open(link.getAttribute('data-ckey'));
    });
  });
  host.querySelector('#btn-an-clear').addEventListener('click', function() {
    App.state.anomalyFilters = { types: [], statuses: ['open'], sort: [{ field: 'detectedAt', dir: 'desc' }] };
    App.renderAll();
  });
}
