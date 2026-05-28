// ===========================================================================
// Extracted from index.html (Convergence List Hygiene Tool - Apps Script v2)
// Functions: openLoyaltyDetailPanel
// ===========================================================================

function openLoyaltyDetailPanel(customerKey) {
  var result = pipelinesState.loyaltyResult;
  if (!result) return;
  var c = result.customers.find(function(x){ return String(x.customerKey) === String(customerKey); });
  if (!c) return;

  // Remove any existing panel
  var existing = document.getElementById('loyalty-detail-panel');
  if (existing) existing.remove();
  var existingOverlay = document.getElementById('loyalty-detail-overlay');
  if (existingOverlay) existingOverlay.remove();

  // Build overlay (click to close)
  var overlay = document.createElement('div');
  overlay.id = 'loyalty-detail-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,15,25,.35);z-index:9998;opacity:0;transition:opacity .18s';
  overlay.onclick = closeLoyaltyDetailPanel;
  document.body.appendChild(overlay);

  // Build the side panel
  var panel = document.createElement('div');
  panel.id = 'loyalty-detail-panel';
  panel.style.cssText = 'position:fixed;top:0;right:0;bottom:0;width:560px;max-width:95vw;background:white;box-shadow:-8px 0 32px rgba(0,0,0,.18);z-index:9999;overflow-y:auto;transform:translateX(100%);transition:transform .22s ease-out;font-size:13px;color:var(--gray-800)';

  // Build content
  var name = ((c.firstName||'') + ' ' + (c.lastName||'')).trim() || '(no name on most recent sale)';
  var catIcon = c.customerCategory && c.customerCategory.indexOf('Home-grown') === 0 ? '🏡' : '🤝';
  var tbColor = ({
    'Active':'#5E10BC', 'Active-Watch':'#5E10BC', 'At Risk':'#ca8a04',
    'High Defection Risk':'#ea580c', 'Long Gone':'#525252'
  })[c.timeBucket] || '#525252';

  // Build vehicle history per VIN
  // Group events by VIN
  var eventsByVin = {};
  (c.events||[]).forEach(function(e){
    if (!eventsByVin[e.vin]) eventsByVin[e.vin] = [];
    eventsByVin[e.vin].push(e);
  });
  Object.keys(eventsByVin).forEach(function(v){
    eventsByVin[v].sort(function(a,b){ return new Date(a.date) - new Date(b.date); });
  });

  function vinBlock(vin, category) {
    var evs = eventsByVin[vin] || [];
    var sale = evs.find(function(e){ return e.type==='sale'; });
    var lastSvc = null;
    evs.forEach(function(e){ if (e.type==='service' && (!lastSvc || e.date > lastSvc.date)) lastSvc = e; });
    var svcCount = evs.filter(function(e){ return e.type==='service'; }).length;
    // Look up vehicle label
    var allVehicleArrays = [].concat(c.currentVehicles||[], c.previousVehicles||[], c.lostVehicles||[]);
    var vehInfo = allVehicleArrays.find(function(v){ return v.vin === vin; });
    var vehLabel = (vehInfo && vehInfo.label) ? vehInfo.label : '';
    var saleInfo = sale
      ? '<div style="color:var(--gray-500);font-size:11px;margin-top:2px">Bought ' + new Date(sale.date).toISOString().slice(0,10) +
        (sale.firstName||sale.lastName ? ' &middot; ' + ((sale.firstName||'') + ' ' + (sale.lastName||'')).trim() : '') +
        (sale.tradeVin ? ' &middot; <span style="color:var(--gray-400)">traded ' + sale.tradeVin.slice(-8) + '</span>' : '') +
        '</div>'
      : '<div style="color:var(--gray-500);font-size:11px;margin-top:2px"><em>No sale event on file</em></div>';
    var svcInfo = lastSvc
      ? '<div style="color:var(--gray-500);font-size:11px;margin-top:2px">Last service ' + new Date(lastSvc.date).toISOString().slice(0,10) +
        ' &middot; ' + svcCount + ' service event' + (svcCount===1?'':'s') +
        (lastSvc.firstName||lastSvc.lastName ? ' &middot; <span style="color:var(--gray-400)">last ticket: ' + ((lastSvc.firstName||'') + ' ' + (lastSvc.lastName||'')).trim() + '</span>' : '') +
        '</div>'
      : '<div style="color:var(--gray-400);font-size:11px;margin-top:2px"><em>No service history at this dealer</em></div>';
    var bgColor = category==='current' ? '#F0ECFD' : category==='previous' ? '#f1f5f9' : '#fef2f2';
    var borderColor = category==='current' ? '#D4C9F4' : category==='previous' ? '#cbd5e1' : '#fca5a5';
    return '<div style="background:' + bgColor + ';border:1px solid ' + borderColor + ';border-radius:6px;padding:10px;margin-bottom:8px">' +
      (vehLabel ? '<div style="font-size:13px;font-weight:600;color:var(--gray-800)">' + vehLabel + '</div>' : '') +
      '<div style="font-family:monospace;font-size:11px;color:var(--gray-500)">' + vin + '</div>' +
      saleInfo + svcInfo +
      '</div>';
  }

  var currentVehiclesHtml = (c.currentlyOwns||[]).length
    ? (c.currentlyOwns||[]).map(function(v){ return vinBlock(v, 'current'); }).join('')
    : '<div style="color:var(--gray-400);font-size:12px;font-style:italic;padding:8px 0">None currently owned</div>';

  var previousVehiclesHtml = (c.previouslyOwned||[]).length
    ? '<div style="margin-top:14px"><div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--gray-500);margin-bottom:6px">⟲ Previously Owned (Traded Back)</div>' +
      (c.previouslyOwned||[]).map(function(v){ return vinBlock(v, 'previous'); }).join('') +
      '</div>'
    : '';

  var lostVehiclesHtml = (c.lostFromNetwork||[]).length
    ? '<div style="margin-top:14px"><div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#991b1b;margin-bottom:6px" title="Bought here, no trade-back, service stopped 18+ months ago">⚠ Stopped Servicing</div>' +
      (c.lostFromNetwork||[]).map(function(v){ return vinBlock(v, 'lost'); }).join('') +
      '</div>'
    : '';

  // Build the event timeline — sales/trades expanded, services collapsed
  var sortedEvents = (c.events||[]).slice().sort(function(a,b){ return new Date(b.date) - new Date(a.date); }); // newest first
  var salesAndTrades = sortedEvents.filter(function(e){ return e.type==='sale' || e.type==='trade-out'; });
  var serviceEvents = sortedEvents.filter(function(e){ return e.type==='service'; });

  function eventRow(e) {
    var icon = e.type==='sale' ? '🟢' : e.type==='trade-out' ? '🔄' : '🔧';
    var typeLabel = e.type==='sale' ? 'SALE' : e.type==='trade-out' ? 'TRADE-OUT' : 'Service';
    var typeColor = e.type==='sale' ? '#5E10BC' : e.type==='trade-out' ? '#ca8a04' : '#64748b';
    var who = (e.firstName||'') + ' ' + (e.lastName||'');
    who = who.trim();
    return '<div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--gray-100);font-size:12px;align-items:start">' +
      '<div style="font-size:14px;flex-shrink:0">' + icon + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;gap:8px;align-items:baseline">' +
          '<span style="font-family:monospace;color:var(--gray-700)">' + new Date(e.date).toISOString().slice(0,10) + '</span>' +
          '<span style="font-weight:600;color:' + typeColor + ';font-size:10px;letter-spacing:.05em">' + typeLabel + '</span>' +
        '</div>' +
        '<div style="font-family:monospace;font-size:10px;color:var(--gray-500);margin-top:1px">' + e.vin +
          (e.type==='sale' && e.tradeVin ? ' &middot; traded ' + e.tradeVin : '') +
          (e.type==='trade-out' && e.tradeBuyerVin ? ' &middot; for ' + e.tradeBuyerVin : '') +
        '</div>' +
        (who ? '<div style="font-size:11px;color:var(--gray-500);margin-top:1px">PII on event: ' + who + '</div>' : '') +
      '</div>' +
      '</div>';
  }

  var serviceToggleHtml = serviceEvents.length
    ? '<div style="margin-top:10px">' +
      '<button id="loyalty-toggle-services" style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:6px;padding:6px 12px;cursor:pointer;font-size:11px;color:var(--gray-600);width:100%;text-align:left">' +
        '▸ Show ' + serviceEvents.length + ' service event' + (serviceEvents.length===1?'':'s') +
      '</button>' +
      '<div id="loyalty-services-list" style="display:none;margin-top:6px">' +
        serviceEvents.map(eventRow).join('') +
      '</div>' +
      '</div>'
    : '';

  // Other names on file (Daniel + Margaret scenario)
  var otherNames = (c.allFirstNames||[]).map(function(f, i){
    var l = (c.allLastNames||[])[i] || '';
    return (f + ' ' + l).trim();
  }).filter(function(n){
    // Hide the displayed name from "other names"
    return n && n !== ((c.firstName||'') + ' ' + (c.lastName||'')).trim();
  });

  var flagsHtml = [];
  if (c.isPostTradeOwner) flagsHtml.push('<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:4px;font-size:11px">Post-trade owner</span>');
  if ((c.lostFromNetwork||[]).length) flagsHtml.push('<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:4px;font-size:11px">' + c.lostFromNetwork.length + ' stopped servicing</span>');
  if (c.hasLeaseDealType || c.likelyLeaseReturn) flagsHtml.push('<span style="background:#f3e8ff;color:#6b21a8;padding:2px 8px;border-radius:4px;font-size:11px">' + (c.hasLeaseDealType?'Confirmed Lease':'Likely Lease') + '</span>');
  if (c.mergeConfidence === 'Possible Duplicate') flagsHtml.push('<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:11px">Possible Duplicate</span>');
  if (c.numSales > 20 || c.numServices > 100) flagsHtml.push('<span style="background:#fef2f2;color:#991b1b;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">⚠ High Volume</span>');

  panel.innerHTML =
    // Header
    '<div style="position:sticky;top:0;background:white;border-bottom:1px solid var(--gray-100);padding:16px 20px;z-index:2">' +
      '<button id="loyalty-panel-close" style="position:absolute;top:14px;right:14px;background:none;border:none;font-size:20px;cursor:pointer;color:var(--gray-400);line-height:1;padding:4px 8px">×</button>' +
      '<div style="font-family:\'Rubik\',sans-serif;font-size:18px;font-weight:700;color:var(--gray-800);padding-right:30px">' + name + '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;align-items:center">' +
        '<span style="font-size:12px;color:var(--gray-500)">' + catIcon + ' ' + (c.customerCategory||'') + '</span>' +
        '<span style="font-size:11px;color:' + tbColor + ';font-weight:600">●  ' + c.timeBucket + '</span>' +
        '<span style="font-size:11px;color:var(--gray-400)">' +
          (c.daysSinceLastInteraction!=null ? '· last activity ' + c.daysSinceLastInteraction + ' days ago' : '') +
        '</span>' +
      '</div>' +
      (flagsHtml.length ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' + flagsHtml.join('') + '</div>' : '') +
    '</div>' +

    // Body
    '<div style="padding:18px 20px">' +
      // Activity summary
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:18px">' +
        '<div style="background:var(--gray-50);border-radius:6px;padding:10px"><div style="font-size:10px;color:var(--gray-500);text-transform:uppercase;letter-spacing:.05em;font-weight:600">Sales</div><div style="font-size:22px;font-weight:700">' + c.numSales + '</div></div>' +
        '<div style="background:var(--gray-50);border-radius:6px;padding:10px"><div style="font-size:10px;color:var(--gray-500);text-transform:uppercase;letter-spacing:.05em;font-weight:600">Services</div><div style="font-size:22px;font-weight:700">' + c.numServices + '</div></div>' +
        '<div style="background:var(--gray-50);border-radius:6px;padding:10px"><div style="font-size:10px;color:var(--gray-500);text-transform:uppercase;letter-spacing:.05em;font-weight:600">VINs</div><div style="font-size:22px;font-weight:700">' + ((c.currentlyOwns||[]).length + (c.previouslyOwned||[]).length + (c.lostFromNetwork||[]).length) + '</div></div>' +
      '</div>' +

      // Contact section
      '<div style="margin-bottom:18px">' +
        '<div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--gray-500);margin-bottom:6px">Contact</div>' +
        '<div style="font-size:12px;line-height:1.6">' +
          ((c.phones||[]).length ? '<div><strong style="color:var(--gray-500);font-weight:500;width:60px;display:inline-block">Phones:</strong> <span style="font-family:monospace">' + (c.phones||[]).join(', ') + '</span></div>' : '') +
          ((c.emails||[]).length ? '<div><strong style="color:var(--gray-500);font-weight:500;width:60px;display:inline-block">Emails:</strong> ' + (c.emails||[]).join(', ') + '</div>' : '') +
          (otherNames.length ? '<div style="margin-top:6px;color:var(--gray-500);font-size:11px"><em>Other names seen across this record\'s VINs:</em> ' + otherNames.join(', ') + '</div>' : '') +
        '</div>' +
      '</div>' +

      // Vehicle history
      '<div style="margin-bottom:18px">' +
        '<div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--gray-500);margin-bottom:6px">🚗 Currently Owns</div>' +
        currentVehiclesHtml +
        previousVehiclesHtml +
        lostVehiclesHtml +
      '</div>' +

      // Event timeline
      '<div>' +
        '<div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--gray-500);margin-bottom:6px">Event Timeline</div>' +
        (salesAndTrades.length
          ? '<div>' + salesAndTrades.map(eventRow).join('') + '</div>'
          : '<div style="color:var(--gray-400);font-style:italic;font-size:12px">No sale or trade events</div>') +
        serviceToggleHtml +
      '</div>' +
    '</div>';

  document.body.appendChild(panel);

  // Animate in
  requestAnimationFrame(function(){
    overlay.style.opacity = '1';
    panel.style.transform = 'translateX(0)';
  });

  // Wire close
  document.getElementById('loyalty-panel-close').onclick = closeLoyaltyDetailPanel;

  // Wire service toggle
  var toggleBtn = document.getElementById('loyalty-toggle-services');
  if (toggleBtn) {
    toggleBtn.onclick = function(){
      var list = document.getElementById('loyalty-services-list');
      if (!list) return;
      var open = list.style.display !== 'none';
      list.style.display = open ? 'none' : 'block';
      toggleBtn.innerHTML = (open ? '▸' : '▾') + ' ' + (open ? 'Show ' : 'Hide ') + serviceEvents.length + ' service event' + (serviceEvents.length===1?'':'s');
    };
  }

  // Esc to close
  pipelinesState._loyaltyEscHandler = function(ev){ if (ev.key === 'Escape') closeLoyaltyDetailPanel(); };
  document.addEventListener('keydown', pipelinesState._loyaltyEscHandler);
}

