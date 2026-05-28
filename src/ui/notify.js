// ===========================================================================
//  PROFILES — UI: toast notifications
// ===========================================================================

(function() {
  function notify(msg, type) {
    type = type || 'info';
    var host = document.getElementById('toasts');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toasts';
      host.className = 'toasts';
      document.body.appendChild(host);
    }
    var t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(function() {
      t.style.transition = 'opacity 0.25s, transform 0.25s';
      t.style.opacity = '0';
      t.style.transform = 'translateX(20px)';
      setTimeout(function() { t.remove(); }, 250);
    }, type === 'error' ? 4500 : 2500);
  }
  window.notify = notify;
})();
