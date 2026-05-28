// ===========================================================================
//  PROFILES — UI: Sales History view
//  One row per SALE EVENT. Status pills per row:
//    Currently Owned / Traded Back / Stopped Servicing / Defected
//
//  "Defected" status comes from a data-provider feed in production —
//  not engine-inferred. Surfaced here as a TODO for the engineering team.
// ===========================================================================

function renderSalesHistory() {
  var host = document.getElementById('view-salesHistory');
  var r = App.state.result;
  var f = App.state.salesHistoryFilters;

  var rows = applySalesHistoryFilters(r.salesHistory, f);
  applySort(rows, f.sort);

  var statusDefs = [
    { v: 'Currently Owned',  pill: 'pill-good' },
    { v: 'Traded Back',      pill: 'pill-warn' },
    { v: 'Stopped Servicing',pill: 'pill-danger' },
    { v: 'Defected',         pill: 'pill-gray' }
  ];

  function chip(group, value, label, count) {
    var active = (f[group] || []).indexOf(value) !== -1;
    var dim = (count === 0 && !active) ? ' dim' : '';
    return '<button class="chip' + (active ? ' active' : '') + dim + '" data-sgroup="' + group + '" data-svalue="' + escapeHtml(value) + '">' +
           label + (count !== undefined ? ' <span class="ct">' + count + '</span>' : '') + '</button>';
  }
  function inp(name, ph, w) {
    return '<input class="filter-input" data-sfld="' + name + '" placeholder="' + ph + '" value="' + escapeHtml(f[name] || '') + '" style="width:' + w + 'px" />';
  }

  // Counts honor other filters
  function countWithoutFacet(facet) {
    return r.salesHistory.filter(function(s) {
      var fVin = normAlnum(f.vin), fPhone = normDigits(f.phone);
      var fEmail = (f.email||'').toLowerCase().trim();
      var fFirst = (f.first||'').toLowerCase().trim();
      var fLast  = (f.last ||'').toLowerCase().trim();
      if (fVin && normAlnum(s.vin).indexOf(fVin) === -1) return false;
      if (fPhone && !(s.phones||[]).some(function(p){ return normDigits(p).indexOf(fPhone) !== -1; })) return false;
      if (fEmail && !(s.emails||[]).some(function(e){ return String(e).toLowerCase().indexOf(fEmail) !== -1; })) return false;
      if (fFirst && String(s.firstName||'').toLowerCase().indexOf(fFirst) === -1) return false;
      if (fLast  && String(s.lastName ||'').toLowerCase().indexOf(fLast)  === -1) return false;
      if (facet !== 'statuses'   && f.statuses.length   && f.statuses.indexOf(s.status) === -1) return false;
      if (facet !== 'categories' && f.categories.length && f.categories.indexOf(s.customerCategory) === -1) return false;
      if (facet !== 'makes'  && f.makes.length  && !f.makes.some(function(v) { return normVehVal(v) === normVehVal(s.vehicleMake); }))   return false;
      if (facet !== 'models' && f.models.length && !f.models.some(function(v) { return normVehVal(v) === normVehVal(s.vehicleModel); })) return false;
      if (facet !== 'years'  && f.years.length  && !f.years.some(function(v) { return normVehVal(v) === normVehVal(s.vehicleYear); }))   return false;
      return true;
    });
  }
  var sPool   = countWithoutFacet('statuses');
  var catPool = countWithoutFacet('categories');
  var makePool = countWithoutFacet('makes');
  var modelPool= countWithoutFacet('models');
  var yearPool = countWithoutFacet('years');

  function vehicleOptions(pool, key) {
    var counts = {};
    var fk = key === 'make' ? 'vehicleMake' : key === 'model' ? 'vehicleModel' : 'vehicleYear';
    pool.forEach(function(c) { var v = normVehVal(c[fk]); if (!v) return; counts[v] = (counts[v]||0)+1; });
    var arr = Object.keys(counts).map(function(k){ return { value: k, count: counts[k] }; });
    if (key === 'year') arr.sort(function(a,b){ return parseInt(b.value) - parseInt(a.value); });
    else arr.sort(function(a,b){ return b.count - a.count; });
    return arr.slice(0, 10);
  }
  var makeOpts  = vehicleOptions(makePool, 'make');
  var modelOpts = vehicleOptions(modelPool,'model');
  var yearOpts  = vehicleOptions(yearPool, 'year');

  var statusChips = statusDefs.map(function(d) {
    var ct = sPool.filter(function(s) { return s.status === d.v; }).length;
    return chip('statuses', d.v, d.v, ct);
  }).join(' ');
  var catChips = [
    { v: 'Home-grown — Repeat',     l: 'Home-grown Repeat' },
    { v: 'Home-grown — First-time', l: 'Home-grown First-time' }
  ].map(function(d) {
    var ct = catPool.filter(function(s) { return s.customerCategory === d.v; }).length;
    return chip('categories', d.v, d.l, ct);
  }).join(' ');

  function dateRow(labelTxt, fromKey, toKey) {
    return '<div class="filter-row"><span class="filter-label">' + labelTxt + '</span>' +
      '<input type="date" class="date-input" data-sfld="' + fromKey + '" value="' + (f[fromKey]||'') + '" />' +
      '<span class="muted">to</span>' +
      '<input type="date" class="date-input" data-sfld="' + toKey + '" value="' + (f[toKey]||'') + '" />' +
      '</div>';
  }

  function thSort(label, field, align) {
    var i = f.sort.findIndex(function(s) { return s.field === field; });
    var arrow = i !== -1 ? (f.sort[i].dir === 'asc' ? ' ↑' : ' ↓') : '';
    return '<th class="sortable' + (i !== -1 ? ' active' : '') + '" data-ssort="' + field + '" style="text-align:' + align + '">' + label + arrow + '</th>';
  }

  var rowsHtml = '';
  if (!rows.length) {
    rowsHtml = '<tr><td colspan="9" style="padding:40px;text-align:center" class="muted">No sales match the current filters</td></tr>';
  } else {
    rows.slice(0, 250).forEach(function(s) {
      var pillCls = (statusDefs.find(function(d) { return d.v === s.status; }) || {}).pill || 'pill-gray';
      var name = ((s.firstName||'') + ' ' + (s.lastName||'')).trim();
      var nameHtml = name
        ? '<span class="name-link" data-ckey="' + escapeHtml(String(s.customerKey)) + '">' + escapeHtml(name) + '</span>'
        : '<span class="muted">(no name)</span>';
      var phoneHtml = (s.phones && s.phones.length)
        ? '<span class="mono">' + formatPhone(s.phones[0]) + '</span>' : '<span class="muted">—</span>';
      var dealPill = s.dealType && /lease/i.test(s.dealType)
        ? '<span class="pill pill-purple">Lease</span>'
        : (s.dealType ? '<span class="pill pill-gray">' + escapeHtml(s.dealType) + '</span>' : '');
      rowsHtml +=
        '<tr data-ckey="' + escapeHtml(String(s.customerKey)) + '">' +
        '<td class="mono">' + s.saleDate.toISOString().slice(0,10) + '</td>' +
        '<td>' + nameHtml + '</td>' +
        '<td>' + phoneHtml + '</td>' +
        '<td>' + escapeHtml(s.vehicleLabel || s.vin) + '</td>' +
        '<td class="mono">' + escapeHtml(s.vin.slice(-6)) + '</td>' +
        '<td><span class="pill ' + pillCls + '">' + s.status + '</span></td>' +
        '<td>' + dealPill + '</td>' +
        '<td>' + escapeHtml((s.customerCategory||'').replace('Home-grown — ', '')) + '</td>' +
        '</tr>';
    });
  }

  var html = '<div class="card">' +
    '<div class="card-header">' +
      '<h2>Sales History</h2>' +
      '<span class="label">' + rows.length.toLocaleString() + ' of ' + r.salesHistory.length.toLocaleString() + ' sale events</span>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn-sm" id="btn-sh-clear">Clear filters</button>' +
    '</div>' +
    '<div class="filter-panel">' +
      '<div class="filter-row">' +
        '<span class="filter-label">Search</span>' +
        inp('vin','VIN',140) + inp('phone','Phone',130) + inp('email','Email',180) +
        inp('first','First name',130) + inp('last','Last name',130) +
      '</div>' +
      (makeOpts.length  ? '<div class="filter-row"><span class="filter-label">Make</span>'  + makeOpts.map(function(o)  { return chip('makes', o.value, o.value, o.count); }).join(' ')  + '</div>' : '') +
      (modelOpts.length ? '<div class="filter-row"><span class="filter-label">Model</span>' + modelOpts.map(function(o) { return chip('models', o.value, o.value, o.count); }).join(' ') + '</div>' : '') +
      (yearOpts.length  ? '<div class="filter-row"><span class="filter-label">Year</span>'  + yearOpts.map(function(o)  { return chip('years', o.value, o.value, o.count); }).join(' ')  + '</div>' : '') +
      '<div class="filter-row"><span class="filter-label">Status</span>' + statusChips + '</div>' +
      '<div class="filter-row"><span class="filter-label">Category</span>' + catChips + '</div>' +
      dateRow('Sale Date', 'saleFrom', 'saleTo') +
    '</div>' +
    '<div class="table-wrap"><table class="tbl">' +
      '<thead><tr>' +
        thSort('Sale Date', 'saleDate', 'left') +
        '<th>Buyer</th><th>Phone</th><th>Vehicle</th><th>VIN</th><th>Status</th><th>Deal Type</th><th>Category</th>' +
      '</tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody>' +
      (rows.length > 250 ? '<tfoot><tr><td colspan="9">Showing first 250 of ' + rows.length.toLocaleString() + '</td></tr></tfoot>' : '') +
    '</table></div>' +
    '<div style="padding:14px 20px;background:#FFFBEB;color:#92400E;font-size:11.5px;border-top:1px solid #FCD34D">' +
      '<strong>Note for engineering:</strong> "Defected" status is sourced from the data-provider feed in production — not engine-inferred. This demo only shows the three engine-derived statuses.' +
    '</div>' +
  '</div>';

  host.innerHTML = html;

  host.querySelectorAll('input.filter-input').forEach(function(input) {
    var t;
    input.addEventListener('input', function() {
      f[input.getAttribute('data-sfld')] = input.value;
      clearTimeout(t);
      t = setTimeout(function() { App.renderAll(); }, 160);
    });
  });
  host.querySelectorAll('input.date-input').forEach(function(input) {
    input.addEventListener('change', function() {
      f[input.getAttribute('data-sfld')] = input.value;
      App.renderAll();
    });
  });
  host.querySelectorAll('.chip').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var g = btn.getAttribute('data-sgroup');
      var v = btn.getAttribute('data-svalue');
      var arr = f[g];
      if (!arr) return;
      var i = arr.indexOf(v);
      if (i === -1) arr.push(v); else arr.splice(i, 1);
      App.renderAll();
    });
  });
  host.querySelectorAll('.tbl thead th.sortable').forEach(function(th) {
    th.addEventListener('click', function() {
      var field = th.getAttribute('data-ssort');
      var i = f.sort.findIndex(function(s) { return s.field === field; });
      if (i === 0 && f.sort.length === 1) f.sort[0].dir = f.sort[0].dir === 'asc' ? 'desc' : 'asc';
      else f.sort = [{ field: field, dir: 'desc' }];
      App.renderAll();
    });
  });
  host.querySelectorAll('.tbl tbody tr').forEach(function(tr) {
    tr.addEventListener('click', function() { Detail.open(tr.getAttribute('data-ckey')); });
  });
  host.querySelector('#btn-sh-clear').addEventListener('click', function() {
    App.state.salesHistoryFilters = {
      vin:'',phone:'',email:'',first:'',last:'',
      statuses:[],categories:[],makes:[],models:[],years:[],
      saleFrom:'',saleTo:'',
      sort: [{ field: 'saleDate', dir: 'desc' }]
    };
    App.renderAll();
  });
}

