/* Optional account sync. Reading stays free when this file finds an empty config:
   it does not load Firebase and it does not add a sign-in screen.
   With a filled-in config, progress for this Bible is stored at
   users/{uid}/bibles/{bibleId} in the shared Clay Jar Firebase project.
   See SETUP-ACCOUNTS.md and js/sync-merge.js. */
(function () {
  'use strict';

  var cfg = window.CLAYJAR_ACCOUNTS || {};
  var Sync = window.ClayJarSync;
  if (!Sync || !Sync.configEnabled(cfg)) {
    window.ClayJarAccounts = {
      enabled: false,
      whenReady: function () { return Promise.resolve(); },
      renderAccount: function () {},
      noteChange: function () {},
      currentUser: function () { return null; }
    };
    return;
  }

  var bibleId = (typeof cfg.bibleId === 'string' && /^[a-z0-9-]{2,16}$/.test(cfg.bibleId)) ? cfg.bibleId : 'ctb';
  var SDK = '12.6.0';
  var auth = null, db = null, user = null, authReady = false, readyWaiters = [];
  var unsubs = [], gen = 0, flushTimer = 0, reconciling = false, queued = false;
  var remote = emptyRemote();
  var got = { state: false, bm: false, hl: false };
  var saveLabel = '';
  var booted = false;

  function emptyRemote() {
    return { reading: null, audio: null, audioSettings: null, bookmarks: [], highlights: [], pending: false };
  }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg) {
    try { window.dispatchEvent(new CustomEvent('ctb-toast', { detail: msg })); } catch (e) {}
  }
  function whenReady() {
    if (authReady) return Promise.resolve();
    return new Promise(function (resolve) { readyWaiters.push(resolve); });
  }
  function markReady() {
    authReady = true;
    readyWaiters.splice(0).forEach(function (fn) { fn(); });
  }
  function explain(e) {
    var c = (e && e.code) || '';
    var map = {
      'auth/invalid-email': 'That email does not look right.',
      'auth/missing-email': 'Enter your email.',
      'auth/user-disabled': 'This account has been disabled.',
      'auth/user-not-found': 'No account for that email yet. Create one, or check the spelling.',
      'auth/wrong-password': 'That password does not match.',
      'auth/invalid-credential': 'That email and password do not match.',
      'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
      'auth/weak-password': 'Use at least 8 characters for the password.',
      'auth/too-many-requests': 'Too many tries. Wait a little, then try again.',
      'auth/network-request-failed': 'The network blocked sign-in. Reading on this device is unchanged.',
      'auth/popup-blocked': 'The browser blocked the sign-in window. Allow pop-ups for this site, or try again.',
      'auth/unauthorized-domain': 'This site is not on the account project’s authorized domains yet.',
      'auth/requires-recent-login': 'Please sign in again, then delete the account.',
      'auth/operation-not-allowed': 'That sign-in method is turned off in the account project.',
      'auth/invalid-api-key': 'The account config’s API key was rejected.',
      'auth/missing-password': 'Enter a password.',
      'auth/popup-closed-by-user': '',
      'auth/cancelled-popup-request': ''
    };
    if (c && Object.prototype.hasOwnProperty.call(map, c)) return map[c];
    return 'Something went wrong' + (c ? ' (' + c + ').' : '.');
  }

  function paintChrome() {
    var el = document.getElementById('accountBlurb');
    if (!el) return;
    if (!user) el.textContent = 'Sign in to save your place, bookmarks, highlights, and listening position on your other devices. Reading stays free without an account.';
    else el.textContent = 'Signed in' + (user.email ? ' as ' + user.email : '') + '. ' + (saveLabel || 'Progress saves to your account.');
  }

  function renderAccount(main) {
    if (!main) return;
    document.title = 'Account · CTB';
    if (!authReady) {
      main.innerHTML = '<h1>Account</h1><p class="loading">Loading account…</p>';
      return;
    }
    if (!auth || !authMods) {
      main.innerHTML = '<h1>Account</h1><p class="empty">Sign-in could not start. Check the connection and refresh. Reading on this device still works.</p>';
      return;
    }
    var privacy = '<section class="card account-privacy" aria-labelledby="privTitle"><h2 id="privTitle">Privacy</h2>'
      + '<p>Sign-in is optional. You can read and listen with no account and no ads. If you sign in, this site stores your reading place, bookmarks, highlights, listening place, and listening settings under your account so another device can pick them up. The Clay Jar Translation can use the same sign-in; that Bible keeps its own progress. Passwords are handled by Firebase Authentication. Google shares only the email and name it provides. Nothing here is sold. Delete my data and account removes the sign-in and the saved progress for both Bibles.</p></section>';
    if (!user) {
      main.innerHTML = '<h1>Account</h1>'
        + '<p class="muted">Optional. Use it only if you want this Bible’s place, bookmarks, highlights, and listening position on your other devices.</p>'
        + '<div class="card account-card"><div class="account-actions">'
        + '<button type="button" class="btn account-provider" id="acctGoogle">Sign in with Google</button>'
        + (cfg.apple === true ? '<button type="button" class="btn account-provider" id="acctApple">Sign in with Apple</button>' : '')
        + '</div><form class="account-form" id="acctForm">'
        + '<label for="acctEmail">Email</label><input id="acctEmail" name="email" type="email" autocomplete="username" inputmode="email" required>'
        + '<label for="acctPass">Password</label><input id="acctPass" name="password" type="password" autocomplete="current-password" minlength="8" required>'
        + '<p class="account-error" id="acctError" role="alert" hidden></p>'
        + '<div class="account-actions">'
        + '<button type="submit" class="btn primary" id="acctSignIn">Sign in</button>'
        + '<button type="button" class="btn" id="acctCreate">Create account</button>'
        + '<button type="button" class="btn" id="acctReset">Email me a password reset</button>'
        + '</div></form></div>' + privacy;
      wireSignedOut();
      return;
    }
    main.innerHTML = '<h1>Account</h1>'
      + '<div class="card account-card"><p class="account-who">' + esc(user.email || 'Signed in') + '</p>'
      + '<p class="account-status" id="acctStatus" role="status">' + esc(saveLabel || 'Saved to your account.') + '</p>'
      + '<p class="muted">This Bible’s place, bookmarks, highlights, and listening position are stored under your account, separate from the Clay Jar Translation.</p>'
      + '<div class="account-actions"><button type="button" class="btn" id="acctSignOut">Sign out</button></div>'
      + '<div class="account-danger" id="acctDanger"><button type="button" class="btn account-delete" id="acctDelete">Delete my data and account</button></div>'
      + '</div>' + privacy;
    $('#acctSignOut').addEventListener('click', function () { signOutUser(); });
    $('#acctDelete').addEventListener('click', confirmDelete);
  }

  function showError(msg) {
    var el = document.getElementById('acctError');
    if (!el) { if (msg) toast(msg); return; }
    el.hidden = !msg;
    el.textContent = msg || '';
  }
  function emailPass() {
    var email = ($('#acctEmail').value || '').trim();
    var pass = $('#acctPass').value || '';
    if (!email || !pass) { showError('Enter your email and password.'); return null; }
    if (pass.length < 8) { showError('Use at least 8 characters for the password.'); return null; }
    return { email: email, pass: pass };
  }
  function preferRedirect() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
  }

  function wireSignedOut() {
    $('#acctForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var cred = emailPass();
      if (!cred) return;
      showError('');
      authMods.signInWithEmailAndPassword(auth, cred.email, cred.pass).catch(function (err) { showError(explain(err)); });
    });
    $('#acctCreate').addEventListener('click', function () {
      var cred = emailPass();
      if (!cred) return;
      $('#acctPass').autocomplete = 'new-password';
      showError('');
      authMods.createUserWithEmailAndPassword(auth, cred.email, cred.pass).catch(function (err) { showError(explain(err)); });
    });
    $('#acctReset').addEventListener('click', function () {
      var email = ($('#acctEmail').value || '').trim();
      if (!email) { showError('Enter your email, then ask for the reset.'); return; }
      showError('');
      authMods.sendPasswordResetEmail(auth, email).then(function () {
        showError('');
        toast('If an account exists for that email, a reset link is on its way.');
        var el = document.getElementById('acctError');
        if (el) { el.hidden = false; el.textContent = 'If an account exists for that email, a reset link is on its way. Check your inbox.'; }
      }).catch(function (err) {
        var code = err && err.code;
        if (code === 'auth/user-not-found') {
          var el = document.getElementById('acctError');
          if (el) { el.hidden = false; el.textContent = 'If an account exists for that email, a reset link is on its way. Check your inbox.'; }
          return;
        }
        showError(explain(err));
      });
    });
    $('#acctGoogle').addEventListener('click', function () { signInProvider(googleProvider()); });
    var appleBtn = $('#acctApple');
    if (appleBtn) appleBtn.addEventListener('click', function () { signInProvider(appleProvider()); });
  }

  var authMods = null, fsMods = null;
  function googleProvider() {
    var p = new authMods.GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    return p;
  }
  function appleProvider() {
    var p = new authMods.OAuthProvider('apple.com');
    p.addScope('email');
    p.addScope('name');
    return p;
  }
  function signInProvider(provider) {
    showError('');
    var run = preferRedirect() ? authMods.signInWithRedirect : authMods.signInWithPopup;
    run(auth, provider).catch(function (err) {
      if (err && err.code === 'auth/popup-blocked') {
        authMods.signInWithRedirect(auth, provider).catch(function (e2) { showError(explain(e2)); });
        return;
      }
      var msg = explain(err);
      if (msg) showError(msg);
    });
  }
  function signOutUser() {
    authMods.signOut(auth).then(function () { toast('Signed out. This device keeps its own copy.'); }).catch(function (err) { toast(explain(err)); });
  }

  function confirmDelete() {
    var box = document.getElementById('acctDanger');
    if (!box || !user) return;
    var needsPass = user.providerData && user.providerData.some(function (p) { return p.providerId === 'password'; });
    box.innerHTML = '<p><strong>Delete everything saved to this account?</strong> This removes the sign-in and the cloud progress for both the Clay Jar Treasure Bible and the Clay Jar Translation, and the copy of that progress on this device. The Bible text stays free to read. This cannot be undone.</p>'
      + (needsPass ? '<label for="acctAgain">Password <span class="visually-hidden">to confirm deletion</span></label><input id="acctAgain" type="password" autocomplete="current-password">' : '')
      + '<div class="account-actions"><button type="button" class="btn account-delete" id="acctDeleteConfirm">Delete forever</button><button type="button" class="btn" id="acctDeleteCancel">Cancel</button></div>'
      + '<p class="account-error" id="acctError" role="alert" hidden></p>';
    $('#acctDeleteCancel').addEventListener('click', function () { renderAccount($('#main')); });
    $('#acctDeleteConfirm').addEventListener('click', function () {
      doDelete(needsPass ? ($('#acctAgain').value || '') : '');
    });
  }

  function doDelete(password) {
    var current = user;
    if (!current) return;
    var again = password
      ? authMods.reauthenticateWithCredential(current, authMods.EmailAuthProvider.credential(current.email, password))
      : Promise.resolve();
    again.then(function () { return wipeAccount(current); }).then(function () {
      return authMods.deleteUser(current);
    }).then(function () {
      if (window.CTBSync && CTBSync.clearProgress) CTBSync.clearProgress();
      try { localStorage.removeItem('ctb-sync-owner'); } catch (e) {}
      toast('Account deleted. Reading on this device can continue without it.');
      renderAccount($('#main'));
    }).catch(function (err) {
      if (err && err.code === 'auth/requires-recent-login' && !password) {
        showError('Please sign in again, then delete the account.');
        return;
      }
      showError(explain(err));
    });
  }

  function wipeAccount(current) {
    var uid = current.uid;
    var col = fsMods.collection, dref = fsMods.doc, getDocs = fsMods.getDocs, writeBatch = fsMods.writeBatch, deleteDoc = fsMods.deleteDoc;
    function wipeCol(ref) {
      return getDocs(ref).then(function (snap) {
        var batch = writeBatch(db), n = 0, chain = Promise.resolve();
        snap.docs.forEach(function (item) {
          batch.delete(item.ref);
          n++;
          if (n === 400) {
            var b = batch; batch = writeBatch(db); n = 0;
            chain = chain.then(function () { return b.commit(); });
          }
        });
        if (n) chain = chain.then(function () { return batch.commit(); });
        return chain;
      });
    }
    var root = col(db, 'users', uid, 'bibles');
    return getDocs(root).then(function (snap) {
      var ids = { cjt: 1, ctb: 1 };
      snap.docs.forEach(function (item) { ids[item.id] = 1; });
      var idsList = Object.keys(ids);
      return idsList.reduce(function (p, id) {
        return p.then(function () {
          return wipeCol(col(db, 'users', uid, 'bibles', id, 'bookmarks'))
            .then(function () { return wipeCol(col(db, 'users', uid, 'bibles', id, 'highlights')); })
            .then(function () { return deleteDoc(dref(db, 'users', uid, 'bibles', id)).catch(function () {}); });
        });
      }, Promise.resolve());
    }).then(function () {
      return deleteDoc(dref(db, 'users', uid)).catch(function () {});
    });
  }

  function ownerKey() { try { return localStorage.getItem('ctb-sync-owner') || ''; } catch (e) { return ''; } }
  function setOwner(uid) { try { localStorage.setItem('ctb-sync-owner', uid); } catch (e) {} }

  function canon(snap) {
    var m = Sync.mergeSnapshots(snap, snap);
    var pack = function (o) { return Object.keys(o || {}).sort().map(function (k) { return k + '=' + o[k]; }).join(','); };
    var items = function (list, fields) {
      return (list || []).slice().sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; })
        .map(function (row) { return fields.map(function (f) { return row[f]; }).join('\u001f'); }).join('\n');
    };
    return [
      items(m.bookmarks, ['id', 'book', 'ch', 'v', 'text', 't']),
      items(m.highlights, ['id', 'book', 'ch', 'v', 's', 'e', 'color', 'text', 'whole', 't']),
      pack(m.tombs.bm) + '#' + pack(m.tombs.hl),
      m.reading ? [m.reading.book, m.reading.ch, m.reading.v, m.reading.t].join('|') : '',
      m.audio ? [m.audio.book, m.audio.ch, m.audio.v, m.audio.time, m.audio.mode, m.audio.narr, m.audio.t].join('|') : '',
      m.audioSettings ? [m.audioSettings.rate, m.audioSettings.voice, m.audioSettings.voiceName, m.audioSettings.autoNext, m.audioSettings.narr, m.audioSettings.sleepChoice, m.audioSettings.sleepCustom, m.audioSettings.t].join('|') : ''
    ].join('\u0002');
  }

  function remoteSnap() {
    return {
      bookmarks: remote.bookmarks, highlights: remote.highlights, tombs: { bm: {}, hl: {} },
      reading: remote.reading, audio: remote.audio, audioSettings: remote.audioSettings
    };
  }

  function setSaveLabel(text) {
    saveLabel = text;
    paintChrome();
    var el = document.getElementById('acctStatus');
    if (el && user) el.textContent = text;
  }

  function scheduleReconcile() {
    if (!user || !got.state || !got.bm || !got.hl) return;
    if (reconciling) { queued = true; return; }
    reconciling = true;
    var token = gen;
    reconcile().catch(function (err) {
      console.warn('Account sync failed', err);
      setSaveLabel('Saved on this device. The account could not be reached just now.');
    }).then(function () {
      if (token !== gen) return;
      reconciling = false;
      if (queued) { queued = false; scheduleReconcile(); }
    });
  }

  function reconcile() {
    if (!window.CTBSync || !user) return Promise.resolve();
    var raw = CTBSync.snapshot();
    var local = Sync.localForAccount(ownerKey(), user.uid, raw);
    var merged = Sync.mergeSnapshots(local, remoteSnap());
    var localSig = canon(local);
    var mergedSig = canon(merged);
    var remoteSig = canon(remoteSnap());
    if (mergedSig !== localSig && CTBSync.apply) {
      CTBSync.applying = true;
      try { CTBSync.apply(merged); } finally { CTBSync.applying = false; }
    }
    setOwner(user.uid);
    if (mergedSig === remoteSig) {
      setSaveLabel(remote.pending ? 'Saving to your account…' : 'Saved to your account.');
      return Promise.resolve();
    }
    setSaveLabel('Saving to your account…');
    return push(merged).then(function () {
      setSaveLabel('Saved to your account.');
    });
  }

  function changed(prev, item) {
    if (!prev) return true;
    if ((prev.t || 0) !== (item.t || 0) || !!prev.deleted !== !!item.deleted) return true;
    if ((prev.text || '') !== (item.text || '')) return true;
    if ((prev.color || '') !== (item.color || '')) return true;
    if ((prev.e || 0) !== (item.e || 0) || (prev.s || 0) !== (item.s || 0)) return true;
    if ((prev.book || '') !== (item.book || '') || (prev.ch || 0) !== (item.ch || 0) || (prev.v || 0) !== (item.v || 0)) return true;
    if (!!prev.whole !== !!item.whole) return true;
    return false;
  }
  function push(merged) {
    var dref = fsMods.doc, setDoc = fsMods.setDoc, writeBatch = fsMods.writeBatch;
    var remoteBm = new Map(), remoteHl = new Map();
    (remote.bookmarks || []).forEach(function (b) { if (b && b.id) remoteBm.set(b.id, b); });
    (remote.highlights || []).forEach(function (h) { if (h && h.id) remoteHl.set(h.id, h); });
    var cur = Sync.mergeSnapshots(remoteSnap(), remoteSnap());
    var state = { schema: 1 };
    var stateDirty = false;
    function putState(key, next, same) {
      if (!next) return;
      if (same(cur[key], next)) return;
      state[key] = next;
      stateDirty = true;
    }
    putState('reading', merged.reading, function (a, b) {
      return a && b && a.book === b.book && a.ch === b.ch && a.v === b.v && a.t === b.t;
    });
    putState('audio', merged.audio, function (a, b) {
      return a && b && a.book === b.book && a.ch === b.ch && a.v === b.v && a.time === b.time && a.mode === b.mode && a.t === b.t;
    });
    putState('audioSettings', merged.audioSettings, function (a, b) {
      return a && a.t === b.t && a.rate === b.rate && a.voice === b.voice && a.autoNext === b.autoNext && a.narr === b.narr && a.sleepChoice === b.sleepChoice && a.sleepCustom === b.sleepCustom;
    });
    var bmOps = [], hlOps = [];
    function queue(list, map, bucket) {
      list.forEach(function (item) { if (changed(map.get(item.id), item)) bucket.push(item); });
    }
    queue(merged.bookmarks.map(function (b) {
      return { id: b.id, deleted: false, book: b.book, name: b.name || '', ch: b.ch, v: b.v, text: b.text || '', t: b.t || 0 };
    }), remoteBm, bmOps);
    queue(Object.keys(merged.tombs.bm).map(function (id) {
      return { id: id, deleted: true, t: merged.tombs.bm[id] || 0, book: '', name: '', ch: 0, v: 0, text: '' };
    }), remoteBm, bmOps);
    queue(merged.highlights.map(function (h) {
      return {
        id: h.id, deleted: false, book: h.book, name: h.name || '', ch: h.ch, v: h.v,
        s: h.s, e: h.e, color: h.color, text: h.text || '', whole: !!h.whole, t: h.t || 0
      };
    }), remoteHl, hlOps);
    queue(Object.keys(merged.tombs.hl).map(function (id) {
      return { id: id, deleted: true, t: merged.tombs.hl[id] || 0, book: '', name: '', ch: 0, v: 0, s: 0, e: 0, color: '', text: '', whole: false };
    }), remoteHl, hlOps);
    var chain = stateDirty ? setDoc(dref(db, 'users', user.uid, 'bibles', bibleId), state, { merge: true }) : Promise.resolve();
    function commit(colName, list) {
      var i = 0;
      function step() {
        if (i >= list.length) return Promise.resolve();
        var batch = writeBatch(db), n = 0;
        while (i < list.length && n < 400) {
          batch.set(dref(db, 'users', user.uid, 'bibles', bibleId, colName, list[i].id), list[i]);
          i++; n++;
        }
        return batch.commit().then(step);
      }
      return list.length ? step() : Promise.resolve();
    }
    return chain.then(function () { return commit('bookmarks', bmOps); }).then(function () { return commit('highlights', hlOps); });
  }

  function noteChange(kind) {
    if (!user || (window.CTBSync && CTBSync.applying)) return;
    var soon = kind === 'library' || kind === 'audioSettings';
    if (soon) {
      clearTimeout(flushTimer);
      flushTimer = setTimeout(function () { flushTimer = 0; scheduleReconcile(); }, 700);
      return;
    }
    /* Reading and listening keep moving. The first change starts the wait; later ones must not postpone it forever. */
    if (flushTimer) return;
    flushTimer = setTimeout(function () { flushTimer = 0; scheduleReconcile(); }, 8000);
  }
  function flushSoon() {
    if (!user) return;
    clearTimeout(flushTimer);
    scheduleReconcile();
  }

  function stopSync() {
    gen++;
    clearTimeout(flushTimer);
    unsubs.splice(0).forEach(function (fn) { try { fn(); } catch (e) {} });
    remote = emptyRemote();
    got = { state: false, bm: false, hl: false };
    reconciling = false;
    queued = false;
  }

  function startSync(current) {
    stopSync();
    var token = gen;
    var dref = fsMods.doc, col = fsMods.collection, onSnapshot = fsMods.onSnapshot, getDoc = fsMods.getDoc, setDoc = fsMods.setDoc, updateDoc = fsMods.updateDoc, serverTimestamp = fsMods.serverTimestamp;
    var profile = dref(db, 'users', current.uid);
    getDoc(profile).then(function (snap) {
      if (token !== gen) return;
      if (!snap.exists()) return setDoc(profile, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return updateDoc(profile, { updatedAt: serverTimestamp() });
    }).catch(function (err) { console.warn(err); });
    function arm(key, unsub) {
      unsubs.push(unsub);
      return unsub;
    }
    arm('state', onSnapshot(dref(db, 'users', current.uid, 'bibles', bibleId), function (snap) {
      if (token !== gen) return;
      var data = snap.exists() ? snap.data() : {};
      remote.reading = data.reading || null;
      remote.audio = data.audio || null;
      remote.audioSettings = data.audioSettings || null;
      remote.pending = !!(snap.metadata && snap.metadata.hasPendingWrites);
      got.state = true;
      scheduleReconcile();
    }, function (err) { console.warn(err); setSaveLabel('Saved on this device. The account could not be reached just now.'); }));
    arm('bm', onSnapshot(col(db, 'users', current.uid, 'bibles', bibleId, 'bookmarks'), function (snap) {
      if (token !== gen) return;
      remote.bookmarks = snap.docs.map(function (d) { return d.data(); });
      got.bm = true;
      scheduleReconcile();
    }, function (err) { console.warn(err); }));
    arm('hl', onSnapshot(col(db, 'users', current.uid, 'bibles', bibleId, 'highlights'), function (snap) {
      if (token !== gen) return;
      remote.highlights = snap.docs.map(function (d) { return d.data(); });
      got.hl = true;
      scheduleReconcile();
    }, function (err) { console.warn(err); }));
  }

  function onUser(next) {
    user = next || null;
    if (!authReady) markReady();
    paintChrome();
    if (user) startSync(user);
    else { stopSync(); setSaveLabel(''); paintChrome(); }
    if (/^#\/account\/?$/.test(location.hash) && booted) renderAccount(document.getElementById('main'));
  }

  function boot() {
    var base = 'https://www.gstatic.com/firebasejs/' + SDK + '/';
    Promise.all([
      import(base + 'firebase-app.js'),
      import(base + 'firebase-auth.js'),
      import(base + 'firebase-firestore.js')
    ]).then(function (mods) {
      var appMod = mods[0];
      authMods = mods[1];
      fsMods = mods[2];
      var app = appMod.initializeApp({
        apiKey: cfg.apiKey || 'demo-api-key',
        authDomain: cfg.authDomain || (cfg.projectId + '.firebaseapp.com'),
        projectId: cfg.projectId,
        appId: cfg.appId || '1:0:web:clayjar'
      });
      auth = authMods.getAuth(app);
      try {
        db = fsMods.initializeFirestore(app, {
          localCache: fsMods.persistentLocalCache({ tabManager: fsMods.persistentMultipleTabManager() })
        });
      } catch (err) {
        try { db = fsMods.initializeFirestore(app, { localCache: fsMods.memoryLocalCache() }); }
        catch (err2) { db = fsMods.getFirestore(app); }
      }
      if (cfg.useEmulator === true) {
        var host = cfg.emulatorHost || '127.0.0.1';
        authMods.connectAuthEmulator(auth, 'http://' + host + ':' + (cfg.authEmulatorPort || 9099), { disableWarnings: true });
        fsMods.connectFirestoreEmulator(db, host, cfg.firestoreEmulatorPort || 8080);
      }
      return authMods.getRedirectResult(auth).catch(function () { return null; });
    }).then(function () {
      authMods.onAuthStateChanged(auth, onUser);
      booted = true;
      document.addEventListener('visibilitychange', function () { if (document.hidden) flushSoon(); });
      window.addEventListener('pagehide', flushSoon);
    }).catch(function (err) {
      console.warn('Accounts did not start', err);
      markReady();
      paintChrome();
      window.ClayJarAccounts.loadError = explain(err);
    });
  }

  window.ClayJarAccounts = {
    enabled: true,
    bibleId: bibleId,
    whenReady: whenReady,
    renderAccount: renderAccount,
    noteChange: noteChange,
    currentUser: function () { return user; }
  };
  boot();
})();
