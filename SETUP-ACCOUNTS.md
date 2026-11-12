# Optional accounts for the Clay Jar Bibles

Sign-in is **optional**. Reading and listening stay free, with no ads and no required account. With the config file left empty, the Treasure Bible hides every account control and behaves as it does today: place, bookmarks, highlights, and listening stay on the device.

When the config is filled in, a reader can sign in with Google or with email and a password (including password reset). The same account works on this site and on the Clay Jar Translation. Each Bible keeps its own progress.

Sign in with Apple is implemented and **turned off**. It needs a paid Apple Developer Program membership later. Leave `apple` set to `false` until then.

## Why Firebase Spark (the free plan)

The free Spark plan covers this:

- **Authentication** for email/password and Google is free. Sign in with Apple is also free on Firebase; the cost that blocks it is Apple’s own developer fee, not Firebase. Phone-number sign-in is not used.
- **Cloud Firestore** on Spark includes 1 GiB stored, 50,000 reads a day, and 20,000 writes a day. One person creates a small profile document, one state document per Bible, and one document per bookmark or highlight. Opening the app reads those documents. That budget fits a free Bible that is not an ad network.
- **No Cloud Functions.** Those require the paid Blaze plan. Deleting an account is done from the browser: it deletes that person’s documents, then deletes the login. Nothing is billed.
- **No Firebase Hosting.** The sites stay on GitHub Pages. Firebase is only the account database.

Do not upgrade to Blaze for this feature. Spark is the right plan.

## One project, two Bibles

Create **one** Firebase project for both sites. Add **one** web app (or one per site; either works, as long as the project is the same). Put the same `apiKey`, `authDomain`, `projectId`, and `appId` in both repos. The only difference is `bibleId`:

| Site | Repo | `bibleId` | Where it is served |
| --- | --- | --- | --- |
| Clay Jar Translation | `clayjartranslation/clayjartranslation.github.io` | `cjt` | `https://clayjartranslation.github.io/` |
| Clay Jar Treasure Bible | this repo | `ctb` | `https://clayjartranslation.github.io/treasure/` |

Both origins are the host `clayjartranslation.github.io`. Add that host once under **Authentication → Settings → Authorized domains**. `localhost` is already on the list for local tests.

Progress is stored separately under the user, so a highlight in the Treasure Bible does not appear in the Translation, and the other way around. Signing in on one site uses the same email and password on the other.

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

`bibleId` is `ctb` or `cjt`. `t` is a millisecond timestamp from the device. The newer timestamp wins for reading place, listening place, and listening settings.

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

1. In the [Firebase console](https://console.firebase.google.com), create a project (Spark / no billing). Name it something like `clay-jar-bibles`.
2. Add a **Web app**. Copy the config. You do not need Analytics.
3. Open **Build → Authentication → Sign-in method** and enable **Google** and **Email/Password**. Leave Apple disabled.
4. Under **Authentication → Settings → Authorized domains**, add `clayjartranslation.github.io` if it is not there. Do not remove `localhost`.
5. For Google, finish the consent screen in Google Cloud if the console asks (app name, support email). The authorized domain above is the one that matters for these sites.
6. Open **Build → Firestore Database → Create database**. Choose production mode and a region close to readers. Then open the **Rules** tab and paste `firestore.rules` from this repo. Publish.
7. Edit `js/firebase-config.js` in **this** repo. Fill in `apiKey`, `authDomain`, `projectId`, and `appId`. Leave `bibleId` as `'ctb'`. Leave `apple: false` and `useEmulator: false`.
8. Copy that same file to the Clay Jar Translation repo and change only `bibleId` to `'cjt'`.
9. Deploy both sites. The config file is loaded from the network when the phone is online, so the next visit picks it up. Readers who are offline keep the previous copy until they connect.
10. On a phone, open the Treasure Bible, choose **Menu → Account**, create an email account, bookmark a verse, then sign in on another device and confirm the bookmark is there. Repeat once on the Translation site and confirm its bookmarks stay separate.

To switch accounts **off** again, set the four strings in `js/firebase-config.js` back to empty and deploy. The account button disappears. Anything already saved on the device remains on the device.

## Sign in with Apple (later, paid)

Keep `apple: false` until you have an Apple Developer Program account (Apple charges an annual fee; this project does not). When you do:

1. In Apple Developer, create a Services ID and a key for Sign in with Apple, and register the Firebase redirect URL shown in the Firebase Apple provider setup (it looks like `https://YOUR-PROJECT.firebaseapp.com/__/auth/handler`).
2. In Firebase Authentication, enable the Apple provider and enter the Services ID, team id, key id, and private key.
3. Set `apple: true` in `js/firebase-config.js` on both sites and deploy.

Until that flag is true, the Apple button is not shown.

## Account page

**Menu → Account** (only after the config is filled in):

- Sign in with Google
- Email and password: sign in, create account, or email a password reset
- Sign out (the on-device copy remains)
- Delete my data and account (removes the login and the cloud progress for **both** Bibles, and the copy of that progress on this device)

A short privacy note is on that page. There is no paywall and no ad.

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
