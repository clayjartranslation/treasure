/* Keep the offline cache fresh, especially on iPhone home-screen apps
   that can otherwise keep an old service worker (and old player) for hours.
   skipWaiting/clients.claim are in sw.js; this page reloads once the new
   worker takes control, and checks for an update when the app is shown. */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  var host = location.hostname || '';
  if (host === 'clayjartranslation-github-io.translate.goog' || /\.translate\.goog$/i.test(host)) return;

  var refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });

  function watch(reg) {
    if (!reg || !reg.update) return;
    var check = function () { try { reg.update(); } catch (e) {} };
    check();
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) check();
    });
    window.addEventListener('pageshow', check);
  }

  function register() {
    navigator.serviceWorker.register('sw.js', { scope: './' }).then(watch).catch(function () {});
  }
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);
})();
