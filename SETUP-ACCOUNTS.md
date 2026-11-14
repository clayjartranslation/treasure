# Optional accounts for the Clay Jar Bibles

Sign-in is **optional**. Reading and listening stay free, with no ads and no required account. With the config file left empty, the Treasure Bible hides every account control and behaves as it does today: place, bookmarks, highlights, and listening stay on the device.

When the config is filled in, a reader can sign in with Google or with email and a password (including password reset). This site uses its own Firebase project (`clayjar-treasure`). The Clay Jar Translation uses a separate project (`clayjar-bible`) and a different data shape, so a sign-in on one site does not open the other site’s bookmarks.

Sign in with Apple is implemented and **turned off**. It needs a paid Apple Developer Program membership later. Leave `apple` set to `false` until then.

Phone-number sign-in is implemented and **turned off**. SMS messages cost money and Firebase Phone Auth requires the Blaze plan, so it stays off on Spark. Leave `phone` set to `false`.

Reading data stays on the device until a person signs in. The sign-in screen says what will sync. Signing in is the opt-in. The sign-in session is stored only in that browser (`browserLocalPersistence`).

## Why Firebase Spark (the free plan)

The free Spark plan covers this:

- **Authentication** for email/password and Google is free. Sign in with Apple is also free on Firebase; the cost that blocks it is Apple’s own developer fee, not Firebase. Phone sign-in is not enabled: each SMS costs money and Phone Auth requires Blaze. Leave `phone: false` on Spark.
- **Cloud Firestore** on Spark includes 1 GiB stored, 50,000 reads a day, and 20,000 writes a day. One person creates a small profile document, one state document per Bible, and one document per bookmark or highlight. Opening the app reads those documents. That budget fits a free Bible that is not an ad network.
- **No Cloud Functions.** Those require the paid Blaze plan. Deleting an account is done from the browser: it deletes that person’s documents, then deletes the login. Nothing is billed.
- **No Firebase Hosting.** The sites stay on GitHub Pages. Firebase is only the account database.

Do not upgrade to Blaze for this feature. Spark is the right plan.

## This site’s Firebase project

This repo uses the Spark project `clayjar-treasure` and `bibleId` `ctb`. The Clay Jar Translation (`https://clayjartranslation.github.io/`) uses a separate Spark project, `clayjar-bible`, because it stores progress in a different document shape. Do not copy this config file into that repo.

Both sites are served from the host `clayjartranslation.github.io`. That host is an authorized domain on this project, along with `localhost` and the project’s default `firebaseapp.com` / `web.app` domains.

A highlight in the Treasure Bible does not appear in the Translation, and the other way around.

## Data layout

All paths are under `users/{uid}`, and `{uid}` is the Firebase Authentication user id. A person can read and write only their own `users/{uid}` tree. The rules in `firestore.rules` are the ones to publish. There is no public collection.

```
users/{uid}                                      profile: createdAt, updatedAt
users/{uid}/bibles/{bibleId}                     state document, schema: 1
  reading:        { book, name, ch, v, t }
  audio:          { book, name, ch, v, time, mode, narr, t }
  audioSettings:  { rate, voice, voiceName, autoNext, narr, sleepChoice, sleepCustom, t }
users/{uid}/bibles/{bibleId}/bookmarks/{id}      one bookmark, or a delete marker
users/{uid}/bibles/{bibleId}/highlights/{id}     one highlight, or a delete marker
```

On this site, `bibleId` is `ctb`. The published rules also accept `cjt` so an old test path is not rejected, but this site always writes `ctb`. `t` is a millisecond timestamp from the device. The newer timestamp wins for reading place, listening place, and listening settings.

Bookmarks and highlights merge by id. The same verse keeps one bookmark (the newer one). The same highlighted words and color keep one highlight. A delete is stored as `{ id, deleted: true, t }` so another device does not bring the item back. Colors are `yellow`, `green`, `blue`, and `pink`.

What is stored when someone is signed in:

