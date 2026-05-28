// ===========================================================================
//  PROFILES — UI: Currently Owned view
//  One row per (customer, currently-owned VIN). Texting-first.
//  Default sort: Last Activity descending.
// ===========================================================================

function renderCurrentlyOwned() {
  var host = document.getElementById('view-currentlyOwned');
  var r = App.state.result;
  var f = App.state.filters;

  // Apply filters
  var filtered = applyCurrentlyOwnedFilters(r.targets, f);

  // Sort
  applySort(filtered, f.sort);

  // ── Build the UI ────────────────────────────────────────────────────────
  var html = '';
  html += '<div class="card">';
  html +=   '<div class="card-header">';
  html +=     '<h2>Currently Owned</h2>';
  html +=     '<span class="label">' + filtered.length.toLocaleString() + ' of ' + r.targets.length.toLocaleString() + ' rows</span>';
  html +=     '<div class="spacer"></div>';
  html +=     '<button class="btn btn-sm" id="btn-clear-filters">Clear filters</button>';
  html +=     '<button class="btn btn-primary btn-sm" id="btn-export">↓ Export ' + (hasAnyFilter(f) ? 'filtered' : 'all') + '</button>';
  html +=   '</div>';
  html +=   renderFilterPanel(filtered, r.targets, f);
  html +=   '<div class="table-wrap">';
  html +=     renderTargetTable(filtered, f);
  html +=   '</div>';
  html += '</div>';

  host.innerHTML = html;
  wireFilterPanel(host, f);
  wireTargetTable(host, filtered, f);
  host.querySelector('#btn-export').addEventListener('click', function() { ExportModal.open(filtered, hasAnyFilter(f)); });
  host.querySelector('#btn-clear-filters').addEventListener('click', function() {
    App.state.filters = {
      vin: '', phone: '', email: '', first: '', last: '',
      buckets: [], categories: [], flags: [], confidence: [],
      makes: [], models: [], years: [],
      activityFrom: '', activityTo: '', saleFrom: '', saleTo: '', serviceFrom: '', serviceTo: '',
      sort: [{ field: 'lastActivityDate', dir: 'desc' }]
    };
    App.renderAll();
  });
}

function hasAnyFilter(f) {
  return !!(f.vin || f.phone || f.email || f.first || f.last ||
            f.buckets.length || f.categories.length || f.flags.length || f.confidence.length ||
            f.makes.length || f.models.length || f.years.length ||
            f.activityFrom || f.activityTo || f.saleFrom || f.saleTo || f.serviceFrom || f.serviceTo);
}

