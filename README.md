# Clay Jar Treasure Bible (CTB)

Free static Bible reader. © 2026 Jose Santiago. All rights reserved. The text is copyrighted but free to
read online; no sign-up, ads, or tracking. Hosted at https://clayjartranslation.github.io/treasure/

All paths are relative so it runs from the /treasure/ subpath. Service worker cache names start with `ctb-`
and browser storage keys start with `ctb-`, so it does not clash with the Clay Jar Translation app on the same domain.

Add a book: `node tools/add-book.js path/to/book.json` (same format as the CJT app; see tools/add-book.js).
