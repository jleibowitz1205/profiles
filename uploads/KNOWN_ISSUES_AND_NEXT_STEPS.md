// ===========================================================================
// Extracted from index.html (Convergence List Hygiene Tool - Apps Script v2)
// Functions: showLoyaltyTimelineResults
// ===========================================================================

function showLoyaltyTimelineResults() {
  var result = pipelinesState.loyaltyResult;
  if (!result) return;
  var s = result.stats;
  var customers = result.customers;

  // Hide other panels, show step-pipelines
  ['step-upload','step-configure','step-preview','step-compare'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.classList.add('hidden');
  });
  var stepEl = document.getElementById('step-pipelines');
  if (stepEl) stepEl.classList.remove('hidden');

  // Update the subheader (pipelines-meta) — replaces any leftover mode name like "Service — Never Sold"
  var metaEl = document.getElementById('pipelines-meta');
  if (metaEl) {
    var sourcesParts = [];
    if (s.totalSalesRows)   sourcesParts.push(s.totalSalesRows.toLocaleString() + ' sales rows');
    if (s.totalServiceRows) sourcesParts.push(s.totalServiceRows.toLocaleString() + ' service rows');
    metaEl.innerHTML = '<span style="color:var(--electric);font-weight:600">Loyalty Timeline</span> &middot; ' +
      sourcesParts.join(' + ') + ' &middot; ' +
      customers.length.toLocaleString() + ' customers identified';
  }

  // Make sure mode bar is visible
  var modeBar = document.getElementById('pipelines-mode-bar');
  if (modeBar) modeBar.classList.remove('hidden');

  // Hide the filter bar (the standard one — Loyalty Timeline doesn't use it)
  var filterBar = document.getElementById('pipelines-filter-bar');
  if (filterBar) filterBar.classList.add('hidden');

  // Build custom bucket cards
  var bucketsEl = document.getElementById('pipelines-buckets');
  if (!bucketsEl) return;
  bucketsEl.innerHTML = '';
  bucketsEl.style.gridTemplateColumns = 'repeat(5, 1fr)';

  var bucketDefs = [
    { key:'Active',              label:'🟣 Active',              sub:'0–6 months',  color:'#5E10BC', bg:'#F0ECFD' },
    { key:'Active-Watch',        label:'🟣 Active-Watch',        sub:'6–12 months', color:'#5E10BC', bg:'#F0ECFD' },
    { key:'At Risk',             label:'🟡 At Risk',             sub:'12–18 months',color:'#ca8a04', bg:'#fef9c3' },
    { key:'High Defection Risk', label:'🟠 High Defection Risk', sub:'18–36 months — THE CLIFF', color:'#ea580c', bg:'#fed7aa', flag:true },
    { key:'Long Gone',           label:'⚫ Long Gone',           sub:'36+ months',  color:'#525252', bg:'#e5e5e5' }
  ];

  bucketDefs.forEach(function(b){
    var count = s.timeBucketCounts[b.key] || 0;
    var pct = customers.length ? Math.round(100 * count / customers.length) : 0;
    var card = document.createElement('div');
    card.className = 'bucket-card loyalty-bucket';
    card.setAttribute('data-bucket', b.key);
    card.style.cssText = 'background:' + b.bg + ';border:1.5px solid ' + b.color + (b.flag?'40':'30') + ';border-radius:10px;padding:14px;cursor:pointer;transition:transform .12s,box-shadow .12s' + (b.flag?';box-shadow:0 4px 12px rgba(234,88,12,.15)':'');
    card.innerHTML =
      '<div style="font-size:11px;font-weight:600;color:' + b.color + ';margin-bottom:4px">' + b.label + '</div>' +
      '<div style="font-size:28px;font-weight:700;color:var(--gray-800);line-height:1">' + count.toLocaleString() + '</div>' +
      '<div style="font-size:10px;color:var(--gray-500);margin-top:2px">' + pct + '% of customers</div>' +
      '<div style="font-size:10px;color:var(--gray-400);margin-top:6px">' + b.sub + '</div>';
    // Use addEventListener for reliability + closure-correct bucket capture
    (function(bucketKey){
      card.addEventListener('click', function(){ renderLoyaltyTable(bucketKey); });
    })(b.key);
    card.addEventListener('mouseover', function(){ card.style.transform = 'translateY(-2px)'; });
    card.addEventListener('mouseout',  function(){ card.style.transform = ''; });
    bucketsEl.appendChild(card);
  });

  // Stats strip with Home-grown / Adopted framing
  var statsStrip = document.createElement('div');
  statsStrip.style.cssText = 'grid-column:1/-1;background:var(--gray-50);border-radius:8px;padding:10px 14px;display:flex;gap:18px;flex-wrap:wrap;font-size:11px;color:var(--gray-600);margin-top:8px';
  var cc = s.customerCategoryCounts || {};
  statsStrip.innerHTML =
    '<div><strong style="color:var(--gray-800)">' + customers.length.toLocaleString() + '</strong> total customers</div>' +
    '<div>🏡 <strong style="color:var(--gray-800)">' + ((cc['Home-grown — Repeat']||0)+(cc['Home-grown — First-time']||0)).toLocaleString() + '</strong> Home-grown ' +
      '<span style="color:var(--gray-400)">(' + (cc['Home-grown — Repeat']||0).toLocaleString() + ' repeat / ' + (cc['Home-grown — First-time']||0).toLocaleString() + ' first-time)</span></div>' +
    '<div>🤝 <strong style="color:var(--gray-800)">' + (cc['Adopted']||0).toLocaleString() + '</strong> Adopted ' +
      '<span style="color:var(--gray-400)">(serviced here, bought elsewhere)</span></div>' +
    '<div><strong style="color:var(--gray-800)">' + s.lostFromNetworkCount.toLocaleString() + '</strong> stopped servicing</div>' +
    '<div><strong style="color:var(--gray-800)">' + (s.confirmedLeaseCount||s.likelyLeaseReturnCount||0).toLocaleString() + '</strong> ' + (s.hasDealTypeColumn?'confirmed':'likely') + ' lease patterns</div>' +
    '<div><strong style="color:var(--gray-800)">' + s.possibleDuplicatePairs.toLocaleString() + '</strong> possible duplicates</div>' +
    (s.internalVehiclesDetected ? '<div><strong style="color:var(--gray-800)">' + s.internalVehiclesDetected.toLocaleString() + '</strong> internal vehicles excluded</div>' : '');
  bucketsEl.appendChild(statsStrip);

  // Default state — show all customers (no buckets pre-selected)
  renderLoyaltyTable();
}