function normDigits(s) { return String(s || '').replace(/\D/g, ''); }
function normAlnum(s)  { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function normVehVal(s) { return String(s || '').trim().toUpperCase(); }

function customerHasFlag(c, flag) {
  var hasPerRow = c.rowStoppedServicing !== undefined;
  switch (flag) {
    case 'Stopped Servicing': return hasPerRow ? !!c.rowStoppedServicing : ((c.lostFromNetwork||[]).length > 0);
    case 'Post-trade Owner':  return hasPerRow ? !!c.rowPostTradeOwner   : !!c.isPostTradeOwner;
    case 'Likely Lease':      return hasPerRow ? (!!c.rowLikelyLease && !c.rowConfirmedLease) : (!!c.likelyLeaseReturn && !c.hasLeaseDealType);
    case 'Confirmed Lease':   return hasPerRow ? !!c.rowConfirmedLease  : !!c.hasLeaseDealType;
    case 'Possible Duplicate':return c.mergeConfidence === 'Possible Duplicate';
    case 'High Volume':       return c.numSales > 20 || c.numServices > 100;
    case 'Phone Drift':       return !!c.hasPhoneDrift;
    case 'Email Drift':       return !!c.hasEmailDrift;
    default: return false;
  }
}

function applyCurrentlyOwnedFilters(rows, f) {
  var fVin   = normAlnum(f.vin);
  var fPhone = normDigits(f.phone);
  var fEmail = (f.email || '').toLowerCase().trim();
  var fFirst = (f.first || '').toLowerCase().trim();
  var fLast  = (f.last  || '').toLowerCase().trim();
  var hasMakeFilter  = f.makes.length  > 0;
  var hasModelFilter = f.models.length > 0;
  var hasYearFilter  = f.years.length  > 0;
  var makeSet  = {}; f.makes.forEach(function(v) { makeSet[normVehVal(v)] = true; });
  var modelSet = {}; f.models.forEach(function(v) { modelSet[normVehVal(v)] = true; });
  var yearSet  = {}; f.years.forEach(function(v) { yearSet[normVehVal(v)] = true; });

  function inRange(d, fromStr, toStr) {
    if (!fromStr && !toStr) return true;
    if (!d) return false;
    var t = d instanceof Date ? d.getTime() : new Date(d).getTime();
    if (isNaN(t)) return false;
    if (fromStr) {
      var fromT = new Date(fromStr + 'T00:00:00').getTime();
      if (!isNaN(fromT) && t < fromT) return false;
    }
    if (toStr) {
      var toT = new Date(toStr + 'T23:59:59').getTime();
      if (!isNaN(toT) && t > toT) return false;
    }
    return true;
  }

  return rows.filter(function(c) {
    if (f.buckets.length && f.buckets.indexOf(c.timeBucket) === -1) return false;
    if (f.categories.length && f.categories.indexOf(c.customerCategory) === -1) return false;
    if (f.confidence.length && f.confidence.indexOf(c.mergeConfidence) === -1) return false;
    if (f.flags.length) {
      if (!f.flags.some(function(g) { return customerHasFlag(c, g); })) return false;
    }
    if (fVin) {
      var rowMatch = normAlnum(c.vin || '').indexOf(fVin) !== -1;
      if (!rowMatch) {
        var cust = c._customer || {};
        var allVins = [].concat(cust.currentlyOwns||[], cust.previouslyOwned||[], cust.lostFromNetwork||[]);
        if (!allVins.some(function(v) { return normAlnum(v).indexOf(fVin) !== -1; })) return false;
      }
    }
    if (fPhone && !(c.phones||[]).some(function(p) { return normDigits(p).indexOf(fPhone) !== -1; })) return false;
    if (fEmail && !(c.emails||[]).some(function(e) { return String(e).toLowerCase().indexOf(fEmail) !== -1; })) return false;
    if (fFirst && String(c.firstName||'').toLowerCase().indexOf(fFirst) === -1) return false;
    if (fLast  && String(c.lastName ||'').toLowerCase().indexOf(fLast)  === -1) return false;
    if ((hasMakeFilter || hasModelFilter || hasYearFilter) && !c.isCurrentVehicle) return false;
    if (hasMakeFilter  && !makeSet[normVehVal(c.vehicleMake)])   return false;
    if (hasModelFilter && !modelSet[normVehVal(c.vehicleModel)]) return false;
    if (hasYearFilter  && !yearSet[normVehVal(c.vehicleYear)])   return false;
    if (!inRange(c.lastActivityDate, f.activityFrom, f.activityTo)) return false;
    if (!inRange(c.lastSaleDate,     f.saleFrom,     f.saleTo))     return false;
    if (!inRange(c.lastServiceDate,  f.serviceFrom,  f.serviceTo))  return false;
    return true;
  });
}

function applySort(rows, sort) {
  if (!sort || !sort.length) return;
  rows.sort(function(a, b) {
    for (var i = 0; i < sort.length; i++) {
      var s = sort[i];
      var av = a[s.field], bv = b[s.field];
      if (av instanceof Date) av = av.getTime();
      if (bv instanceof Date) bv = bv.getTime();
      if (av == null || av === '') av = null;
      if (bv == null || bv === '') bv = null;
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av == null && bv == null) continue;
      if (av == null) return 1;
      if (bv == null) return -1;
      var cmp = av < bv ? -1 : av > bv ? 1 : 0;
      if (cmp !== 0) return s.dir === 'asc' ? cmp : -cmp;
    }
    return 0;
  });
}

