# Clay Jar Treasure Bible (CTB)

Free static Bible reader. © 2026 Jose Santiago. All rights reserved. The text is copyrighted but free to
read online; no sign-up, ads, or tracking. Hosted at https://clayjartranslation.github.io/treasure/

All paths are relative so it runs from the /treasure/ subpath. Service worker cache names start with `ctb-`
and browser storage keys start with `ctb-`, so it does not clash with the Clay Jar Translation app on the same domain.

Add a book: `node tools/add-book.js path/to/book.json` (same format as the CJT app; see tools/add-book.js).

Optional accounts (off until configured): see SETUP-ACCOUNTS.md and js/firebase-config.js. Same Firebase project as the Clay Jar Translation, with this Bible’s progress under `bibles/ctb`.

## Daily devotional

Readings live in `data/devotionals.json`, one object in `entries` per month-day. `date` is `MM-DD` (`11-13`, and `02-29` for leap day). Each object has `title`, `reference`, `book` (an id that already exists under `data/books/`), `chapter`, `verse`, `text`, `reflection`, and `prayer`.

Copy `text` character for character from that verse’s `text` in `data/books/<book>.json`, including line breaks. Do not edit the Bible book files. `devotional.html` shows the reading for the reader’s local month and day, and lists every entry in the archive (`devotional.html?d=11-13`). If that date has no reading yet, the page shows the nearest one. Append about seven days at a time until all 366 are written.

When `devotional.html` or the precache list changes, bump `const VERSION` in `sw.js` (`ctb-vN`) so offline copies refresh. Book publishes bump that same line; rebase on main before merging.

Devotionals © 2026 Jose Santiago. All rights reserved.
