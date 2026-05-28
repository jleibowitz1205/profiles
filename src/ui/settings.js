// ===========================================================================
//  PROFILES — UI: Settings view
//  Lets the user tweak engine thresholds and re-run.
// ===========================================================================

function renderSettings() {
  var host = document.getElementById('view-settings');
  var t = App.state.thresholds;

  host.innerHTML = '<div class="card">' +
    '<div class="card-header"><h2>Engine settings</h2>' +
      '<span class="label">Tweak thresholds, then re-run the engine</span>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn-primary btn-sm" id="btn-rerun">↻ Re-run engine</button>' +
    '</div>' +
    '<div style="padding:22px">' +
      '<div class="settings-grid">' +
        setting('defectionThresholdDays', 'Defection threshold (days)',
          'Activity older than this means "At Risk" or worse. Default 540 (18 months) — the Convergence cliff.', t.defectionThresholdDays) +
        setting('longGoneThresholdDays', 'Long Gone threshold (days)',
          'No activity in this many days = effectively lost. Default 1096 (36 months).', t.longGoneThresholdDays) +
        setting('serviceGapThresholdDays', 'Service gap threshold (days)',
          'Per-VIN service gap that triggers "Stopped Servicing" flag. Default 540 (18 months).', t.serviceGapThresholdDays) +
      '</div>' +
      '<div style="margin-top:30px;padding:16px;background:var(--gray-50);border-radius:8px;font-size:12.5px;color:var(--gray-700);line-height:1.6">' +
        '<strong>Note for engineering team:</strong> in production these come from the dealer record (per-tenant config) and shouldn\'t be user-editable from this screen. The buckets themselves (Active / Active-Watch / etc.) are universal Convergence standards and not configurable per dealer.' +
      '</div>' +

      '<div style="margin-top:30px">' +
        '<h3 style="margin-bottom:12px">Engine run summary</h3>' +
        renderRunSummary() +
      '</div>' +
    '</div>' +
  '</div>';

  ['defectionThresholdDays', 'longGoneThresholdDays', 'serviceGapThresholdDays'].forEach(function(key) {
    host.querySelector('#' + key).addEventListener('input', function(ev) {
      t[key] = parseInt(ev.target.value, 10) || 0;
    });
  });
  host.querySelector('#btn-rerun').addEventListener('click', function() {
    if (!App.state.sampleLoaded) {
      notify('Re-running with previously-loaded data isn\'t supported in the demo — load sample data or re-upload.', 'error');
      return;
    }
    notify('Re-running engine with new thresholds...', 'info');
    setTimeout(function() {
      var result = runProfilesEngine(
        SAMPLE_DATA.sales, SAMPLE_DATA.salesHeaders,
        SAMPLE_DATA.service, SAMPLE_DATA.serviceHeaders,
        App.state.thresholds
      );
      App.setResult(result);
      notify('Done — ' + result.customers.length + ' customers', 'success');
    }, 50);
  });
}

function setting(id, label, hint, val) {
  return '<div class="setting">' +
    '<label>' + label + '</label>' +
    '<div class="hint">' + hint + '</div>' +
    '<input type="number" id="' + id + '" value="' + val + '" min="0" step="30" />' +
  '</div>';
}

function renderRunSummary() {
  var s = App.state.result.stats;
  var pairs = [
    ['Sales rows processed',     s.totalSalesRows.toLocaleString()],
    ['Service rows processed',   s.totalServiceRows.toLocaleString()],
    ['Events generated',         s.totalEvents.toLocaleString()],
    ['Unique sold VINs',         s.uniqueSoldVins.toLocaleString()],
    ['Unique service VINs',      (s.uniqueServiceVins||0).toLocaleString()],
    ['Segments built',           App.state.result.debug.segments.toLocaleString()],
    ['Customer clusters',        App.state.result.debug.clusters.toLocaleString()],
    ['Buyer-of-Record gate',     (s.gateAllowed||0).toLocaleString() + ' allowed · ' + (s.gateBlocked||0).toLocaleString() + ' blocked'],
    ['Internal vehicles excluded', s.internalVehiclesDetected.toLocaleString()],
    ['High-cardinality phones dropped', (s.rejectedPhones||0).toLocaleString()],
    ['High-cardinality emails dropped', (s.rejectedEmails||0).toLocaleString()],
    ['Run time',                 s.elapsedMs + ' ms']
  ];
  if (s.engineV2) {
    pairs.push(['Pre-sale dealer custody skipped',  (s.engineV2.pre_sale_dealer_custody_skipped||0).toLocaleString()]);
    pairs.push(['Post-trade dealer custody skipped', (s.engineV2.post_trade_dealer_custody_skipped||0).toLocaleString()]);
    pairs.push(['Post-trade trader follow-ups',     (s.engineV2.post_trade_trader_followups||0).toLocaleString()]);
    pairs.push(['Anomalous inter-owner services',   (s.engineV2.anomalous_inter_owner_services||0).toLocaleString()]);
  }
  return '<dl class="kv" style="grid-template-columns:260px 1fr">' +
    pairs.map(function(p) { return '<dt>' + p[0] + '</dt><dd class="mono">' + p[1] + '</dd>'; }).join('') +
  '</dl>';
}