- reading place (book, chapter, verse)
- bookmarks
- multi-color highlights
- listening place (book, chapter, verse, and the recording’s time in seconds)
- listening settings (speed, device voice, recorded or dramatized voice, continue to the next chapter, sleep-timer choice)

What stays on the device only:

- light or dark appearance, text size, and whether footnotes are shown
- the sleep timer that is already counting down (the choice is saved; the running clock is not)
- a device voice is saved by name and falls back to Automatic when the other device does not have that voice

The first time this device signs in to an account, on-device bookmarks and highlights are united with the account, and the newer place wins. After that, edits on any signed-in device merge. Signing out leaves the copy on this device so reading can continue. If a different person signs in on the same browser, this device loads their account instead of uploading the previous person’s on-device progress.

## What the owner must do to switch accounts on

The Spark project `clayjar-treasure` is already created. Email/password and Google sign-in are on; Apple and phone stay off. Authorized domains include `clayjartranslation.github.io` and `localhost`. Firestore (Standard edition, `nam5`) is live with the rules in this repo. `js/firebase-config.js` already has the public web config. Leave `bibleId` as `'ctb'`. Leave `apple: false`, `phone: false`, and `useEmulator: false`. The public contact address on the terms and privacy pages is [contact.clayjar@protonmail.com](mailto:contact.clayjar@protonmail.com).

Do not copy this config into the Clay Jar Translation repo.

After this file is on GitHub Pages, the config is loaded from the network when the phone is online, so the next visit picks it up. Readers who are offline keep the previous copy until they connect. To confirm it, open the Treasure Bible, choose **Menu → Account**, create an email account, bookmark a verse, then sign in on another device and confirm the bookmark is there.

To switch accounts **off** again, set the four strings in `js/firebase-config.js` back to empty and deploy. The account button disappears. Anything already saved on the device remains on the device.

## Sign in with Apple (later, paid)

Keep `apple: false` until you have an Apple Developer Program account (Apple charges an annual fee; this project does not). When you do:

1. In Apple Developer, create a Services ID and a key for Sign in with Apple, and register the Firebase redirect URL shown in the Firebase Apple provider setup (it looks like `https://YOUR-PROJECT.firebaseapp.com/__/auth/handler`).
2. In Firebase Authentication, enable the Apple provider and enter the Services ID, team id, key id, and private key.
3. Set `apple: true` in `js/firebase-config.js` on this site and deploy.

Until that flag is true, the Apple button is not shown.

## Phone sign-in (off on Spark)

Keep `phone: false` while the project is on the Spark plan. Do not upgrade to Blaze just to offer SMS. Text-message verification is billed by Google, and Firebase requires Blaze before Phone Auth will send codes.

The button, country picker (every country in `js/phone-countries.js`), E.164 check, and invisible reCAPTCHA are already in the page. They stay hidden while the flag is false. If you later move the project to Blaze and accept the SMS cost:

1. In Firebase Authentication, enable the Phone provider. Add `clayjartranslation.github.io` as an authorized domain if it is not already there. Firebase provisions the reCAPTCHA used by the invisible check.
2. Set `phone: true` in `js/firebase-config.js` on this site and deploy.
3. The sign-in screen already says that a code is texted to the number, and that Bible progress is not uploaded until sign-in finishes.

Until that flag is true, the site does not ask for a phone number.

## What syncs, and only after sign-in

Nothing is uploaded because someone opens a chapter. The sign-in screen lists the opt-in: place in the text, bookmarks, highlights, listening place, and listening settings. Text size and appearance stay on the device. `setPersistence(browserLocalPersistence)` keeps the Firebase session in this browser only.

Signing out asks whether to keep that device copy or remove bookmarks, highlights, place, and listening progress from the device. The cloud account is unchanged until they use Delete my data and account.

A JSON backup needs no account. It is on the Account page and under Bookmarks and highlights → Backup. The file includes bookmarks, highlights, reading place, listening progress, and settings. Import merges with what is already on the device. Older files that only have bookmarks and highlights still import.

