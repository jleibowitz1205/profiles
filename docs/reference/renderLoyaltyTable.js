// ===========================================================================
// Extracted from index.html (Convergence List Hygiene Tool - Apps Script v2)
// Functions: renderLoyaltyTable
// ===========================================================================

function renderLoyaltyTable(bucketRequest) {
  var result = pipelinesState.loyaltyResult;
  if (!result) return;

  // Initialize filter state if needed — multi-select facets across the board
  if (!pipelinesState.loyaltyFilters) {
    pipelinesState.loyaltyFilters = {
      vin:'', phone:'', email:'', first:'', last:'',
      buckets:    [],
      categories: [],
      flags:      [],
      confidence: [],
      makes:      [],
      models:     [],
      years:      [],
      // Date-range filters — strings in YYYY-MM-DD format, empty = no constraint
      activityFrom:'', activityTo:'',
      saleFrom:'',     saleTo:'',
      serviceFrom:'',  serviceTo:'',
      // Multi-sort chain — array of {field, dir}, evaluated in order
      sort: [{ field:'lastActivityDate', dir:'desc' }]
    };
  }

  // Backward-compat: if caller passed a single bucket name (legacy callers), TOGGLE it in the buckets set
  if (typeof bucketRequest === 'string' && bucketRequest) {
    var idx = pipelinesState.loyaltyFilters.buckets.indexOf(bucketRequest);
    if (idx === -1) pipelinesState.loyaltyFilters.buckets.push(bucketRequest);
    else pipelinesState.loyaltyFilters.buckets.splice(idx, 1);
  }

  var f = pipelinesState.loyaltyFilters;
  // Ensure all facet arrays/fields exist (for older state objects)
  f.makes  = f.makes  || [];
  f.models = f.models || [];
  f.years  = f.years  || [];
  if (!('activityFrom' in f)) { f.activityFrom = ''; f.activityTo = ''; f.saleFrom = ''; f.saleTo = ''; f.serviceFrom = ''; f.serviceTo = ''; }
  if (!f.sort || !f.sort.length) f.sort = [{ field:'lastActivityDate', dir:'desc' }];

  // ── Apply filters ──────────────────────────────────────────────────────────
  // The table now operates on per-(customer, current-VIN) target rows.
  // Each "row" (c here) carries a single vehicle's year/make/model/vin.
  // Vehicle facets match THIS row's vehicle (not "any of the customer's vehicles").
  function normDigits(s){ return String(s||'').replace(/\D/g,''); }
  function normAlnum(s){ return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
  function normVehVal(s){ return String(s||'').trim().toUpperCase(); }

  var fVin   = normAlnum(f.vin);
  var fPhone = normDigits(f.phone);
  var fEmail = (f.email||'').toLowerCase().trim();
  var fFirst = (f.first||'').toLowerCase().trim();
  var fLast  = (f.last||'').toLowerCase().trim();
  // Vehicle facets — pre-normalize selected values for fast matching
  var fMakeSet  = {}; (f.makes  ||[]).forEach(function(v){ fMakeSet[normVehVal(v)]  = true; });
  var fModelSet = {}; (f.models ||[]).forEach(function(v){ fModelSet[normVehVal(v)] = true; });
  var fYearSet  = {}; (f.years  ||[]).forEach(function(v){ fYearSet[normVehVal(v)]  = true; });
  var hasMakeFilter  = (f.makes  ||[]).length > 0;
  var hasModelFilter = (f.models ||[]).length > 0;
  var hasYearFilter  = (f.years  ||[]).length > 0;

  function customerHasFlag(c, flag) {
    // Use per-row flags when this is a target row (from the per-tenure explosion);
    // fall back to customer-level flags otherwise.
    var hasPerRow = c.rowStoppedServicing !== undefined;
    switch(flag) {
      case 'Stopped Servicing':
        return hasPerRow ? !!c.rowStoppedServicing : ((c.lostFromNetwork||[]).length > 0);
      case 'Post-trade Owner':
        return hasPerRow ? !!c.rowPostTradeOwner : !!c.isPostTradeOwner;
      case 'Likely Lease':
        return hasPerRow ? (!!c.rowLikelyLease && !c.rowConfirmedLease) : (!!c.likelyLeaseReturn && !c.hasLeaseDealType);
      case 'Confirmed Lease':
        return hasPerRow ? !!c.rowConfirmedLease : !!c.hasLeaseDealType;
      case 'Possible Duplicate':  return c.mergeConfidence === 'Possible Duplicate';
      case 'High Volume':         return c.numSales > 20 || c.numServices > 100;
      default: return false;
    }
  }

  // Vehicle facet matcher — now checks THIS row's vehicle directly (not any-vehicle).
  // Rows without a current vehicle (target.isCurrentVehicle === false) fail
  // vehicle facets unless no vehicle facet is active.
  function rowMatchesVehicleFacets(c) {
    if (!hasMakeFilter && !hasModelFilter && !hasYearFilter) return true;
    if (!c.isCurrentVehicle) return false;
    if (hasMakeFilter  && !fMakeSet[normVehVal(c.vehicleMake)])   return false;
    if (hasModelFilter && !fModelSet[normVehVal(c.vehicleModel)]) return false;
    if (hasYearFilter  && !fYearSet[normVehVal(c.vehicleYear)])   return false;
    return true;
  }

  // Source: per-(customer, current-VIN) target rows from result.targets
  var sourceRows = result.targets || result.customers;  // fallback to customers if targets missing

  // bucketCustomers: filter by time bucket (empty array = all buckets)
  var bucketCustomers = sourceRows.filter(function(c){
    if (f.buckets.length === 0) return true;
    return f.buckets.indexOf(c.timeBucket) !== -1;
  });

  var filtered = bucketCustomers.filter(function(c){
    if (fVin) {
      // VIN search: match THIS row's VIN first (the current one), but also fall back
      // to searching across the customer's other VINs (previous/lost) so old-history
      // searches still work
      var rowVinMatch = normAlnum(c.vin || '').indexOf(fVin) !== -1;
      if (!rowVinMatch) {
        var cust = c._customer || {};
        var allVins = [].concat(cust.currentlyOwns||[], cust.previouslyOwned||[], cust.lostFromNetwork||[]);
        if (!allVins.some(function(v){ return normAlnum(v).indexOf(fVin) !== -1; })) return false;
      }
    }
    if (fPhone) {
      if (!(c.phones||[]).some(function(p){ return normDigits(p).indexOf(fPhone) !== -1; })) return false;
    }
    if (fEmail) {
      if (!(c.emails||[]).some(function(e){ return String(e).toLowerCase().indexOf(fEmail) !== -1; })) return false;
    }
    if (fFirst) {
      if (String(c.firstName||'').toLowerCase().indexOf(fFirst) === -1) return false;
    }
    if (fLast) {
      if (String(c.lastName||'').toLowerCase().indexOf(fLast) === -1) return false;
    }
    if (!rowMatchesVehicleFacets(c)) return false;
    // Category facet
    if (f.categories.length > 0 && f.categories.indexOf(c.customerCategory) === -1) return false;
    // Confidence facet
    if (f.confidence.length > 0 && f.confidence.indexOf(c.mergeConfidence) === -1) return false;
    // Flags facet — multi-select within group is OR
    if (f.flags.length > 0) {
      var hasAnySelectedFlag = f.flags.some(function(flagName){ return customerHasFlag(c, flagName); });
      if (!hasAnySelectedFlag) return false;
    }
    // Date range facets
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
    if (!inRange(c.lastActivityDate, f.activityFrom, f.activityTo)) return false;
    if (!inRange(c.lastSaleDate,     f.saleFrom,     f.saleTo))     return false;
    if (!inRange(c.lastServiceDate,  f.serviceFrom,  f.serviceTo))  return false;
    return true;
  });

  // ── Apply multi-sort chain ────────────────────────────────────────────────
  function sortKeyValue(c, field) {
    var v = c[field];
    if (v instanceof Date) return v.getTime();
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      var t = new Date(v).getTime();
      return isNaN(t) ? v.toLowerCase() : t;
    }
    return v;
  }
  if (f.sort && f.sort.length) {
    filtered.sort(function(a, b){
      for (var i = 0; i < f.sort.length; i++) {
        var s = f.sort[i];
        var av = sortKeyValue(a, s.field);
        var bv = sortKeyValue(b, s.field);
        // null/empty sorts to bottom regardless of direction
        if (av == null && bv == null) continue;
        if (av == null) return 1;
        if (bv == null) return -1;
        var cmp = av < bv ? -1 : av > bv ? 1 : 0;
        if (cmp !== 0) return s.dir === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  }

  // Highlight active buckets (multi-select)
  document.querySelectorAll('#pipelines-buckets .loyalty-bucket').forEach(function(card){
    if (f.buckets.indexOf(card.getAttribute('data-bucket')) !== -1) {
      card.style.outline = '3px solid var(--electric)';
      card.style.outlineOffset = '2px';
    } else {
      card.style.outline = '';
      card.style.outlineOffset = '';
    }
  });

  // Update the result-table label — show filter state when active
  var labelEl = document.getElementById('pipelines-table-label');
  var hasTextFilter = fVin || fPhone || fEmail || fFirst || fLast;
  var hasDateFilter = f.activityFrom || f.activityTo || f.saleFrom || f.saleTo || f.serviceFrom || f.serviceTo;
  var hasFacetFilter = (f.buckets||[]).length || (f.categories||[]).length || (f.flags||[]).length || (f.confidence||[]).length ||
                       hasMakeFilter || hasModelFilter || hasYearFilter || hasDateFilter;
  var hasFilter = hasTextFilter || hasFacetFilter;
  var totalCustomers = result.customers.length;
  var labelText;
  if (hasFilter) {
    var bucketSummary;
    if (f.buckets.length === 0) {
      bucketSummary = 'All buckets';
    } else if (f.buckets.length === 1) {
      bucketSummary = f.buckets[0];
    } else {
      bucketSummary = f.buckets.length + ' buckets';
    }
    labelText = bucketSummary + ' — ' + filtered.length.toLocaleString() + ' of ' + totalCustomers.toLocaleString() + ' (filtered)';
  } else {
    labelText = 'All customers — ' + totalCustomers.toLocaleString();
  }
  if (labelEl) labelEl.textContent = labelText;

  // Replace the standard export button with our facet-aware one.
  // The button has an inline onclick="openPipelinesExportModal()" attribute — we
  // strip it explicitly because setting .onclick doesn't always win against the attribute.
  var exportBtn = document.querySelector('#step-pipelines .btn-success');
  if (exportBtn) {
    exportBtn.textContent = '↓ Export ' + (hasFilter ? 'filtered (' + filtered.length.toLocaleString() + ')' : 'all');
    exportBtn.removeAttribute('onclick');
    exportBtn.onclick = function(ev){
      if (ev && ev.preventDefault) ev.preventDefault();
      try {
        openLoyaltyExportModal(filtered, hasFilter);
      } catch(e) {
        console.error('[Loyalty Timeline export]', e);
        notify('Export failed: ' + e.message, 'error');
      }
    };
  }

  // Customize the sort dropdown for Loyalty Timeline — covers Last Sale and Last Service
  // (those aren't visible columns so they need a way in)
  var sortCol = document.getElementById('pipelines-sort-col');
  var sortDir = document.getElementById('pipelines-sort-dir');
  if (sortCol && sortCol.parentNode) {
    sortCol.parentNode.style.display = '';   // re-show
    var primarySort = (f.sort && f.sort[0]) || { field:'lastActivityDate', dir:'desc' };
    var sortOpts = [
      { v:'lastActivityDate',  l:'Last Activity' },
      { v:'lastSaleDate',      l:'Last Sale Date' },
      { v:'lastServiceDate',   l:'Last Service Date' },
      { v:'numSales',          l:'# Sales' },
      { v:'numServices',       l:'# Services' },
      { v:'daysSinceLastInteraction', l:'Days Since Last Interaction' },
      { v:'lastName',          l:'Last Name (A→Z)' }
    ];
    sortCol.innerHTML = sortOpts.map(function(o){
      var sel = primarySort.field === o.v ? ' selected' : '';
      return '<option value="' + o.v + '"' + sel + '>Sort: ' + o.l + '</option>';
    }).join('');
    sortCol.onchange = function(){
      var newField = sortCol.value;
      pipelinesState.loyaltyFilters.sort[0] = { field: newField, dir: primarySort.dir };
      renderLoyaltyTable();
    };
    if (sortDir) {
      sortDir.textContent = primarySort.dir === 'asc' ? '↑ ASC' : '↓ DESC';
      sortDir.onclick = function(){
        var s = pipelinesState.loyaltyFilters.sort[0];
        s.dir = s.dir === 'asc' ? 'desc' : 'asc';
        renderLoyaltyTable();
      };
    }
  }

  // Hide the standard "more rows" notice
  var moreRows = document.getElementById('pipelines-more-rows');
  if (moreRows) moreRows.classList.add('hidden');

  // ── Render per-field search bar above the table ────────────────────────────
  var tableEl = document.getElementById('pipelines-table');
  if (!tableEl) return;
  var tableContainer = tableEl.closest('.table-wrap');
  var resultsCard = tableContainer ? tableContainer.parentNode : null;

  // Remove any existing search bar so we don't dupe on re-render
  var existingBar = document.getElementById('loyalty-search-bar');
  if (existingBar) existingBar.remove();

  if (resultsCard && tableContainer) {
    var searchBar = document.createElement('div');
    searchBar.id = 'loyalty-search-bar';
    searchBar.style.cssText = 'padding:12px 16px;border-bottom:1px solid var(--gray-100);background:var(--gray-50)';

    function inp(name, placeholder, width, value){
      return '<input type="text" data-lf="' + name + '" placeholder="' + placeholder + '" value="' + (value||'').replace(/"/g,'&quot;') + '" ' +
             'style="font-size:12px;padding:5px 10px;border:1.5px solid var(--gray-200);border-radius:6px;width:' + width + 'px;background:white" />';
    }

    // ── Chip rendering ────────────────────────────────────────────────────────
    function chip(groupName, value, label, count) {
      var isActive = (f[groupName]||[]).indexOf(value) !== -1;
      var bg = isActive ? '#5E10BC' : '#fff';
      var color = isActive ? '#fff' : 'var(--gray-700)';
      var border = isActive ? '#5E10BC' : 'var(--gray-200)';
      var fw = isActive ? '700' : '500';
      var dim = (count === 0 && !isActive) ? 'opacity:.4;' : '';
      return '<button class="loyalty-chip" data-group="' + groupName + '" data-value="' + String(value).replace(/"/g,'&quot;') + '" ' +
        'style="font-size:11px;padding:4px 10px;border:1.5px solid ' + border + ';background:' + bg + ';color:' + color + ';' +
        'border-radius:14px;cursor:pointer;font-weight:' + fw + ';' + dim + 'white-space:nowrap;transition:all .12s">' +
        label + (count !== undefined ? ' <span style="opacity:.7;font-weight:500">' + count + '</span>' : '') +
        '</button>';
    }

    // Compute counts for each chip option, RESPECTING all OTHER filters (true faceted counts).
    // For each chip, simulate "what would the count be if I were to toggle this on, holding other facets constant"
    function inRangeChip(d, fromStr, toStr) {
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
    function countWithoutFacet(facetName) {
      return (result.targets || result.customers).filter(function(c){
        if (fVin) {
          var rowVinMatch = normAlnum(c.vin || '').indexOf(fVin) !== -1;
          if (!rowVinMatch) {
            var cust = c._customer || {};
            var allVins = [].concat(cust.currentlyOwns||[], cust.previouslyOwned||[], cust.lostFromNetwork||[]);
            if (!allVins.some(function(v){ return normAlnum(v).indexOf(fVin) !== -1; })) return false;
          }
        }
        if (fPhone) {
          if (!(c.phones||[]).some(function(p){ return normDigits(p).indexOf(fPhone) !== -1; })) return false;
        }
        if (fEmail) {
          if (!(c.emails||[]).some(function(e){ return String(e).toLowerCase().indexOf(fEmail) !== -1; })) return false;
        }
        if (fFirst && String(c.firstName||'').toLowerCase().indexOf(fFirst) === -1) return false;
        if (fLast  && String(c.lastName||'').toLowerCase().indexOf(fLast) === -1) return false;

        // Vehicle facets — now per-row's own vehicle. When computing counts FOR a
        // specific vehicle facet, exclude it but still apply OTHER vehicle facets.
        if (facetName !== 'makes'  && hasMakeFilter  && !fMakeSet[normVehVal(c.vehicleMake)])   return false;
        if (facetName !== 'models' && hasModelFilter && !fModelSet[normVehVal(c.vehicleModel)]) return false;
        if (facetName !== 'years'  && hasYearFilter  && !fYearSet[normVehVal(c.vehicleYear)])   return false;

        if (facetName !== 'buckets'    && f.buckets.length    > 0 && f.buckets.indexOf(c.timeBucket) === -1)    return false;
        if (facetName !== 'categories' && f.categories.length > 0 && f.categories.indexOf(c.customerCategory) === -1) return false;
        if (facetName !== 'confidence' && f.confidence.length > 0 && f.confidence.indexOf(c.mergeConfidence) === -1) return false;
        if (facetName !== 'flags'      && f.flags.length      > 0) {
          if (!f.flags.some(function(flg){ return customerHasFlag(c, flg); })) return false;
        }
        // Date range filters — chip counts must reflect these or they lie about what
        // will actually match. Date facets aren't toggle-able from chips, so we
        // always apply them when active (not exempted by facetName).
        if (!inRangeChip(c.lastActivityDate, f.activityFrom, f.activityTo)) return false;
        if (!inRangeChip(c.lastSaleDate,     f.saleFrom,     f.saleTo))     return false;
        if (!inRangeChip(c.lastServiceDate,  f.serviceFrom,  f.serviceTo))  return false;
        return true;
      });
    }

    var bucketPool   = countWithoutFacet('buckets');
    var categoryPool = countWithoutFacet('categories');
    var confPool     = countWithoutFacet('confidence');
    var flagPool     = countWithoutFacet('flags');
    var makePool     = countWithoutFacet('makes');
    var modelPool    = countWithoutFacet('models');
    var yearPool     = countWithoutFacet('years');

    // DEBUG — log the filter state and resulting pool sizes so we can see if
    // the date filter is actually being applied. Visible in browser console.
    console.log('[Loyalty Timeline render]',
      'source total:', (result.targets || result.customers).length,
      'filtered:', filtered.length,
      'bucketPool:', bucketPool.length,
      'date filters:', {
        activityFrom: f.activityFrom, activityTo: f.activityTo,
        saleFrom: f.saleFrom, saleTo: f.saleTo,
        serviceFrom: f.serviceFrom, serviceTo: f.serviceTo
      });

    // Build sorted option lists for each vehicle facet (counted within their respective pool)
    // Per-row model now — each target has one vehicle, so count rows that match
    function vehicleOptionList(pool, field) {
      var counts = {};
      var fkey = field === 'make' ? 'vehicleMake' : (field === 'model' ? 'vehicleModel' : 'vehicleYear');
      pool.forEach(function(c){
        var v = normVehVal(c[fkey]);
        if (!v) return;
        counts[v] = (counts[v]||0) + 1;
      });
      var arr = Object.keys(counts).map(function(k){ return { value:k, count:counts[k] }; });
      if (field === 'year') {
        arr.sort(function(a,b){
          var ay = parseInt(a.value,10), by = parseInt(b.value,10);
          if (isNaN(ay)) return 1;
          if (isNaN(by)) return -1;
          return by - ay;  // newest first
        });
      } else {
        arr.sort(function(a,b){
          if (b.count !== a.count) return b.count - a.count;
          return a.value.localeCompare(b.value);
        });
      }
      return arr;
    }

    var makeOptions  = vehicleOptionList(makePool,  'make');
    var modelOptions = vehicleOptionList(modelPool, 'model');
    var yearOptions  = vehicleOptionList(yearPool,  'year');

    function countIn(pool, predicate) {
      var n = 0;
      for (var i = 0; i < pool.length; i++) if (predicate(pool[i])) n++;
      return n;
    }

    var bucketDefs = [
      { v:'Active',              l:'🟣 Active' },
      { v:'Active-Watch',        l:'🟣 Active-Watch' },
      { v:'At Risk',             l:'🟡 At Risk' },
      { v:'High Defection Risk', l:'🟠 High Defection Risk' },
      { v:'Long Gone',           l:'⚫ Long Gone' }
    ];
    var categoryDefs = [
      { v:'Home-grown — Repeat',     l:'🏡 Home-grown Repeat' },
      { v:'Home-grown — First-time', l:'🏡 Home-grown First-time' },
      { v:'Adopted',                 l:'🤝 Adopted' }
    ];
    var flagDefs = [
      { v:'Stopped Servicing',  l:'Stopped Servicing' },
      { v:'Post-trade Owner',   l:'Post-trade Owner' },
      { v:'Confirmed Lease',    l:'Confirmed Lease' },
      { v:'Likely Lease',       l:'Likely Lease' },
      { v:'Possible Duplicate', l:'Possible Duplicate' },
      { v:'High Volume',        l:'⚠ High Volume' }
    ];
    var confidenceDefs = [
      { v:'Merged',             l:'Merged' },
      { v:'Possible Duplicate', l:'Possible Duplicate' }
    ];

    var bucketChipsHtml = bucketDefs.map(function(d){
      return chip('buckets', d.v, d.l, countIn(bucketPool, function(c){ return c.timeBucket === d.v; }));
    }).join(' ');
    var categoryChipsHtml = categoryDefs.map(function(d){
      return chip('categories', d.v, d.l, countIn(categoryPool, function(c){ return c.customerCategory === d.v; }));
    }).join(' ');
    var flagChipsHtml = flagDefs.map(function(d){
      return chip('flags', d.v, d.l, countIn(flagPool, function(c){ return customerHasFlag(c, d.v); }));
    }).join(' ');
    var confidenceChipsHtml = confidenceDefs.map(function(d){
      return chip('confidence', d.v, d.l, countIn(confPool, function(c){ return c.mergeConfidence === d.v; }));
    }).join(' ');

    function chipRow(labelTxt, chipsHtml) {
      return '<div style="display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap">' +
        '<span style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--gray-400);min-width:90px">' + labelTxt + '</span>' +
        chipsHtml +
        '</div>';
    }

    // ── Vehicle multi-select dropdowns (Make / Model / Year) ─────────────────
    function dropdownBtn(key, label, selectedCount) {
      var hasSel = selectedCount > 0;
      var bg = hasSel ? '#5E10BC' : '#fff';
      var color = hasSel ? '#fff' : 'var(--gray-700)';
      var border = hasSel ? '#5E10BC' : 'var(--gray-200)';
      var fw = hasSel ? '700' : '500';
      var labelText = label + (hasSel ? ' · ' + selectedCount : '');
      return '<button class="loyalty-dropdown-btn" data-dropdown="' + key + '" ' +
        'style="font-size:12px;padding:5px 12px;border:1.5px solid ' + border + ';background:' + bg + ';color:' + color + ';' +
        'border-radius:6px;cursor:pointer;font-weight:' + fw + ';white-space:nowrap;display:inline-flex;align-items:center;gap:4px">' +
        labelText + ' <span style="font-size:9px;opacity:.7">▾</span>' +
        '</button>';
    }
    var vehicleDropdownsHtml =
      dropdownBtn('makes',  'Make',  (f.makes||[]).length) +
      ' ' +
      dropdownBtn('models', 'Model', (f.models||[]).length) +
      ' ' +
      dropdownBtn('years',  'Year',  (f.years||[]).length);

    // ── Date-range inputs (Last Activity / Last Sale / Last Service) ─────────
    function dateInp(name, value) {
      return '<input type="date" data-df="' + name + '" value="' + (value||'').replace(/"/g,'&quot;') + '" ' +
             'style="font-size:12px;padding:4px 8px;border:1.5px solid var(--gray-200);border-radius:6px;background:white;color:var(--gray-700)" />';
    }
    function dateRangeRow(labelTxt, fromKey, toKey) {
      var hasVal = f[fromKey] || f[toKey];
      var labelStyle = hasVal
        ? 'font-size:11px;font-weight:700;color:var(--electric);min-width:100px'
        : 'font-size:11px;font-weight:600;color:var(--gray-500);min-width:100px';
      return '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<span style="' + labelStyle + '">' + labelTxt + '</span>' +
        '<span style="font-size:11px;color:var(--gray-400)">From</span>' +
        dateInp(fromKey, f[fromKey]) +
        '<span style="font-size:11px;color:var(--gray-400)">To</span>' +
        dateInp(toKey, f[toKey]) +
        (hasVal ? '<button class="loyalty-date-clear" data-from="' + fromKey + '" data-to="' + toKey + '" style="font-size:11px;background:none;border:none;color:var(--gray-500);cursor:pointer;padding:2px 6px">×</button>' : '') +
        '</div>';
    }
    var dateRangesHtml =
      '<div style="display:flex;gap:6px;align-items:start;margin-top:8px;flex-wrap:wrap">' +
        '<span style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--gray-400);min-width:90px;margin-top:6px">📅 Date Ranges</span>' +
        '<div style="display:flex;flex-direction:column;gap:6px;flex:1">' +
          dateRangeRow('Last Activity', 'activityFrom', 'activityTo') +
          dateRangeRow('Last Sale',     'saleFrom',     'saleTo') +
          dateRangeRow('Last Service',  'serviceFrom',  'serviceTo') +
        '</div>' +
      '</div>';

    searchBar.innerHTML =
      // Text-input row
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
        '<span style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--gray-400);min-width:90px">🔍 Search</span>' +
        inp('vin',   'VIN',        150, f.vin) +
        inp('phone', 'Phone',      130, f.phone) +
        inp('email', 'Email',      180, f.email) +
        inp('first', 'First Name', 120, f.first) +
        inp('last',  'Last Name',  120, f.last) +
        '<button id="loyalty-search-clear" class="btn btn-ghost btn-xs" style="font-size:11px;margin-left:auto">Clear all</button>' +
      '</div>' +
      // Vehicle dropdowns
      chipRow('Vehicle', vehicleDropdownsHtml) +
      // Other facet chip rows
      chipRow('Bucket', bucketChipsHtml) +
      chipRow('Category', categoryChipsHtml) +
      chipRow('Flags', flagChipsHtml) +
      chipRow('Confidence', confidenceChipsHtml) +
      // Date ranges
      dateRangesHtml;
    resultsCard.insertBefore(searchBar, tableContainer);

    // Wire date inputs
    searchBar.querySelectorAll('input[data-df]').forEach(function(input){
      input.addEventListener('change', function(){
        var name = input.getAttribute('data-df');
        pipelinesState.loyaltyFilters[name] = input.value;
        renderLoyaltyTable();
      });
    });
    searchBar.querySelectorAll('.loyalty-date-clear').forEach(function(btn){
      btn.addEventListener('click', function(){
        var fromKey = btn.getAttribute('data-from');
        var toKey   = btn.getAttribute('data-to');
        pipelinesState.loyaltyFilters[fromKey] = '';
        pipelinesState.loyaltyFilters[toKey]   = '';
        renderLoyaltyTable();
      });
    });

    // Wire text-input listeners with debounce
    var debounceTimer = null;
    searchBar.querySelectorAll('input[data-lf]').forEach(function(input){
      input.addEventListener('input', function(){
        var name = input.getAttribute('data-lf');
        pipelinesState.loyaltyFilters[name] = input.value;
        pipelinesState.loyaltyLastTypedField = name;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function(){ renderLoyaltyTable(); }, 150);
      });
    });

    // Wire chip clicks — toggle in/out of the relevant facet array
    searchBar.querySelectorAll('.loyalty-chip').forEach(function(btn){
      btn.addEventListener('click', function(){
        var group = btn.getAttribute('data-group');
        var value = btn.getAttribute('data-value');
        var arr = pipelinesState.loyaltyFilters[group];
        if (!arr) return;
        var idx = arr.indexOf(value);
        if (idx === -1) arr.push(value); else arr.splice(idx, 1);
        renderLoyaltyTable();
      });
    });

    // Wire vehicle dropdowns
    searchBar.querySelectorAll('.loyalty-dropdown-btn').forEach(function(btn){
      btn.addEventListener('click', function(ev){
        ev.stopPropagation();
        var key = btn.getAttribute('data-dropdown');
        var options = key === 'makes' ? makeOptions : key === 'models' ? modelOptions : yearOptions;
        var label   = key === 'makes' ? 'Make'      : key === 'models' ? 'Model'      : 'Year';
        openLoyaltyVehicleDropdown(btn, key, label, options);
      });
    });

    var clearBtn = document.getElementById('loyalty-search-clear');
    if (clearBtn) {
      clearBtn.onclick = function(){
        pipelinesState.loyaltyFilters = {
          vin:'', phone:'', email:'', first:'', last:'',
          buckets:[], categories:[], flags:[], confidence:[],
          makes:[], models:[], years:[],
          activityFrom:'', activityTo:'', saleFrom:'', saleTo:'', serviceFrom:'', serviceTo:'',
          sort: [{ field:'lastActivityDate', dir:'desc' }]
        };
        renderLoyaltyTable();
      };
    }
  }

  // ── Render the table body ──────────────────────────────────────────────────
  if (!filtered.length) {
    tableEl.innerHTML = '<tbody><tr><td style="padding:40px;text-align:center;color:var(--gray-400);font-size:13px">' +
      (hasFilter ? 'No customers match the current filters' : 'No customers') +
      '</td></tr></tbody>';
    return;
  }

  // Helper to render a sortable column header
  function sortableTh(label, field, align, priorityNote) {
    var sortIndex = -1;
    for (var i = 0; i < f.sort.length; i++) if (f.sort[i].field === field) { sortIndex = i; break; }
    var active = sortIndex !== -1;
    var dir = active ? f.sort[sortIndex].dir : '';
    var arrow = active ? (dir === 'asc' ? ' ↑' : ' ↓') : '';
    var rank = (active && f.sort.length > 1) ? '<sup style="font-size:9px;color:var(--electric);font-weight:700;margin-left:2px">' + (sortIndex+1) + '</sup>' : '';
    var color = active ? 'var(--electric)' : 'var(--gray-700)';
    var weight = active ? '700' : '600';
    return '<th class="loyalty-sortable-th" data-sortfield="' + field + '" ' +
      'style="text-align:' + align + ';padding:8px 10px;font-weight:' + weight + ';color:' + color + ';cursor:pointer;user-select:none" ' +
      'title="Click to sort. Shift+click to add as secondary sort.">' + label + arrow + rank + '</th>';
  }

  var html = '<thead><tr>' +
    '<th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--gray-700)">Name</th>' +
    '<th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--gray-700)">Phone</th>' +
    '<th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--gray-700)">Email</th>' +
    '<th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--gray-700)">Category</th>' +
    sortableTh('Sales',         'numSales',         'right') +
    sortableTh('Service',       'numServices',      'right') +
    sortableTh('Last Activity', 'lastActivityDate', 'left') +
    sortableTh('Days Ago',      'daysSinceLastInteraction', 'right') +
    '<th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--gray-700)">Current Vehicle</th>' +
    '<th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--gray-700)">Flags</th>' +
    '</tr></thead><tbody>';

  filtered.slice(0, 200).forEach(function(c, i){
    var name = ((c.firstName || '') + ' ' + (c.lastName || '')).trim() || '<span style="color:var(--gray-300)">(no name)</span>';
    // When phone-filter is active, surface the matching phone first so user sees WHY this row matched
    var displayPhones = (c.phones||[]).slice();
    if (fPhone && displayPhones.length) {
      // Move any matching phones to the front
      var matches = displayPhones.filter(function(p){ return normDigits(p).indexOf(fPhone) !== -1; });
      var nonMatches = displayPhones.filter(function(p){ return normDigits(p).indexOf(fPhone) === -1; });
      displayPhones = matches.concat(nonMatches);
    }
    var phoneTotal = displayPhones.length;
    var phoneHtml = phoneTotal
      ? '<span title="All phones: ' + displayPhones.join(', ') + '">' +
        displayPhones.slice(0,2).map(function(p, pi){
          var isMatch = fPhone && normDigits(p).indexOf(fPhone) !== -1;
          return isMatch ? '<strong style="background:#fef3c7;padding:1px 4px;border-radius:3px">' + p + '</strong>' : p;
        }).join(', ') +
        (phoneTotal > 2 ? ' <span style="color:var(--gray-400);font-size:10px;font-weight:600" title="' + phoneTotal + ' phones total">+' + (phoneTotal-2) + '</span>' : '') +
        '</span>'
      : '<span style="color:var(--gray-300)">—</span>';

    // Same treatment for emails
    var displayEmails = (c.emails||[]).slice();
    if (fEmail && displayEmails.length) {
      var emMatches = displayEmails.filter(function(e){ return String(e).toLowerCase().indexOf(fEmail) !== -1; });
      var emNonMatches = displayEmails.filter(function(e){ return String(e).toLowerCase().indexOf(fEmail) === -1; });
      displayEmails = emMatches.concat(emNonMatches);
    }
    var emailTotal = displayEmails.length;
    var emailHtml = emailTotal
      ? '<span title="All emails: ' + displayEmails.join(', ') + '">' +
        displayEmails.slice(0,1).map(function(e){
          var isMatch = fEmail && String(e).toLowerCase().indexOf(fEmail) !== -1;
          return isMatch ? '<strong style="background:#fef3c7;padding:1px 4px;border-radius:3px">' + e + '</strong>' : e;
        }).join(', ') +
        (emailTotal > 1 ? ' <span style="color:var(--gray-400);font-size:10px;font-weight:600" title="' + emailTotal + ' emails total">+' + (emailTotal-1) + '</span>' : '') +
        '</span>'
      : '<span style="color:var(--gray-300)">—</span>';

    // Vehicle for THIS row — the target carries a single specific vehicle.
    // No more "display all vehicles for this customer" — each row IS one tenure.
    var rowLabel = c.vehicleLabel || '';
    var rowVin   = c.vin || '';
    var vinShort = rowVin ? rowVin.slice(-6) : '';
    var vehHtml;
    if (!rowVin && !rowLabel) {
      vehHtml = '<span style="color:var(--gray-300)">—</span>';
    } else {
      var isVinMatch = fVin && normAlnum(rowVin).indexOf(fVin) !== -1;
      var isVehMatch = (hasMakeFilter || hasModelFilter || hasYearFilter) &&
        (!hasMakeFilter  || fMakeSet[normVehVal(c.vehicleMake)]) &&
        (!hasModelFilter || fModelSet[normVehVal(c.vehicleModel)]) &&
        (!hasYearFilter  || fYearSet[normVehVal(c.vehicleYear)]);
      var fullTitle = (rowLabel || '(unknown)') + ' — ' + rowVin;
      var displayInner = (isVinMatch || isVehMatch)
        ? '<strong style="background:#fef3c7;padding:1px 4px;border-radius:3px">' + (rowLabel || rowVin) + (rowVin ? ' · ' + vinShort : '') + '</strong>'
        : (rowLabel || rowVin) + (rowVin && rowLabel ? '<span style="color:var(--gray-400)"> · ' + vinShort + '</span>' : '');
      vehHtml = '<span title="' + fullTitle.replace(/"/g,'&quot;') + '">' + displayInner + '</span>';
    }
    var lastDate = c.lastActivityDate ? new Date(c.lastActivityDate).toISOString().slice(0,10) : '—';
    var categoryIcon = c.customerCategory && c.customerCategory.indexOf('Home-grown') === 0 ? '🏡' : '🤝';
    var categoryShort = (c.customerCategory||'').replace('Home-grown — ', 'Home-grown ');
    var flagPills = [];
    // Use per-row flags (rowFoo) when present (from the target explosion), falling
    // back to customer-level flags for any legacy callers. The per-row flags only
    // fire on the vehicle that ACTUALLY has the condition — not on every row.
    var hasPerRowFlags = (c.rowStoppedServicing !== undefined);
    var rowPostTrade   = hasPerRowFlags ? c.rowPostTradeOwner   : c.isPostTradeOwner;
    var rowStopped     = hasPerRowFlags ? c.rowStoppedServicing : (c.lostFromNetwork && c.lostFromNetwork.length > 0);
    var rowLikelyLease = hasPerRowFlags ? c.rowLikelyLease      : (c.likelyLeaseReturn && !c.hasLeaseDealType);
    var rowConfLease   = hasPerRowFlags ? c.rowConfirmedLease   : c.hasLeaseDealType;
    if (rowPostTrade)   flagPills.push('<span style="background:#dbeafe;color:#1e40af;padding:1px 6px;border-radius:3px;font-size:10px" title="This vehicle was previously someone else\'s trade-in">Post-trade</span>');
    if (rowStopped)     flagPills.push('<span style="background:#fee2e2;color:#991b1b;padding:1px 6px;border-radius:3px;font-size:10px" title="Vehicle bought here, no trade-back, service stopped 18+ months ago">Stopped Servicing</span>');
    if (rowConfLease)   flagPills.push('<span style="background:#f3e8ff;color:#6b21a8;padding:1px 6px;border-radius:3px;font-size:10px">Lease</span>');
    else if (rowLikelyLease) flagPills.push('<span style="background:#f3e8ff;color:#6b21a8;padding:1px 6px;border-radius:3px;font-size:10px">Likely Lease</span>');
    if (c.mergeConfidence === 'Possible Duplicate') flagPills.push('<span style="background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:3px;font-size:10px">Possible Dup</span>');
    // High volume warning — likely commercial account that slipped through
    if (c.numSales > 20 || c.numServices > 100) {
      flagPills.push('<span style="background:#fef2f2;color:#991b1b;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600" title="Sales=' + c.numSales + ', Services=' + c.numServices + ' — likely commercial account or over-merge">⚠ High Volume</span>');
    }
    // Name becomes the click target — styled as a link, opens the detail panel
    var nameInner = ((c.firstName || '') + ' ' + (c.lastName || '')).trim();
    var nameDisplay = nameInner
      ? '<span class="loyalty-row-open" data-ckey="' + String(c.customerKey).replace(/"/g,'&quot;') + '" ' +
        'style="color:var(--electric);font-weight:600;cursor:pointer;text-decoration:none" ' +
        'onmouseover="this.style.textDecoration=\'underline\'" onmouseout="this.style.textDecoration=\'none\'" ' +
        'title="View full customer detail">' + nameInner + '</span>'
      : '<span class="loyalty-row-open" data-ckey="' + String(c.customerKey).replace(/"/g,'&quot;') + '" ' +
        'style="color:var(--electric);cursor:pointer;font-style:italic" ' +
        'onmouseover="this.style.textDecoration=\'underline\'" onmouseout="this.style.textDecoration=\'none\'" ' +
        'title="View full customer detail">(no name) ›</span>';

    var rowBg = i % 2 ? 'var(--gray-50)' : 'var(--white)';
    html +=
      '<tr class="loyalty-clickable-row" data-ckey="' + String(c.customerKey).replace(/"/g,'&quot;') + '" ' +
      'style="background:' + rowBg + ';cursor:pointer;transition:background .1s" ' +
      'onmouseover="this.style.background=\'#f3f0ff\'" ' +
      'onmouseout="this.style.background=\'' + rowBg + '\'">' +
      '<td style="padding:6px 10px;border-bottom:1px solid var(--gray-100)">' + nameDisplay + '</td>' +
      '<td style="padding:6px 10px;border-bottom:1px solid var(--gray-100);font-family:monospace;font-size:11px">' + phoneHtml + '</td>' +
      '<td style="padding:6px 10px;border-bottom:1px solid var(--gray-100);font-size:11px">' + emailHtml + '</td>' +
      '<td style="padding:6px 10px;border-bottom:1px solid var(--gray-100);font-size:11px">' + categoryIcon + ' ' + categoryShort + '</td>' +
      '<td style="padding:6px 10px;border-bottom:1px solid var(--gray-100);text-align:right">' + c.numSales + '</td>' +
      '<td style="padding:6px 10px;border-bottom:1px solid var(--gray-100);text-align:right">' + c.numServices + '</td>' +
      '<td style="padding:6px 10px;border-bottom:1px solid var(--gray-100);font-family:monospace;font-size:11px">' + lastDate + '</td>' +
      '<td style="padding:6px 10px;border-bottom:1px solid var(--gray-100);text-align:right">' + (c.daysSinceLastInteraction!==null?c.daysSinceLastInteraction:'—') + '</td>' +
      '<td style="padding:6px 10px;border-bottom:1px solid var(--gray-100);font-size:11px">' + vehHtml + '</td>' +
      '<td style="padding:6px 10px;border-bottom:1px solid var(--gray-100)">' + flagPills.join(' ') + '</td>' +
      '</tr>';
  });

  html += '</tbody>';

  if (filtered.length > 200) {
    html += '<tfoot><tr><td colspan="10" style="padding:10px;text-align:center;font-size:11px;color:var(--gray-500);background:var(--gray-50)">Showing first 200 of ' + filtered.length.toLocaleString() + ' &mdash; export to see all</td></tr></tfoot>';
  }

  tableEl.innerHTML = html;

  // Wire name-click → open the detail panel (explicit affordance)
  tableEl.querySelectorAll('.loyalty-row-open').forEach(function(el){
    el.addEventListener('click', function(ev){
      ev.stopPropagation();
      var key = el.getAttribute('data-ckey');
      openLoyaltyDetailPanel(key);
    });
  });

  // Wire row-click → open the detail panel (whole-row affordance).
  // Only fires if the user didn't actually drag/select text — preserves copy-text behavior.
  tableEl.querySelectorAll('.loyalty-clickable-row').forEach(function(tr){
    var mouseDownPos = null;
    tr.addEventListener('mousedown', function(ev){
      mouseDownPos = { x: ev.clientX, y: ev.clientY };
    });
    tr.addEventListener('mouseup', function(ev){
      if (!mouseDownPos) return;
      var dx = Math.abs(ev.clientX - mouseDownPos.x);
      var dy = Math.abs(ev.clientY - mouseDownPos.y);
      mouseDownPos = null;
      if (dx > 4 || dy > 4) return;
      var sel = window.getSelection && window.getSelection();
      if (sel && sel.toString && sel.toString().length > 0) return;
      if (ev.target.closest && ev.target.closest('.loyalty-row-open')) return;
      var key = tr.getAttribute('data-ckey');
      if (key) openLoyaltyDetailPanel(key);
    });
  });

  // Wire sortable column headers
  tableEl.querySelectorAll('.loyalty-sortable-th').forEach(function(th){
    th.addEventListener('click', function(ev){
      var field = th.getAttribute('data-sortfield');
      var sortChain = pipelinesState.loyaltyFilters.sort || [];
      var existingIdx = -1;
      for (var i = 0; i < sortChain.length; i++) if (sortChain[i].field === field) { existingIdx = i; break; }

      if (ev.shiftKey) {
        // Shift+click: add as secondary sort, or toggle direction if already present
        if (existingIdx === -1) {
          sortChain.push({ field: field, dir: 'desc' });
        } else {
          sortChain[existingIdx].dir = sortChain[existingIdx].dir === 'asc' ? 'desc' : 'asc';
        }
      } else {
        // Plain click: replace sort with this column (or toggle direction if it's already primary)
        if (existingIdx === 0 && sortChain.length === 1) {
          sortChain[0].dir = sortChain[0].dir === 'asc' ? 'desc' : 'asc';
        } else {
          var defaultDir = (field === 'lastName') ? 'asc' : 'desc';
          pipelinesState.loyaltyFilters.sort = [{ field: field, dir: defaultDir }];
        }
      }
      renderLoyaltyTable();
    });
  });

  // Restore focus to whichever input was just typed in (renderLoyaltyTable re-creates DOM)
  if (hasFilter) {
    var lastTyped = pipelinesState.loyaltyLastTypedField;
    if (lastTyped) {
      var focusEl = document.querySelector('input[data-lf="' + lastTyped + '"]');
      if (focusEl) {
        focusEl.focus();
        var v = focusEl.value;
        focusEl.setSelectionRange(v.length, v.length);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  LOYALTY TIMELINE — Vehicle Facet Multi-Select Dropdown (Make / Model / Year)
// ─────────────────────────────────────────────────────────────────────────────

