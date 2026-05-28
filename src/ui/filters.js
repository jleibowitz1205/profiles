// ===========================================================================
//  PROFILES — UI: filter panel for the Currently Owned table
//  Per-field search + multi-select chips + date ranges.
// ===========================================================================

function renderFilterPanel(filteredRows, allRows, f) {
  // Counts respect OTHER active facets (so chip numbers stay honest)
  function countWithoutFacet(facetName) {
    return allRows.filter(function(c) {
      var fVin = normAlnum(f.vin), fPhone = normDigits(f.phone);
      var fEmail = (f.email||'').toLowerCase().trim();
      var fFirst = (f.first||'').toLowerCase().trim();
      var fLast  = (f.last ||'').toLowerCase().trim();
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

      if (facetName !== 'makes'  && f.makes.length  && !f.makes.some(function(v)  { return normVehVal(v) === normVehVal(c.vehicleMake); }))   return false;
      if (facetName !== 'models' && f.models.length && !f.models.some(function(v) { return normVehVal(v) === normVehVal(c.vehicleModel); })) return false;
      if (facetName !== 'years'  && f.years.length  && !f.years.some(function(v)  { return normVehVal(v) === normVehVal(c.vehicleYear); }))   return false;

      if (facetName !== 'buckets'    && f.buckets.length    && f.buckets.indexOf(c.timeBucket) === -1)    return false;
      if (facetName !== 'categories' && f.categories.length && f.categories.indexOf(c.customerCategory) === -1) return false;
      if (facetName !== 'confidence' && f.confidence.length && f.confidence.indexOf(c.mergeConfidence) === -1) return false;
      if (facetName !== 'flags'      && f.flags.length      && !f.flags.some(function(g) { return customerHasFlag(c, g); })) return false;
      return true;
    });
  }

  var pools = {
    buckets:    countWithoutFacet('buckets'),
    categories: countWithoutFacet('categories'),
    confidence: countWithoutFacet('confidence'),
    flags:      countWithoutFacet('flags'),
    makes:      countWithoutFacet('makes'),
    models:     countWithoutFacet('models'),
    years:      countWithoutFacet('years')
  };

  function chip(group, value, label, count) {
    var active = (f[group] || []).indexOf(value) !== -1;
    var dim = (count === 0 && !active) ? ' dim' : '';
    return '<button class="chip' + (active ? ' active' : '') + dim + '" data-group="' + group + '" data-value="' + escapeHtml(value) + '">' +
           label + (count !== undefined ? ' <span class="ct">' + count + '</span>' : '') +
           '</button>';
  }

  function inp(name, ph, w) {
    return '<input class="filter-input" data-fld="' + name + '" placeholder="' + ph + '" ' +
           'value="' + escapeHtml(f[name] || '') + '" style="width:' + w + 'px" />';
  }

  function vehicleChipRow(group, options) {
    var label = group === 'makes' ? 'Make' : group === 'models' ? 'Model' : 'Year';
    var html = options.map(function(o) { return chip(group, o.value, o.value, o.count); }).join(' ');
    return '<div class="filter-row"><span class="filter-label">' + label + '</span>' + html + '</div>';
  }

  function vehicleOptions(pool, key) {
    var counts = {};
    var fk = key === 'make' ? 'vehicleMake' : key === 'model' ? 'vehicleModel' : 'vehicleYear';
    pool.forEach(function(c) {
      var v = normVehVal(c[fk]);
      if (!v) return;
      counts[v] = (counts[v] || 0) + 1;
    });
    var arr = Object.keys(counts).map(function(k) { return { value: k, count: counts[k] }; });
    if (key === 'year') {
      arr.sort(function(a, b) { return parseInt(b.value) - parseInt(a.value); });
    } else {
      arr.sort(function(a, b) { return b.count - a.count; });
    }
    return arr.slice(0, 10);
  }

  var makeOpts  = vehicleOptions(pools.makes,  'make');
  var modelOpts = vehicleOptions(pools.models, 'model');
  var yearOpts  = vehicleOptions(pools.years,  'year');

  var bucketHtml = BUCKETS.map(function(b) {
    var ct = pools.buckets.filter(function(c) { return c.timeBucket === b.key; }).length;
    return chip('buckets', b.key, b.dot + ' ' + b.label, ct);
  }).join(' ');

  var catDefs = [
    { v: 'Home-grown — Repeat',     l: '🏡 Home-grown Repeat' },
    { v: 'Home-grown — First-time', l: '🏡 Home-grown First-time' },
    { v: 'Adopted',                 l: '🤝 Adopted' }
  ];
  var catHtml = catDefs.map(function(d) {
    var ct = pools.categories.filter(function(c) { return c.customerCategory === d.v; }).length;
    return chip('categories', d.v, d.l, ct);
  }).join(' ');

  var flagDefs = [
    'Stopped Servicing', 'Post-trade Owner', 'Confirmed Lease', 'Likely Lease',
    'Possible Duplicate', 'High Volume', 'Phone Drift', 'Email Drift'
  ];
  var flagHtml = flagDefs.map(function(g) {
    var ct = pools.flags.filter(function(c) { return customerHasFlag(c, g); }).length;
    return chip('flags', g, g, ct);
  }).join(' ');

  function dateRow(labelTxt, fromKey, toKey) {
    return '<div class="filter-row"><span class="filter-label">' + labelTxt + '</span>' +
      '<input type="date" class="date-input" data-fld="' + fromKey + '" value="' + (f[fromKey]||'') + '" />' +
      '<span class="muted">to</span>' +
      '<input type="date" class="date-input" data-fld="' + toKey + '" value="' + (f[toKey]||'') + '" />' +
      '</div>';
  }

  return '<div class="filter-panel">' +
    '<div class="filter-row">' +
      '<span class="filter-label">Search</span>' +
      inp('vin', 'VIN', 140) +
      inp('phone', 'Phone', 130) +
      inp('email', 'Email', 180) +
      inp('first', 'First name', 130) +
      inp('last', 'Last name', 130) +
    '</div>' +
    (makeOpts.length  ? '<div class="filter-row"><span class="filter-label">Make</span>'  + makeOpts.map(function(o)  { return chip('makes',  o.value, o.value, o.count); }).join(' ')  + '</div>' : '') +
    (modelOpts.length ? '<div class="filter-row"><span class="filter-label">Model</span>' + modelOpts.map(function(o) { return chip('models', o.value, o.value, o.count); }).join(' ') + '</div>' : '') +
    (yearOpts.length  ? '<div class="filter-row"><span class="filter-label">Year</span>'  + yearOpts.map(function(o)  { return chip('years',  o.value, o.value, o.count); }).join(' ')  + '</div>' : '') +
    '<div class="filter-row"><span class="filter-label">Bucket</span>' + bucketHtml + '</div>' +
    '<div class="filter-row"><span class="filter-label">Category</span>' + catHtml + '</div>' +
    '<div class="filter-row"><span class="filter-label">Flags</span>' + flagHtml + '</div>' +
    dateRow('Last Activity', 'activityFrom', 'activityTo') +
    dateRow('Last Sale',     'saleFrom',     'saleTo') +
    dateRow('Last Service',  'serviceFrom',  'serviceTo') +
  '</div>';
}

function wireFilterPanel(host, f) {
  var debounceTimer = null;
  var lastTyped = null;
  host.querySelectorAll('input.filter-input').forEach(function(input) {
    input.addEventListener('input', function() {
      var name = input.getAttribute('data-fld');
      f[name] = input.value;
      lastTyped = name;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function() {
        App.renderAll();
        // Restore focus + cursor
        var el = document.querySelector('input[data-fld="' + lastTyped + '"]');
        if (el) { el.focus(); var v = el.value; el.setSelectionRange(v.length, v.length); }
      }, 160);
    });
  });
  host.querySelectorAll('input.date-input').forEach(function(input) {
    input.addEventListener('change', function() {
      f[input.getAttribute('data-fld')] = input.value;
      App.renderAll();
    });
  });
  host.querySelectorAll('.chip').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var g = btn.getAttribute('data-group');
      var v = btn.getAttribute('data-value');
      var arr = f[g];
      if (!arr) return;
      var i = arr.indexOf(v);
      if (i === -1) arr.push(v); else arr.splice(i, 1);
      App.renderAll();
    });
  });
}
