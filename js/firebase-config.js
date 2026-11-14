/* Clay Jar Treasure Bible — optional account sync
   This site uses its own Firebase project (clayjar-treasure, bibleId "ctb").
   The Clay Jar Translation uses a separate project and a different data shape,
   so do not copy this config into that repo.
   Full steps: SETUP-ACCOUNTS.md.

   Leave the strings below empty (and useEmulator false) to hide sign-in. Reading,
   listening, bookmarks, and highlights then stay on this device exactly as before.

   A test may set window.CLAYJAR_ACCOUNTS before this file runs. A filled-in test
   config is kept so the committed file can stay empty. */
(function () {
  var existing = window.CLAYJAR_ACCOUNTS;
  var filled = existing && (
    (existing.useEmulator === true && existing.projectId) ||
    (existing.apiKey && existing.authDomain && existing.projectId && existing.appId)
  );
  if (filled) return;
  window.CLAYJAR_ACCOUNTS = {
    apiKey: 'AIzaSyBjfc8SVqHfIEuXLj1YxQsygLdvj53Z5gc',
    authDomain: 'clayjar-treasure.firebaseapp.com',
    projectId: 'clayjar-treasure',
    appId: '1:296625615324:web:5065cb3bef07731fdd9f19',
    /* Sign in with Apple is built, but it stays off until a paid Apple Developer account exists. */
    apple: false,
    /* Phone sign-in is built, but it stays off. SMS costs money and needs the Blaze plan, not Spark. */
    phone: false,
    /* Which Bible this site saves. Do not change this on the Treasure Bible. */
    bibleId: 'ctb',
    /* Local emulator only. Keep false on GitHub Pages. */
    useEmulator: false,
    emulatorHost: '127.0.0.1',
    authEmulatorPort: 9099,
    firestoreEmulatorPort: 8080
  };
})();