## Account page

**Menu → Account** (after the config is filled in). With an empty config, `#/account` only offers the on-device backup, with no sign-in controls.

- A note of what stays on the device and what signing in will sync
- Sign in with Google
- Email and password: sign in, create account, or email a password reset
- Phone, only when `phone` is true
- Save or import a backup file with no account
- Sign out, then keep or clear this device’s copy
- Delete my data and account (removes the login and the cloud progress for this Bible, and the copy of that progress on this device)

Terms of Service (`terms.html`) and Privacy Policy (`privacy.html`) are linked from the footer and the Account page. Questions go to [contact.clayjar@protonmail.com](mailto:contact.clayjar@protonmail.com). Those pages are plain-language explanations, not legal advice.

A short privacy note is on the Account page. There is no paywall and no ad.

## Local checks

Merge rules, with no network:

```
node tools/test-sync-merge.js
```

Auth and Firestore emulators (Java is required; this does not touch a real project):

```
npx firebase-tools emulators:exec --only auth,firestore --project demo-clayjar "node tools/test-accounts-emulator.mjs"
```

`useEmulator` must stay `false` in the committed config. The emulator test injects its own config in the browser and does not write secrets into the repo.

## Files

| File | Role |
| --- | --- |
| `js/firebase-config.js` | The only config the owner edits. Empty means no sign-in. |
| `js/sync-merge.js` | How two devices combine progress. Shared rules for `ctb` and `cjt`. |
| `js/accounts.js` | Sign-in screen and sync. It does not load Firebase when the config is empty. |
| `firestore.rules` | Users read and write only `users/{their uid}`. |
| `firebase.json` | Emulator ports for the local test. Not used by GitHub Pages. |

## Security the owner has to finish in the consoles

The site cannot do these from the repository. GitHub Pages does not let the site set HTTP headers, so the Content-Security-Policy is a `<meta>` tag. `frame-ancestors` is ignored in a meta tag. A script refuses to run the page inside a frame. A real `Content-Security-Policy: frame-ancestors 'none'` header needs a host that allows custom headers.

1. **Firestore rules.** In Firebase, open Firestore → Rules, paste `firestore.rules` from this repo, and publish. The rules let a signed-in person read and write only `users/{their uid}`. `bibleId` may only be `ctb` or `cjt`. There is no Realtime Database in this project.
2. **API key.** The browser key is already restricted to HTTP referrers `https://clayjartranslation.github.io/*` and `https://clayjartranslation.github.io`. Optionally also restrict the APIs to Identity Toolkit, Token Service, and Cloud Firestore. The key is still visible in the page. The referrer restriction and the Firestore rules are what keep it from being reused.
3. **Authorized domains.** Authentication → Settings → Authorized domains should include `clayjartranslation.github.io`, `localhost`, and the project’s default `firebaseapp.com` / `web.app` domains. Do not remove the Firebase default domains.
4. **App Check.** The free Spark plan can use App Check with reCAPTCHA v3. It is not wired up, because it needs a site key from the Firebase console and it would load a Google script on sign-in. After you enforce App Check, add the site key to `js/firebase-config.js` and add `https://www.google.com` to `script-src` in the Content-Security-Policy on every page. Do not require `request.app` in the rules until a build with that key is live, or sign-in will fail.
5. **Phone sign-in and reCAPTCHA.** Leave `phone: false`. Turning it on also needs `https://www.google.com` in `script-src` and `frame-src`.
6. **GitHub.** On a public repository, enable Dependabot alerts, secret scanning, and secret-scanning push protection. Protect `main` so a pull request and the Tests workflow are required. The agent may have been unable to change those settings. `/.well-known/security.txt` for the whole domain belongs at `https://clayjartranslation.github.io/.well-known/security.txt` (the user-site repository). This repo serves a copy at `/treasure/.well-known/security.txt`.
