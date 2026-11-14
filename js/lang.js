/* Language menu, early theme, and clickjacking guard.
   No Google script is loaded here. A non-English choice opens the public
   Google Translate proxy for this site. The choice is stored only in localStorage. */
(function (root) {
  'use strict';

  var PROD = 'clayjartranslation.github.io';
  var PROXY = 'clayjartranslation-github-io.translate.goog';
  var KEY = 'ctb-lang';
  var TR_KEYS = ['_x_tr_sl', '_x_tr_tl', '_x_tr_hl', '_x_tr_pto', '_x_tr_hist', '_x_tr_sch', '_x_tr_enc', '_ctb_lang'];
  var LANGUAGES = root.CTB_LANGUAGES || [];
  var byCode = { en: { code: 'en', english: 'English', label: 'English', rtl: false } };
  LANGUAGES.forEach(function (item) { if (item && item.code) byCode[item.code] = item; });

  function isProxyHost(host) {
    return host === PROXY || /\.translate\.goog$/i.test(host || '');
  }
  function isProdHost(host) {
    return host === PROD || host === 'www.' + PROD;
  }
  function known(code) {
    return typeof code === 'string' && Object.prototype.hasOwnProperty.call(byCode, code);
  }
  function urlFor(loc, code) {
    if (!known(code)) return null;
    var host = loc.hostname || '';
    var onProxy = isProxyHost(host);
    var onProd = isProdHost(host);
    var params = new URLSearchParams(loc.search || '');
    TR_KEYS.forEach(function (k) { params.delete(k); });
    var hash = loc.hash || '';
    var path = loc.pathname || '/';
    if (code === 'en') {
      if (onProxy) params.set('_ctb_lang', 'en');
      var qEn = params.toString();
      var originHost = onProxy ? PROD : host;
      var proto = (onProxy || onProd) ? 'https:' : (loc.protocol || 'https:');
      return proto + '//' + originHost + path + (qEn ? '?' + qEn : '') + hash;
    }
    if (!onProxy && !onProd) return null;
    params.set('_x_tr_sl', 'en');
    params.set('_x_tr_tl', code);
    params.set('_x_tr_hl', code);
    params.set('_x_tr_pto', 'wapp');
    return 'https://' + (onProxy ? host : PROXY) + path + '?' + params.toString() + hash;
  }

  root.CTBLang = {
    PROD: PROD,
    PROXY: PROXY,
    KEY: KEY,
    languages: LANGUAGES,
    known: known,
    isProxyHost: isProxyHost,
    isProdHost: isProdHost,
    urlFor: urlFor
  };

  if (!root.document || !root.location) return;
  var document = root.document;
  var location = root.location;
  var localStorage = root.localStorage;

  if (root.top && root.top !== root.self) {
    try { root.top.location.replace(location.href); } catch (e) {}
    try { document.documentElement.setAttribute('hidden', ''); } catch (e2) {}
    return;
  }

  try {
    var savedSettings = JSON.parse(localStorage.getItem('ctb-settings') || '{}');
    var docEl = document.documentElement;
    if (savedSettings.theme === 'dark' || savedSettings.theme === 'light') docEl.dataset.theme = savedSettings.theme;
    if (typeof savedSettings.size === 'number' && savedSettings.size >= 14 && savedSettings.size <= 30) {
      docEl.style.setProperty('--read-size', String(savedSettings.size) + 'px');
    }
    if (savedSettings.notes === false) docEl.classList.add('notes-off');
  } catch (e) {}

  function readSaved() {
    try {
      var value = localStorage.getItem(KEY);
      return known(value) ? value : 'en';
    } catch (err) { return 'en'; }
  }
  function writeSaved(code) {
    try { localStorage.setItem(KEY, code); } catch (err) {}
  }

  var params = new URLSearchParams(location.search);
  var handoff = params.get('_ctb_lang');
  if (known(handoff)) {
    writeSaved(handoff);
    params.delete('_ctb_lang');
  }
  var locNow = {
    protocol: location.protocol,
    hostname: location.hostname,
    pathname: location.pathname,
    search: params.toString() ? '?' + params.toString() : '',
    hash: location.hash
  };
  if (isProdHost(location.hostname) && known(handoff) && handoff !== 'en') {
    var hopped = urlFor(locNow, handoff);
    if (hopped) { location.replace(hopped); return; }
  }
  if (isProdHost(location.hostname) && handoff === 'en') {
    history.replaceState(null, '', locNow.pathname + locNow.search + locNow.hash);
  }
  if (isProdHost(location.hostname) && !known(handoff)) {
    var remembered = readSaved();
    if (remembered !== 'en') {
      var back = urlFor(locNow, remembered);
      if (back) { location.replace(back); return; }
    }
  }

  function currentCode() {
    if (isProxyHost(location.hostname)) {
      var fromUrl = new URLSearchParams(location.search).get('_x_tr_tl');
      if (known(fromUrl)) return fromUrl;
    }
    return readSaved();
  }

  function applyDirection(code) {
    var item = byCode[code];
    if (!isProxyHost(location.hostname) || !item || code === 'en') return;
    document.documentElement.lang = code;
    document.documentElement.dir = item.rtl ? 'rtl' : 'ltr';
  }

  function showNotice(code) {
    var notice = document.getElementById('langNotice');
    if (!notice) return;
    var active = isProxyHost(location.hostname) && code !== 'en';
    notice.hidden = !active;
  }

  function globe() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '9');
    svg.appendChild(circle);
    ['M3 12h18', 'M12 3c2.6 2.8 3.9 5.8 3.9 9s-1.3 6.2-3.9 9c-2.6-2.8-3.9-5.8-3.9-9s1.3-6.2 3.9-9z'].forEach(function (d) {
      var path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    });
    return svg;
  }

  function mount() {
    var nav = document.querySelector('.site-nav');
    if (!nav || document.getElementById('site-lang')) return;
    var code = currentCode();
    applyDirection(code);
    showNotice(code);
    var wrap = document.createElement('div');
    wrap.className = 'lang-switch';
    var label = document.createElement('label');
    label.className = 'lang-face';
    label.htmlFor = 'site-lang';
    label.appendChild(globe());
    var word = document.createElement('span');
    word.className = 'lang-word';
    word.textContent = 'Language';
    label.appendChild(word);
    var select = document.createElement('select');
    select.id = 'site-lang';
    select.setAttribute('aria-label', 'Language');
    var english = document.createElement('option');
    english.value = 'en';
    english.textContent = 'English';
    select.appendChild(english);
    LANGUAGES.forEach(function (item) {
      var option = document.createElement('option');
      option.value = item.code;
      option.textContent = item.label;
      select.appendChild(option);
    });
    select.value = known(code) ? code : 'en';
    select.addEventListener('change', function () {
      var next = select.value;
      if (!known(next)) return;
      writeSaved(next);
      var dest = urlFor(location, next);
      if (!dest || dest === location.href) {
        applyDirection(next);
        showNotice(next);
        return;
      }
      location.assign(dest);
    });
    wrap.appendChild(label);
    wrap.appendChild(select);
    nav.appendChild(wrap);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})(typeof globalThis !== 'undefined' ? globalThis : this);
