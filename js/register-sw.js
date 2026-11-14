/* Register the offline service worker on this site's own host.
   The Google Translate proxy is a different origin; do not install a worker there. */
(function () {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  var host = location.hostname || '';
  if (host === 'clayjartranslation-github-io.translate.goog' || /\.translate\.goog$/i.test(host)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () {});
  });
})();
