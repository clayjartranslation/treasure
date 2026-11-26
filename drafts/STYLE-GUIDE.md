# Clay Jar Treasure Bible (CTB) style guide

© 2026 Jose Santiago. All rights reserved. Free to read online at https://clayjartranslation.github.io/treasure/

The CTB is a NEW, easy-to-read, thought-for-thought English Bible. It is copyrighted to Jose Santiago.
It is not a rewrite of any other Bible. **Nothing may be copied or closely paraphrased from any
copyrighted work** (see "Copyright safeguard" below; this rule beats every other rule).

## 1. Reading level and voice
- Target: about US grades 5–6. Short sentences (most under 20 words). Common words. One idea per sentence.
- Say what the author meant, in the way a clear modern speaker would say it. Explain ideas instead of using jargon.
  Church words become plain words: "made right with God" (not "justified"), "set apart for God" (not "sanctified"),
  "forgive" / "sin" are fine because children know them, "grace" becomes "God's kindness that we do not earn" the first time
  and "God's kindness" afterward, "covenant" becomes "agreement" or "promise" (with "covenant" in a footnote where it matters).
  Put the traditional word in a footnote only where it helps readers connect with older Bibles.
- Keep the same English word for the same key idea inside a book. Avoid idioms and slang that will date quickly or that
  non-native readers cannot guess ("gird up your loins", "kick against the goads", and also "dude", "awesome").
- Avoid thee/thou, -eth, and "behold". Use "Look!" or "Listen!" only when the speaker is really calling for attention.
- Dialogue stays dialogue, with plain quotation marks. Keep who is speaking clear (name instead of "he" if it would confuse).
- Be faithful: do not add ideas, do not leave ideas out, and do not explain doctrine that the author did not state.
  If an explanation is needed it goes in a short footnote, not into the verse.

## 2. Method and sources
- Thought for thought, faithful to the meaning of the Hebrew, Aramaic, and Greek.
- Work from the same oldest-manuscript sources as the CJT: the Masoretic Text with the Dead Sea Scrolls, the Septuagint (LXX),
  the Samaritan Pentateuch, and the oldest Greek New Testament papyri and codices (Apocrypha: Septuagint; Pseudepigrapha: the oldest
  surviving language). Where the best evidence is the Dead Sea Scrolls or the Septuagint, follow it and say so in a footnote.
- The CJT text (in /workspace/cjt-deploy/data/books/) is Jose's own public-domain work and may be used as a MEANING GUIDE
  (what does this verse say, which manuscript variants matter, how to spell names). Never copy its wording; the CTB must be
  freshly phrased in simple English, and it is checked the same way as everything else.
- Do NOT read or use any copyrighted English Bible as a source while writing. Comparison texts exist only for the
  automatic safeguard check and are never pasted into CTB files.
- Verse numbers follow the standard English versification, so every verse is present (same counts as the CJT).

## 3. Names (identical to the CJT — Jose's instruction)
Names are NOT simplified. Keep exactly the CJT's spelling and treatment:
- **God's names:** YHWH is "Yahweh" (never "the LORD"). "Yahweh God" for YHWH Elohim, "Lord Yahweh" for Adonai YHWH.
  Elohim is "God". Adonai is "Lord". Yahweh Sabaoth is "Yahweh of Armies" with a footnote.
- **Compound names of God** stay transliterated exactly as in the CJT: El Shaddai, El Elyon, El Roi, Yahweh Yireh,
  Yahweh Nissi, Yahweh Shalom, and so on. Each gets a short footnote giving the meaning in simple English
  (for example, "El Roi means 'the God who sees me'") the first time it appears in a book. Do not replace the name with an
  English phrase in the verse.
- **People and place names:** spelled exactly as in the CJT, every time (genealogies and lists included; never replace a name
  with "he"). A short meaning footnote at first mention in the book (say "meaning uncertain" when it is).
  Adam is "Adam" with a note on the meaning at first mention.
- New Testament: kyrios is "Lord", with a footnote where the Old Testament verse has Yahweh.

## 4. Measures, money, dates, times (identical to the CJT)
- **Weights and measures:** modern US customary units in the text ("about 450 feet", "about 10 pounds"), with a footnote giving the
  original unit and amount and the metric figure. Use the CJT's conversions: cubit = 18 in / 45 cm; shekel = 0.4 oz / 11.5 g;
  talent = about 75 lb / 34 kg; ephah = about 3/5 bushel / 22 L; homer = about 6 bushels / 220 L; hin = about 1 gallon / 3.7 L.
  Ages, years, days, and counts stay as numbers.
