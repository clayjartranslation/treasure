/* Register the offline service worker on this site's own host.
   The Google Translate proxy is a different origin; do not install a worker there. */
(function () {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  var host = location.hostname || '';
  if (host === 'clayjartranslation-github-io.translate.goog' || /\.translate\.goog$/i.test(host)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js', { scope: './' }).then(function (reg) {
      try { reg.update(); } catch (e) {}
      document.addEventListener('visibilitychange', function () { if (!document.hidden) try { reg.update(); } catch (e) {} });
    }).catch(function () {});
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  });
})();
