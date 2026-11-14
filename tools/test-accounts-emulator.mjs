/* End-to-end check against the Auth and Firestore emulators.
   Run under: npx firebase-tools emulators:exec --only auth,firestore --project demo-clayjar
   The emulator test injects its own config in the browser and does not use the live project. */
import { createRequire } from 'module';
import { mkdirSync } from 'fs';

const require = createRequire('/tmp/fb/node_modules/firebase/package.json');
const { initializeApp, deleteApp } = require('firebase/app');
const {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
} = require('firebase/auth');
const {
  getFirestore, connectFirestoreEmulator, doc, collection, setDoc, getDoc, getDocs, deleteDoc,
} = require('firebase/firestore');
const puppeteer = require('/tmp/audit-tools/node_modules/puppeteer-core');
const BASE = process.env.SITE_URL || 'http://127.0.0.1:8765/';
const HOST = '127.0.0.1';
const PROJECT = 'demo-clayjar';
const firebaseConfig = {
  apiKey: 'demo-api-key',
  authDomain: PROJECT + '.firebaseapp.com',
  projectId: PROJECT,
  appId: '1:0:web:demo',
};
const browserConfig = Object.assign({}, firebaseConfig, {
  useEmulator: true,
  apple: false,
  bibleId: 'ctb',
  emulatorHost: HOST,
  authEmulatorPort: 9099,
  firestoreEmulatorPort: 8080,
});

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function client(name) {
  const app = initializeApp(firebaseConfig, name);
  const auth = getAuth(app);
  const db = getFirestore(app);
  connectAuthEmulator(auth, 'http://' + HOST + ':9099', { disableWarnings: true });
  connectFirestoreEmulator(db, HOST, 8080);
  return { app, auth, db };
}

async function rules() {
  const a = client('rules-a');
  const b = client('rules-b');
  const stamp = Date.now();
  const emailA = 'rules-a-' + stamp + '@example.com';
  const emailB = 'rules-b-' + stamp + '@example.com';
  const pass = 'correct-horse-1';
  const userA = await createUserWithEmailAndPassword(a.auth, emailA, pass);
  const userB = await createUserWithEmailAndPassword(b.auth, emailB, pass);
  const uid = userA.user.uid;
  await setDoc(doc(a.db, 'users', uid), { createdAt: new Date(), updatedAt: new Date() });
  await setDoc(doc(a.db, 'users', uid, 'bibles', 'ctb'), {
    schema: 1,
    reading: { book: 'genesis', name: 'Genesis', ch: 1, v: 3, t: stamp },
  });
  await setDoc(doc(a.db, 'users', uid, 'bibles', 'ctb', 'bookmarks', 'bm1'), {
    id: 'bm1', book: 'genesis', name: 'Genesis', ch: 1, v: 1, text: 'In the beginning', t: stamp, deleted: false,
  });
  await setDoc(doc(a.db, 'users', uid, 'bibles', 'cjt'), {
    schema: 1,
    reading: { book: 'matthew', name: 'Matthew', ch: 5, v: 1, t: stamp },
  });
  const own = await getDoc(doc(a.db, 'users', uid, 'bibles', 'ctb', 'bookmarks', 'bm1'));
  assert(own.exists() && own.data().text === 'In the beginning', 'owner can read their bookmark');

  let denied = false;
  try { await getDoc(doc(b.db, 'users', uid, 'bibles', 'ctb', 'bookmarks', 'bm1')); }
  catch (e) { denied = /permission-denied|insufficient/i.test(e.code || e.message || ''); }
  assert(denied, 'another account cannot read this bookmark');

  denied = false;
  try {
    await setDoc(doc(b.db, 'users', uid, 'bibles', 'ctb', 'bookmarks', 'evil'), { id: 'evil', t: 1 });
  } catch (e) { denied = /permission-denied|insufficient/i.test(e.code || e.message || ''); }
  assert(denied, 'another account cannot write this bookmark');

  await signOut(a.auth);
  denied = false;
  try { await getDoc(doc(a.db, 'users', uid, 'bibles', 'ctb')); }
  catch (e) { denied = /permission-denied|insufficient/i.test(e.code || e.message || ''); }
  assert(denied, 'signed-out client cannot read the account');

  await signInWithEmailAndPassword(a.auth, emailA, pass);
  let rejected = false;
  try {
    await setDoc(doc(a.db, 'users', uid, 'bibles', 'ctb', 'bookmarks', 'huge'), {
      id: 'huge', t: 1, text: 'x'.repeat(20000),
    });
  } catch (e) { rejected = true; }
  assert(rejected, 'an oversized bookmark is rejected');

  rejected = false;
  try { await setDoc(doc(a.db, 'users', uid, 'bibles', 'ctb'), { reading: { book: 'genesis', ch: 1, v: 1, t: 1 } }); }
  catch (e) { rejected = true; }
  assert(rejected, 'a bible document without schema 1 is rejected');

  await deleteDoc(doc(a.db, 'users', uid, 'bibles', 'ctb', 'bookmarks', 'bm1'));
  await deleteApp(a.app);
  await deleteApp(b.app);
  console.log('rules: ok');
}

