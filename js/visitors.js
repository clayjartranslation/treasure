/* Public visitor total. Counts once per browser session per site.
   Uses the free Abacus counter API (no account, no cookies from this site).
   If the API is down, the total stays hidden. */
(function () {
  var NS = 'clayjartranslation.github.io';
  var script = document.currentScript;
  var key = (script && script.getAttribute('data-counter')) || 'ctb-site-visitors';
  var flag = 'visitor-counted:' + key;
  var host = location.hostname;
  var local = location.protocol === 'file:'
    || host === 'localhost'
    || host === '127.0.0.1'
    || host === '';
  var already = false;
  try { already = sessionStorage.getItem(flag) === '1'; } catch (e) {}

  function show(n) {
    if (typeof n !== 'number' || !isFinite(n) || n < 1) return;
    var text = 'Visitors: ' + Math.floor(n).toLocaleString('en-US');
    var nodes = document.querySelectorAll('[data-visitor-total]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = text;
      nodes[i].removeAttribute('hidden');
    }
  }

  function run(data) {
    if (!already && !local) {
      try { sessionStorage.setItem(flag, '1'); } catch (e) {}
    }
    if (data && typeof data.value === 'number') show(data.value);
  }

  var path = (already || local) ? '/get/' : '/hit/';
  var url = 'https://abacus.jasoncameron.dev' + path + encodeURIComponent(NS) + '/' + encodeURIComponent(key);
  var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 4000);
  fetch(url, { mode: 'cors', cache: 'no-store', credentials: 'omit', signal: ctrl ? ctrl.signal : undefined })
    .then(function (res) {
      if (!res.ok) throw new Error('counter');
      return res.json();
    })
    .then(run)
    .catch(function () { /* leave hidden */ })
    .then(function () { clearTimeout(timer); });
})();
