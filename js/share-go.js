/* Share-link landing page: open the chapter (and the verse from ?v=) in the reader. */
(function () {
  var s = document.currentScript; if (!s) return;
  var b = s.getAttribute('data-book') || '', c = s.getAttribute('data-ch') || '';
  if (!/^[a-z0-9-]+$/.test(b) || !/^\d{1,3}$/.test(c)) return;
  var m = /[?&]v=(\d{1,3})(?:&|$)/.exec(location.search);
  location.replace(new URL('../../#/read/' + b + '/' + c + (m ? '/' + m[1] : ''), location.href).href);
})();
