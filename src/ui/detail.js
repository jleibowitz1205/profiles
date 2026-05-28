// ===========================================================================
//  PROFILES — UI: customer detail drawer (side-over)
// ===========================================================================

var Detail = (function() {
  function open(customerKey) {
    var r = App.state.result;
    if (!r) return;
    var c = r.customers.find(function(c) { return String(c.customerKey) === String(customerKey); });
    if (!c) { notify('Customer not found', 'error'); return; }

    var scrim = document.getElementById('scrim');
    var drawer = document.getElementById('drawer');
    drawer.innerHTML = renderDrawer(c);
    scrim.classList.remove('hidden');
    drawer.classList.add('open');
    scrim.classList.add('open');

    drawer.querySelector('.btn-close').addEventListener('click', close);
    scrim.onclick = close;
  }

  function close() {
    var scrim = document.getElementById('scrim');
    var drawer = document.getElementById('drawer');
    drawer.classList.remove('open');
    scrim.classList.remove('open');
    setTimeout(function() { scrim.classList.add('hidden'); }, 200);
  }

  function renderDrawer(c) {
    var bd = bucketDef(c.timeBucket);
    var bucketBadge = bd
      ? '<span class="pill" style="background:' + bd.bg + ';color:' + bd.color + '">' + bd.dot + ' ' + bd.label + '</span>'
      : '<span class="pill pill-gray">Unknown</span>';
    var catBadge = (c.customerCategory || '').indexOf('Home-grown') === 0
      ? '<span class="pill pill-good">🏡 ' + escapeHtml(c.customerCategory.replace('Home-grown — ','Home-grown ')) + '</span>'
      : '<span class="pill pill-info">🤝 ' + escapeHtml(c.customerCategory || 'Adopted') + '</span>';
    var confBadge = c.mergeConfidence === 'Possible Duplicate'
      ? '<span class="pill pill-warn" title="' + escapeHtml(c.duplicateReason || '') + '">Possible Duplicate</span>'
      : '';

    function vehicleBlock(v, status) {
      var flagPills = '';
      if (status === 'Stopped Servicing') flagPills += '<span class="pill pill-danger">Stopped Servicing</span> ';
      if (status === 'Traded Back')       flagPills += '<span class="pill pill-warn">Traded Back</span> ';
      var vf = (c.vinFlags || {})[v.vin] || {};
      if (vf.postTradeOwner) flagPills += '<span class="pill pill-info">Post-trade</span> ';
      if (vf.confirmedLease) flagPills += '<span class="pill pill-purple">Lease</span> ';
      else if (vf.likelyLease) flagPills += '<span class="pill pill-purple">Likely Lease</span> ';
      return '<div class="vehicle-block">' +
        '<div class="vehicle-name">' + escapeHtml(v.label || v.vin) + '</div>' +
        '<div class="vehicle-vin">' + escapeHtml(v.vin) + '</div>' +
        '<div class="vehicle-meta">' +
          (v.saleDate        ? '<span>Sold ' + v.saleDate.toISOString().slice(0,10) + '</span>' : '') +
          (v.lastServiceDate ? '<span>Last service ' + v.lastServiceDate.toISOString().slice(0,10) + '</span>' : '') +
        '</div>' +
        (flagPills ? '<div style="margin-top:8px">' + flagPills + '</div>' : '') +
      '</div>';
    }

    var currentBlocks = (c.currentVehicles || []).map(function(v) { return vehicleBlock(v, 'Current'); }).join('');
    var lostBlocks    = (c.lostVehicles    || []).map(function(v) { return vehicleBlock(v, 'Stopped Servicing'); }).join('');
    var prevBlocks    = (c.previousVehicles|| []).map(function(v) { return vehicleBlock(v, 'Traded Back'); }).join('');

    // Timeline: most recent 18 events
    var events = (c.events || []).slice().sort(function(a, b) { return b.date - a.date; }).slice(0, 18);
    var timelineHtml = events.map(function(e) {
      var typ = e.type === 'sale' ? 'Sale' : e.type === 'service' ? 'Service' : 'Trade-out';
      var vehLabel = [e.vehicleYear, e.vehicleMake, e.vehicleModel].filter(Boolean).join(' ') || e.vin.slice(-6);
      var nameNote = e.firstName ? ' ' + e.firstName + ' ' + (e.lastName || '') : '';
      return '<div class="timeline-event ' + (e.type === 'trade-out' ? 'trade' : e.type) + '">' +
        '<span class="date">' + e.date.toISOString().slice(0,10) + '</span>' +
        '<span class="typ">' + typ + '</span>' +
        escapeHtml(vehLabel) +
        (e.type === 'service' && e.firstName ? ' <span class="muted">·' + escapeHtml(nameNote) + '</span>' : '') +
      '</div>';
    }).join('');

    var phoneRow = function(label, num, src) {
      if (!num) return '';
      return '<dt>' + label + '</dt><dd class="mono">' + formatPhone(num) +
        (src ? ' <span class="muted">(' + src + ')</span>' : '') + '</dd>';
    };

    var driftNote = '';
    if (c.hasPhoneDrift) {
      driftNote += '<div style="padding:10px 14px;background:#FEF3C7;color:#92400E;border-radius:8px;font-size:12px;margin-bottom:10px">' +
        '<strong>Phone drift:</strong> recent service tickets use different phone(s) than the sale row. ' +
        'Drifted phones: ' + (c.driftedPhones || []).map(formatPhone).join(', ') + '. <em>Verify before texting.</em></div>';
    }
    if (c.hasEmailDrift) {
      driftNote += '<div style="padding:10px 14px;background:#FEF3C7;color:#92400E;border-radius:8px;font-size:12px;margin-bottom:10px">' +
        '<strong>Email drift:</strong> recent service tickets use different email(s). ' +
        'Drifted: ' + (c.driftedEmails || []).join(', ') + '.</div>';
    }

    return '<div class="drawer-header">' +
      '<div>' +
        '<h2>' + escapeHtml(((c.firstName || '') + ' ' + (c.lastName || '')).trim() || '(no name)') + '</h2>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">' + bucketBadge + ' ' + catBadge + ' ' + confBadge + '</div>' +
      '</div>' +
      '<div class="spacer" style="flex:1"></div>' +
      '<button class="btn btn-ghost btn-close" title="Close (Esc)">✕</button>' +
    '</div>' +
    '<div class="drawer-body">' +
      driftNote +

      '<div class="drawer-section">' +
        '<h3>Contact</h3>' +
        '<dl class="kv">' +
          phoneRow('Cell',  c.cellPhone, c.cellPhoneSource) +
          phoneRow('Home',  c.homePhone, c.homePhoneSource) +
          phoneRow('Work',  c.workPhone, c.workPhoneSource) +
          (c.primaryEmail ? '<dt>Email</dt><dd>' + escapeHtml(c.primaryEmail) + '</dd>' : '') +
          (c.allFirstNames && c.allFirstNames.length > 1 ? '<dt>All first names</dt><dd>' + c.allFirstNames.map(escapeHtml).join(', ') + '</dd>' : '') +
          (c.allLastNames  && c.allLastNames.length  > 1 ? '<dt>All last names</dt><dd>'  + c.allLastNames.map(escapeHtml).join(', ')  + '</dd>' : '') +
        '</dl>' +
      '</div>' +

      '<div class="drawer-section">' +
        '<h3>Activity</h3>' +
        '<dl class="kv">' +
          '<dt>Sales / Services</dt><dd><strong>' + c.numSales + '</strong> sales · <strong>' + c.numServices + '</strong> services</dd>' +
          '<dt>First activity</dt><dd>' + (c.firstActivityDate ? c.firstActivityDate.toISOString().slice(0,10) : '—') + '</dd>' +
          '<dt>Last activity</dt><dd>' + (c.lastActivityDate  ? c.lastActivityDate.toISOString().slice(0,10)  + ' <span class="muted">(' + c.daysSinceLastInteraction + ' days ago)</span>' : '—') + '</dd>' +
        '</dl>' +
      '</div>' +

      (currentBlocks ? '<div class="drawer-section"><h3>Currently Owned (' + (c.currentVehicles||[]).length + ')</h3>' + currentBlocks + '</div>' : '') +
      (lostBlocks    ? '<div class="drawer-section"><h3>Stopped Servicing (' + (c.lostVehicles||[]).length + ')</h3>' + lostBlocks + '</div>' : '') +
      (prevBlocks    ? '<div class="drawer-section"><h3>Traded Back (' + (c.previousVehicles||[]).length + ')</h3>' + prevBlocks + '</div>' : '') +

      '<div class="drawer-section">' +
        '<h3>Timeline (most recent ' + events.length + ' events)</h3>' +
        '<div class="timeline">' + timelineHtml + '</div>' +
      '</div>' +
    '</div>';
  }

  // Esc closes drawer
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape') {
      var drawer = document.getElementById('drawer');
      if (drawer && drawer.classList.contains('open')) close();
    }
  });

  return { open: open, close: close };
})();