function renderTargetTable(rows, f) {
  if (!rows.length) {
    return '<table class="tbl"><tbody><tr><td style="padding:40px;text-align:center" class="muted">No customers match the current filters</td></tr></tbody></table>';
  }

  function thSort(label, field, align) {
    var i = f.sort.findIndex(function(s) { return s.field === field; });
    var active = i !== -1;
    var dir = active ? f.sort[i].dir : '';
    var arrow = active ? (dir === 'asc' ? ' ↑' : ' ↓') : '';
    var rank = active && f.sort.length > 1 ? '<sup style="color:var(--electric);font-weight:700"> ' + (i+1) + '</sup>' : '';
    return '<th class="sortable' + (active ? ' active' : '') + '" data-sort="' + field + '" ' +
           'style="text-align:' + align + '" title="Click to sort. Shift+click for secondary.">' + label + arrow + rank + '</th>';
  }

  var head = '<thead><tr>' +
    '<th>Name</th><th>Phone</th><th>Email</th><th>Category</th>' +
    thSort('Sales',         'numSales',                'right') +
    thSort('Service',       'numServices',             'right') +
    thSort('Last Activity', 'lastActivityDate',        'left')  +
    thSort('Days Ago',      'daysSinceLastInteraction','right') +
    '<th>Current Vehicle</th><th>Flags</th>' +
    '</tr></thead>';

  var body = '<tbody>';
  var visible = rows.slice(0, 250);
  visible.forEach(function(c) {
    var name = ((c.firstName || '') + ' ' + (c.lastName || '')).trim();
    var nameHtml = name
      ? '<span class="name-link" data-ckey="' + escapeHtml(String(c.customerKey)) + '">' + escapeHtml(name) + '</span>'
      : '<span class="name-link" data-ckey="' + escapeHtml(String(c.customerKey)) + '" style="font-style:italic">(no name)</span>';
    var phones = c.phones || [];
    var phoneHtml = phones.length
      ? '<span title="' + phones.join(', ') + '" class="mono">' + formatPhone(phones[0]) +
        (phones.length > 1 ? ' <span class="muted">+' + (phones.length - 1) + '</span>' : '') + '</span>'
      : '<span class="muted">—</span>';
    var emails = c.emails || [];
    var emailHtml = emails.length
      ? '<span title="' + emails.join(', ') + '">' + escapeHtml(emails[0]) +
        (emails.length > 1 ? ' <span class="muted">+' + (emails.length - 1) + '</span>' : '') + '</span>'
      : '<span class="muted">—</span>';
    var catIcon = c.customerCategory && c.customerCategory.indexOf('Home-grown') === 0 ? '🏡' : '🤝';
    var catShort = (c.customerCategory || '').replace('Home-grown — ', 'Home-grown ');
    var bucketDef_ = bucketDef(c.timeBucket);
    var bucketDot = bucketDef_ ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + bucketDef_.color + ';margin-right:6px;vertical-align:middle"></span>' : '';
    var lastDate = c.lastActivityDate ? new Date(c.lastActivityDate).toISOString().slice(0,10) : '—';
    var vinShort = c.vin ? c.vin.slice(-6) : '';
    var vehHtml = c.vin
      ? '<span title="' + escapeHtml(c.vehicleLabel + ' · ' + c.vin) + '">' + escapeHtml(c.vehicleLabel || c.vin) +
        (c.vin && c.vehicleLabel ? ' <span class="muted mono">· ' + vinShort + '</span>' : '') + '</span>'
      : '<span class="muted">—</span>';
    var pills = [];
    if (c.rowPostTradeOwner)   pills.push('<span class="pill pill-info" title="Vehicle was previously someone else\'s trade-in">Post-trade</span>');
    if (c.rowStoppedServicing) pills.push('<span class="pill pill-danger" title="Bought here, no trade-back, 18+ months no service">Stopped Svc</span>');
    if (c.rowConfirmedLease)   pills.push('<span class="pill pill-purple">Lease</span>');
    else if (c.rowLikelyLease) pills.push('<span class="pill pill-purple">Likely Lease</span>');
    if (c.mergeConfidence === 'Possible Duplicate') pills.push('<span class="pill pill-warn">Possible Dup</span>');
    if (c.numSales > 20 || c.numServices > 100) pills.push('<span class="pill pill-danger" title="High volume — likely commercial">⚠ High Volume</span>');

    body +=
      '<tr data-ckey="' + escapeHtml(String(c.customerKey)) + '">' +
      '<td>' + nameHtml + '</td>' +
      '<td>' + phoneHtml + '</td>' +
      '<td>' + emailHtml + '</td>' +
      '<td>' + bucketDot + catIcon + ' ' + escapeHtml(catShort) + '</td>' +
      '<td class="num">' + c.numSales + '</td>' +
      '<td class="num">' + c.numServices + '</td>' +
      '<td class="mono">' + lastDate + '</td>' +
      '<td class="num">' + (c.daysSinceLastInteraction != null ? c.daysSinceLastInteraction : '—') + '</td>' +
      '<td>' + vehHtml + '</td>' +
      '<td>' + pills.join(' ') + '</td>' +
      '</tr>';
  });
  body += '</tbody>';

  var foot = rows.length > 250
    ? '<tfoot><tr><td colspan="10">Showing first 250 of ' + rows.length.toLocaleString() + ' rows — export to see all</td></tr></tfoot>'
    : '';

  return '<table class="tbl">' + head + body + foot + '</table>';
}

function wireTargetTable(host, rows, f) {
  // Row click + name click → detail drawer
  host.querySelectorAll('.tbl tbody tr').forEach(function(tr) {
    var mouseDown = null;
    tr.addEventListener('mousedown', function(ev) { mouseDown = { x: ev.clientX, y: ev.clientY }; });
    tr.addEventListener('mouseup', function(ev) {
      if (!mouseDown) return;
      var dx = Math.abs(ev.clientX - mouseDown.x);
      var dy = Math.abs(ev.clientY - mouseDown.y);
      mouseDown = null;
      if (dx > 4 || dy > 4) return;  // user dragged (text selection)
      var sel = window.getSelection && window.getSelection();
      if (sel && sel.toString && sel.toString().length > 0) return;
      Detail.open(tr.getAttribute('data-ckey'));
    });
  });

  // Sortable headers
  host.querySelectorAll('.tbl thead th.sortable').forEach(function(th) {
    th.addEventListener('click', function(ev) {
      var field = th.getAttribute('data-sort');
      var sort = f.sort;
      var i = sort.findIndex(function(s) { return s.field === field; });
      if (ev.shiftKey) {
        if (i === -1) sort.push({ field: field, dir: 'desc' });
        else sort[i].dir = sort[i].dir === 'asc' ? 'desc' : 'asc';
      } else {
        if (i === 0 && sort.length === 1) sort[0].dir = sort[0].dir === 'asc' ? 'desc' : 'asc';
        else App.state.filters.sort = [{ field: field, dir: 'desc' }];
      }
      App.renderAll();
    });
  });
}

function formatPhone(p) {
  var d = normDigits(p);
  if (d.length !== 10) return p;
  return '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
