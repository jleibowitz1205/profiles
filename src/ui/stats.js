// ===========================================================================
//  PROFILES — UI: stats bar (bucket strip + summary)
//  Clickable bucket cards drive the Currently Owned table's bucket filter.
// ===========================================================================

function renderStats() {
  var host = document.getElementById('stats-host');
  if (!host) return;
  host.classList.remove('hidden');
  var r = App.state.result;
  var s = r.stats;
  var totalCustomers = r.customers.length;

  // Bucket strip
  var stripHtml = BUCKETS.map(function(b) {
    var ct = s.timeBucketCounts[b.key] || 0;
    var pct = totalCustomers ? Math.round(100 * ct / totalCustomers) : 0;
    var active = App.state.filters.buckets.indexOf(b.key) !== -1 ? ' active' : '';
    var cliff = b.cliff ? ' cliff' : '';
    return '<div class="bucket' + active + cliff + '" data-bucket="' + b.key + '" ' +
           'style="border-color:' + b.color + '20">' +
      '<div class="name" style="color:' + b.color + '">' + b.dot + ' ' + b.label + '</div>' +
      '<div class="count">' + ct.toLocaleString() + '</div>' +
      '<div class="pct">' + pct + '% of customers</div>' +
      '<div class="range">' + b.range + '</div>' +
      '</div>';
  }).join('');

  // Stats strip
  var cc = s.customerCategoryCounts || {};
  var hg = (cc['Home-grown — Repeat'] || 0) + (cc['Home-grown — First-time'] || 0);
  var adopted = cc['Adopted'] || 0;
  var leaseLabel = s.hasDealTypeColumn ? 'confirmed' : 'likely';
  var leaseCount = s.confirmedLeaseCount || s.likelyLeaseReturnCount || 0;

  var strip =
    '<div class="stat"><strong>' + totalCustomers.toLocaleString() + '</strong> customers · <strong>' + (s.totalTargets||0).toLocaleString() + '</strong> vehicle relationships</div>' +
    '<div class="sep"></div>' +
    '<div class="stat">🏡 <strong>' + hg.toLocaleString() + '</strong> Home-grown <span class="muted">(' + (cc['Home-grown — Repeat']||0) + ' repeat · ' + (cc['Home-grown — First-time']||0) + ' first-time)</span></div>' +
    '<div class="stat">🤝 <strong>' + adopted.toLocaleString() + '</strong> Adopted</div>' +
    '<div class="sep"></div>' +
    '<div class="stat"><strong>' + (s.lostFromNetworkCount||0).toLocaleString() + '</strong> stopped servicing</div>' +
    '<div class="stat"><strong>' + leaseCount.toLocaleString() + '</strong> ' + leaseLabel + ' lease patterns</div>' +
    '<div class="stat"><strong>' + (s.possibleDuplicatePairs||0).toLocaleString() + '</strong> possible duplicates</div>' +
    (s.internalVehiclesDetected ? '<div class="stat"><strong>' + s.internalVehiclesDetected + '</strong> internal vehicles excluded</div>' : '') +
    '<div class="sep"></div>' +
    '<div class="stat muted">Ran in ' + s.elapsedMs + ' ms</div>';

  host.innerHTML =
    '<div class="bucket-strip">' + stripHtml + '</div>' +
    '<div class="stats-strip">' + strip + '</div>';

  // Wire bucket clicks (only meaningful from Currently Owned view; switches there if needed)
  host.querySelectorAll('.bucket').forEach(function(card) {
    card.addEventListener('click', function() {
      var b = card.getAttribute('data-bucket');
      var arr = App.state.filters.buckets;
      var idx = arr.indexOf(b);
      if (idx === -1) arr.push(b); else arr.splice(idx, 1);
      if (App.state.activeView !== 'currentlyOwned') App.setView('currentlyOwned');
      else App.renderAll();
    });
  });
}
