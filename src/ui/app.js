// ===========================================================================
//  PROFILES — UI: app shell, view router, state
//
//  In the Vue version each of these becomes a Pinia/Vuex store.
//  For the demo: one global state object, one render() per view.
// ===========================================================================

var App = (function() {
  // ── State ───────────────────────────────────────────────────────────────
  var state = {
    result: null,          // engine output
    activeView: 'currentlyOwned',   // 'currentlyOwned' | 'salesHistory' | 'anomalies' | 'settings'
    // Filter state for Currently Owned (shared with Sales History where relevant)
    filters: {
      vin: '', phone: '', email: '', first: '', last: '',
      buckets: [], categories: [], flags: [], confidence: [],
      makes: [], models: [], years: [],
      activityFrom: '', activityTo: '',
      saleFrom: '', saleTo: '',
      serviceFrom: '', serviceTo: '',
      sort: [{ field: 'lastActivityDate', dir: 'desc' }]
    },
    salesHistoryFilters: {
      vin: '', phone: '', email: '', first: '', last: '',
      statuses: [], categories: [], makes: [], models: [], years: [],
      saleFrom: '', saleTo: '',
      sort: [{ field: 'saleDate', dir: 'desc' }]
    },
    anomalyFilters: {
      types: [], statuses: ['open'],
      sort: [{ field: 'detectedAt', dir: 'desc' }]
    },
    thresholds: {
      defectionThresholdDays:  540,
      longGoneThresholdDays:   1096,
      serviceGapThresholdDays: 540
    },
    detailFor: null,      // customerKey currently shown in drawer
    sampleLoaded: false
  };

  function setResult(result) {
    state.result = result;
    renderAll();
  }

  function setView(v) {
    state.activeView = v;
    renderAll();
  }

  // ── Top-level render ────────────────────────────────────────────────────
  function renderAll() {
    renderNav();
    if (!state.result) {
      renderEmptyState();
      return;
    }
    document.getElementById('empty-state').classList.add('hidden');
    renderStats();

    // hide everything, show one
    ['view-currentlyOwned', 'view-salesHistory', 'view-anomalies', 'view-settings'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    var hostId = 'view-' + state.activeView;
    var host = document.getElementById(hostId);
    if (host) host.classList.remove('hidden');

    if (state.activeView === 'currentlyOwned') renderCurrentlyOwned();
    else if (state.activeView === 'salesHistory') renderSalesHistory();
    else if (state.activeView === 'anomalies') renderAnomalies();
    else if (state.activeView === 'settings') renderSettings();
  }

  function renderNav() {
    var nav = document.getElementById('nav');
    if (!nav) return;
    var views = [
      { key: 'currentlyOwned', label: 'Currently Owned', count: state.result ? state.result.targets.length : null },
      { key: 'salesHistory',   label: 'Sales History',   count: state.result ? state.result.salesHistory.length : null },
      { key: 'anomalies',      label: 'Anomalies',       count: state.result ? state.result.anomalies.length : null },
      { key: 'settings',       label: 'Settings',        count: null }
    ];
    nav.innerHTML = views.map(function(v) {
      var active = state.activeView === v.key ? ' active' : '';
      var ct = v.count !== null ? '<span class="count">' + v.count.toLocaleString() + '</span>' : '';
      return '<button class="nav-item' + active + '" data-view="' + v.key + '">' + v.label + ct + '</button>';
    }).join('');
    nav.querySelectorAll('.nav-item').forEach(function(btn) {
      btn.addEventListener('click', function() { setView(btn.getAttribute('data-view')); });
    });
  }

  function renderEmptyState() {
    document.getElementById('empty-state').classList.remove('hidden');
    ['view-currentlyOwned', 'view-salesHistory', 'view-anomalies', 'view-settings',
     'stats-host'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  }

  // ── Boot ────────────────────────────────────────────────────────────────
  function boot() {
    // Wire empty-state buttons
    document.getElementById('btn-load-sample').addEventListener('click', loadSample);
    document.getElementById('btn-upload').addEventListener('click', function() {
      document.getElementById('file-input-sales').click();
    });
    document.getElementById('file-input-sales').addEventListener('change', handleUpload);

    // Topbar
    document.getElementById('btn-load-sample-top').addEventListener('click', loadSample);
    document.getElementById('btn-upload-top').addEventListener('click', function() {
      document.getElementById('file-input-sales').click();
    });
    document.getElementById('btn-reset').addEventListener('click', function() {
      if (confirm('Clear loaded data and return to the upload screen?')) {
        state.result = null;
        state.sampleLoaded = false;
        renderAll();
      }
    });

    renderAll();
  }

  function loadSample() {
    notify('Loading sample data...', 'info');
    setTimeout(function() {
      try {
        var t0 = Date.now();
        var result = runProfilesEngine(
          SAMPLE_DATA.sales, SAMPLE_DATA.salesHeaders,
          SAMPLE_DATA.service, SAMPLE_DATA.serviceHeaders,
          state.thresholds
        );
        var elapsed = Date.now() - t0;
        state.sampleLoaded = true;
        setResult(result);
        notify('Loaded sample — ' + result.customers.length + ' customers, ' +
               result.anomalies.length + ' anomalies (' + elapsed + 'ms)', 'success');
      } catch (e) {
        console.error(e);
        notify('Sample data failed to load: ' + e.message, 'error');
      }
    }, 50);
  }

  function handleUpload(ev) {
    var files = Array.from(ev.target.files || []);
    if (!files.length) return;
    UploadFlow.handle(files, function(payload) {
      if (!payload) return;
      try {
        var result = runProfilesEngine(
          payload.salesRows, payload.salesHeaders,
          payload.serviceRows, payload.serviceHeaders,
          state.thresholds
        );
        setResult(result);
        notify('Engine done — ' + result.customers.length + ' customers identified', 'success');
      } catch (e) {
        console.error(e);
        notify('Engine failed: ' + e.message, 'error');
      }
    });
  }

  return {
    state: state,
    boot: boot,
    setResult: setResult,
    setView: setView,
    renderAll: renderAll
  };
})();

document.addEventListener('DOMContentLoaded', function() {
  App.boot();
});