function applySalesHistoryFilters(rows, f) {
  var fVin = normAlnum(f.vin), fPhone = normDigits(f.phone);
  var fEmail = (f.email||'').toLowerCase().trim();
  var fFirst = (f.first||'').toLowerCase().trim();
  var fLast  = (f.last ||'').toLowerCase().trim();

  function inRange(d, from, to) {
    if (!from && !to) return true;
    if (!d) return false;
    var t = d instanceof Date ? d.getTime() : new Date(d).getTime();
    if (from) { var ft = new Date(from + 'T00:00:00').getTime(); if (t < ft) return false; }
    if (to)   { var tt = new Date(to + 'T23:59:59').getTime();   if (t > tt) return false; }
    return true;
  }

  return rows.filter(function(s) {
    if (fVin && normAlnum(s.vin).indexOf(fVin) === -1) return false;
    if (fPhone && !(s.phones||[]).some(function(p){ return normDigits(p).indexOf(fPhone) !== -1; })) return false;
    if (fEmail && !(s.emails||[]).some(function(e){ return String(e).toLowerCase().indexOf(fEmail) !== -1; })) return false;
    if (fFirst && String(s.firstName||'').toLowerCase().indexOf(fFirst) === -1) return false;
    if (fLast  && String(s.lastName ||'').toLowerCase().indexOf(fLast)  === -1) return false;
    if (f.statuses.length   && f.statuses.indexOf(s.status) === -1) return false;
    if (f.categories.length && f.categories.indexOf(s.customerCategory) === -1) return false;
    if (f.makes.length  && !f.makes.some(function(v) { return normVehVal(v) === normVehVal(s.vehicleMake); }))   return false;
    if (f.models.length && !f.models.some(function(v) { return normVehVal(v) === normVehVal(s.vehicleModel); })) return false;
    if (f.years.length  && !f.years.some(function(v) { return normVehVal(v) === normVehVal(s.vehicleYear); }))   return false;
    if (!inRange(s.saleDate, f.saleFrom, f.saleTo)) return false;
    return true;
  });
}