async function browserFlow() {
  mkdirSync('/opt/cursor/artifacts', { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const bare = await browser.newPage();
    await bare.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await bare.goto(BASE + '#/', { waitUntil: 'networkidle0', timeout: 20000 });
    const hidden = await bare.evaluate(() => {
      const link = document.querySelector('a[href="#/account"]');
      const shown = link && getComputedStyle(link).display !== 'none';
      return { accounts: document.documentElement.dataset.accounts || '', shown: !!shown, blurb: !!document.getElementById('accountBlurb') && getComputedStyle(document.getElementById('accountBlurb')).display !== 'none' };
    });
    assert(!hidden.accounts && !hidden.shown && !hidden.blurb, 'empty config must hide sign-in: ' + JSON.stringify(hidden));
    await bare.goto(BASE + '#/account', { waitUntil: 'domcontentloaded' });
    const offlineOnly = await bare.evaluate(() => ({
      google: !!document.getElementById('acctGoogle'),
      phone: !!document.getElementById('acctPhoneSend'),
      backup: !!document.getElementById('acctExport'),
      signIn: /sign in with google/i.test(document.body.innerText),
    }));
    assert(!offlineOnly.google && !offlineOnly.phone && !offlineOnly.signIn && offlineOnly.backup, 'empty config offers backup only: ' + JSON.stringify(offlineOnly));
    await bare.close();
    console.log('empty config: ok');

    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    page.on('pageerror', (err) => console.log('pageerror', err.message));
    page.on('console', (msg) => { if (msg.type() === 'error' || msg.type() === 'warning') console.log('console', msg.type(), msg.text()); });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.setCacheEnabled(false);
    await page.evaluateOnNewDocument((cfg) => { window.CLAYJAR_ACCOUNTS = cfg; }, browserConfig);
    const email = 'reader-' + Date.now() + '@example.com';
    const pass = 'correct-horse-1';
    await page.goto(BASE + '#/account', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#acctEmail', { timeout: 25000 });
    const providers = await page.evaluate(() => ({
      google: !!document.getElementById('acctGoogle'),
      apple: !!document.getElementById('acctApple'),
      privacy: (document.querySelector('.account-privacy') || {}).textContent || '',
    }));
    assert(providers.google, 'Google sign-in is offered');
    assert(!providers.apple, 'Apple stays hidden while the flag is off');
    const optIn = await page.evaluate(() => ({
      note: /on this device until you sign in/i.test(document.body.innerText),
      phone: !!document.getElementById('acctPhoneSend'),
      backup: !!document.getElementById('acctExport'),
    }));
    assert(optIn.note && optIn.backup && !optIn.phone, 'sign-in note and backup, no phone button: ' + JSON.stringify(optIn));
    assert(/on this device/i.test(providers.privacy) && /no ads/i.test(providers.privacy) && /Privacy Policy/i.test(providers.privacy), 'privacy note is on the account page');
    await page.screenshot({ path: '/opt/cursor/artifacts/mobile-account-signed-out.png' });
    await page.type('#acctEmail', email);
    await page.click('#acctReset');
    await page.waitForFunction(() => {
      const el = document.getElementById('acctError');
      return el && /reset link/i.test(el.textContent || '');
    }, { timeout: 15000 });
    console.log('password reset: ok');
    await page.type('#acctPass', pass);
    await page.click('#acctCreate');
    await page.waitForSelector('#acctSignOut', { timeout: 20000 });
    await page.screenshot({ path: '/opt/cursor/artifacts/mobile-account-signed-in.png' });

    await page.evaluate(() => { location.hash = '#/read/genesis/1'; });
    await page.waitForSelector('#v1', { timeout: 15000 });
    await page.click('#v1 .vnum');
    await page.waitForSelector('#tbBm', { visible: true, timeout: 5000 });
    await page.click('#tbBm');
    await page.waitForFunction(() => document.getElementById('v1').classList.contains('bm'), { timeout: 5000 });
    const probe = client('probe-ui');
    const signed = await signInWithEmailAndPassword(probe.auth, email, pass);
    let saw = false;
    for (let i = 0; i < 25 && !saw; i++) {
      const snap = await getDocs(collection(probe.db, 'users', signed.user.uid, 'bibles', 'ctb', 'bookmarks'));
      saw = snap.docs.some((d) => d.data() && d.data().book === 'genesis' && !d.data().deleted);
      if (!saw) await new Promise((r) => setTimeout(r, 400));
    }
    assert(saw, 'the bookmark reached Firestore');
    await signOut(probe.auth);
    await deleteApp(probe.app);

    const other = await browser.createBrowserContext();
    const page2 = await other.newPage();
    page2.on('pageerror', (err) => console.log('page2', err.message));
    await page2.setViewport({ width: 412, height: 915, deviceScaleFactor: 1 });
    await page2.setCacheEnabled(false);
    await page2.evaluateOnNewDocument((cfg) => { window.CLAYJAR_ACCOUNTS = cfg; }, browserConfig);
    await page2.goto(BASE + '#/account', { waitUntil: 'domcontentloaded' });
    await page2.waitForSelector('#acctEmail', { timeout: 25000 });
    await page2.type('#acctEmail', email);
    await page2.type('#acctPass', pass);
    await page2.click('#acctSignIn');
    await page2.waitForSelector('#acctSignOut', { timeout: 20000 });
    await page2.evaluate(() => { location.hash = '#/read/genesis/1'; });
    await page2.waitForFunction(() => {
      const el = document.getElementById('v1');
      return el && el.classList.contains('bm');
    }, { timeout: 20000 });
    console.log('two devices: bookmark synced');

    await page.goto(BASE + '#/account', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#acctSignOut', { timeout: 15000 });
    await page.evaluate(() => document.getElementById('acctSignOut').click());
    await page.waitForSelector('#acctOutKeep', { timeout: 10000 });
    await page.waitForSelector('#acctOutClear');
    await page.evaluate(() => document.getElementById('acctOutCancel').click());
    await page.waitForSelector('#acctDelete', { timeout: 15000 });
    await page.evaluate(() => document.getElementById('acctDelete').click());
    await page.waitForSelector('#acctDeleteConfirm', { timeout: 10000 });
    if (await page.$('#acctAgain')) await page.type('#acctAgain', pass);
    await page.evaluate(() => {
      const btn = document.getElementById('acctDeleteConfirm');
      if (btn) btn.click();
    });
    try {
      await page.waitForSelector('#acctCreate', { timeout: 20000 });
    } catch (err) {
      const snap = await page.evaluate(() => document.getElementById('main') ? document.getElementById('main').innerText : document.body.innerText);
      console.log('delete screen:\n' + snap);
      await page.screenshot({ path: '/tmp/delete-fail.png' });
      throw err;
    }
    await page.type('#acctEmail', email);
    await page.type('#acctPass', pass);
    await page.evaluate(() => document.getElementById('acctForm').requestSubmit());
    await page.waitForFunction(() => {
      const el = document.getElementById('acctError');
      return el && !el.hidden && (el.textContent || '').length > 0;
    }, { timeout: 20000 });
    console.log('delete account: ok');
    await other.close();
    await context.close();
  } finally {
    await browser.close();
  }
}

await rules();
await browserFlow();
console.log('accounts emulator: ok');