- **Money:** modern US terms with a footnote for the original (shekels of silver, denarius, etc.), same as the CJT.
- **Calendar dates:** modern-month spans with the day number kept, as in the CJT: "the first month (in March–April)", and a
  footnote with the original month name/number. Month table: 1 Nisan/Abib Mar–Apr; 2 Iyyar/Ziv Apr–May; 3 Sivan May–Jun; 4 Tammuz Jun–Jul;
  5 Av Jul–Aug; 6 Elul Aug–Sep; 7 Tishri/Ethanim Sep–Oct; 8 Marcheshvan/Bul Oct–Nov; 9 Kislev Nov–Dec; 10 Tevet Dec–Jan;
  11 Shevat Jan–Feb; 12 Adar Feb–Mar.
- **Clock times:** modern times in the text ("third hour" becomes "nine in the morning"; "ninth hour" is "three in the afternoon";
  Old Testament night watches: evening to about 10 p.m., middle to about 2 a.m., morning to about 6 a.m.; New Testament Roman watches
  6–9 p.m., 9–midnight, midnight–3 a.m., 3–6 a.m.). "Between the two evenings" is "at twilight". The original wording goes in a footnote.

## 5. Footnotes (fewer and simpler than the CJT)
- Lettered {a}, {b}… restarting at "a" in each chapter. Each marker needs one note. Notes are one or two plain sentences.
- Use notes only for: (1) meanings of names (God's names, people, places, at first mention in a book); (2) the original unit,
  date, or time behind a modern one; (3) important manuscript differences ("The Dead Sea Scrolls and the Septuagint say …;
  the Hebrew text says …"); (4) the traditional word for a plainly explained idea when it helps; (5) a literal rendering only when
  the thought-for-thought wording could otherwise hide something important.
- Do not write notes that are only commentary or sermon. Do not put copyrighted text in notes. Any manuscript reading you
  cannot confirm is worded as "some ancient copies" or "reported", never as certain.

## 6. Poetry, paragraphs, headings
- Poetry stays poetry. (In the app each verse is shown as a line or paragraph; for poetic books, keep one poetic line per
  sentence/clause, short, with the parallel lines kept parallel.)
- `paras` lists the verse numbers where paragraphs begin (always starting with 1), as in the CJT.
- Section headings are written fresh: short (2–6 words), plain, and never copied from any Bible. In the book JSON they go in the
  chapter's `subheads` object, keyed by the verse number where a paragraph starts, for example `"subheads": {"1": "The world begins"}`
  (the key must be one of the chapter's `paras`). Headings are checked like any other text.
- Poetry: a verse's text may contain "\n" line breaks; each becomes its own indented line.

## 7. Copyright safeguard (the most important rule)
- Risk list: easy-language and popular Bibles — NLT, GNT/TEV, CEV, NIrV, ERV/EasyEnglish, ICB/NCV/EXB, GW (God's Word), The Message,
  The Voice, TPT, NIV, CSB, NET — plus the formal ones (ESV, NASB, NRSV, RSV, NKJV, NAB, CEB, ISV, AMP, LSB, MEV, TLV, CJB, NJB).
- Public-domain comparison texts (a shared phrase is allowed when it is also in them): KJV, ASV, WEB, BSB (CC0), YLT, Douay-Rheims,
  Geneva, Brenton's LXX.
- **Write first, never copy.** Write each verse from the meaning (and the CJT as meaning guide), then run the checker.
- **Checker:** `python3 /workspace/ctb/check/ctbcheck.py /workspace/ctb/staging/<book>.json [--chapters 1-11]`.
  It reports (a) any run of 7 or more consecutive words (normalized: lowercase, punctuation removed, LORD/Jehovah → Yahweh) that appears
  in any copyrighted version of the same book and is NOT also in a public-domain text ("RUN"), and (b) sentences that are mostly covered by
  3-or-more-word blocks of a copyrighted version more than by any public-domain version ("SIM"). Footnotes and headings are checked too.
- **Fix every flag by rewriting the sentence freshly** (change the structure and words, not just one word), then re-run until clean.
  A flag may be left only if it is trivial or forced and is logged as such in AUDIT.md: a run of proper names, a number list,
  an unavoidable quotation formula (for example "Yahweh said to Moses"), or a short fixed phrase that also occurs in the Hebrew idiom
  and in public-domain Bibles. Log the reason.
- Never paste text from any copyrighted Bible into a CTB file, the style guide, or the audit log. The audit log may name a reference
  and version and the length of the run, not quote the matching text.
- Log every check in /workspace/ctb/AUDIT.md (date, book, chapters, flags found, flags fixed, remaining flags with reasons).
