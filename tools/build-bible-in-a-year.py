#!/usr/bin/env python3
"""Build a 365-day Bible in a Year plan from a site's own canon.

Each catalog section is divided evenly over 365 days and finishes on
December 31: Old Testament (except Psalms and Proverbs), Psalms,
Proverbs, New Testament, and the extra books (Apocrypha and
Pseudepigrapha, in this Bible’s book order). Days are balanced by
verse count. A chapter is kept whole when that stays close to the
even target; long chapters are split by verse when that helps.

Every catalog book and verse appears exactly once. No book is skipped
or repeated. February 29 in a leap year reuses February 28.

Usage:
  python3 tools/build-bible-in-a-year.py [repo_root]
  python3 tools/build-bible-in-a-year.py [repo_root] --fallback /path/to/other-bible
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import sys


DAYS = 365
PSALMS_ID = "psalms"
PROVERBS_ID = "proverbs"
STREAM_KEYS = ("ot", "ps", "pr", "nt", "ex")
# Exact verse-even cuts (0 = no snap). A nearby chapter snap would
# so short chapters stay whole when that barely changes the day's length.
CHAPTER_SNAP = 0
# Kept for the unused long-chapter helpers below (not used by the even packer).
LONG_CHAPTER_VERSES = 90
LONG_CHAPTER_WORDS = 2200
LONG_CHUNK_VERSES = 30
LONG_CHUNK_WORDS = 1800


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def book_path(root, entry, fallback):
    rel = (entry.get("file") or "").strip() or os.path.join("data", "books", entry["id"] + ".json")
    local = os.path.join(root, rel)
    if os.path.isfile(local):
        return local, False
    if fallback:
        fb = os.path.join(fallback, rel)
        if os.path.isfile(fb):
            return fb, True
        fb2 = os.path.join(fallback, "data", "books", entry["id"] + ".json")
        if os.path.isfile(fb2):
            return fb2, True
    return None, False


def load_book(root, entry, fallback):
    path, used_fb = book_path(root, entry, fallback)
    if not path:
        raise FileNotFoundError(
            "No book file for {0} in {1}{2}".format(
                entry["id"], root, " or fallback " + fallback if fallback else ""
            )
        )
    return load_json(path), used_fb


def load_chapters(root, catalog_books, ids, fallback):
    """Load chapters in catalog (or given) order as structured dicts."""
    by_id = {b["id"]: b for b in catalog_books}
    chapters = []
    counts = {}
    used_fallback = []
    for bid in ids:
        entry = by_id[bid]
        data, used_fb = load_book(root, entry, fallback)
        if used_fb:
            used_fallback.append(bid)
        book_counts = {}
        for ch in data.get("chapters") or []:
            verses = []
            for verse in ch.get("verses") or []:
                text = verse.get("text") or ""
                verses.append({
                    "v": int(verse["v"]),
                    "words": max(1, len(text.split())),
                })
            book_counts[str(ch["n"])] = len(verses)
            paras = ch.get("paras") or ([verses[0]["v"]] if verses else [])
            chapters.append({
                "book": bid,
                "ch": int(ch["n"]),
                "verses": verses,
                "paras": [int(p) for p in paras],
                "nverses": len(verses),
                "words": sum(v["words"] for v in verses),
            })
        counts[bid] = book_counts
    return chapters, counts, used_fallback


def unit_from_span(ch, sv_index, ev_index):
    span = ch["verses"][sv_index:ev_index + 1]
    sv, ev = span[0]["v"], span[-1]["v"]
    whole = sv_index == 0 and ev_index == len(ch["verses"]) - 1
    return {
        "book": ch["book"],
        "ch": ch["ch"],
        "sv": sv,
        "ev": ev,
        "verses": len(span),
        "words": sum(v["words"] for v in span),
        "whole": whole,
        "split": not whole,
    }


def split_long_chapter(ch, target_verses=LONG_CHUNK_VERSES, target_words=LONG_CHUNK_WORDS):
    """Split a very long chapter at paragraph boundaries into day-sized spans."""
    n = ch["nverses"]
    if n <= 0:
        return []
    para = set(ch["paras"] or [])
    units = []
    s = 0
    while s < n:
        left = n - s
        if left <= target_verses + 4 and sum(v["words"] for v in ch["verses"][s:]) <= target_words * 1.25:
            units.append(unit_from_span(ch, s, n - 1))
            break
        # seek a cut near the target
        ideal = s
        words = 0
        ideal_v = s
        for i in range(s, n):
            words += ch["verses"][i]["words"]
            if (i - s + 1) >= target_verses or words >= target_words:
                ideal = i
                break
            ideal_v = i
        if ideal < s:
            ideal = min(s + target_verses - 1, n - 1)
        # snap to a paragraph start after the first few verses, or keep ideal
        e = ideal
        window = []
        for i in range(s + 4, min(n, ideal + 8)):
            if ch["verses"][i]["v"] in para:
                window.append(i - 1)  # cut before this paragraph
        if window:
            e = min(window, key=lambda i: (abs(i - ideal), -i))
        e = max(s, min(e, n - 2 if n - (e + 1) < 4 and e < n - 1 else n - 1))
        if e <= s:
            e = min(s + max(4, target_verses // 2), n - 1)
        units.append(unit_from_span(ch, s, e))
        s = e + 1
    return units


def chapter_is_long(ch, for_nt_traditional=False):
    # Traditional NT chapters stay whole, even Luke 1.
    if for_nt_traditional:
        return False
    return ch["words"] >= LONG_CHAPTER_WORDS or (
        ch["nverses"] >= LONG_CHAPTER_VERSES and ch["words"] >= 1500
    )


def units_from_chapters(chapters, split_long=True, traditional_nt_ids=None):
    traditional_nt_ids = traditional_nt_ids or set()
    units = []
    for ch in chapters:
        keep_whole = ch["book"] in traditional_nt_ids or not split_long
        if not keep_whole and chapter_is_long(ch):
            units.extend(split_long_chapter(ch))
        else:
            units.append(unit_from_span(ch, 0, ch["nverses"] - 1))
    return units


def pack_units(units, days=DAYS):
    """Pack units into exactly `days` groups, even by word count, at unit boundaries."""
    n = len(units)
    if n < days:
        raise ValueError("Stream has {0} units, fewer than {1} days".format(n, days))
    prefix = [0]
    for u in units:
        prefix.append(prefix[-1] + u["words"])
    cuts = []
    s = 0
    for d in range(days):
        left = days - d
        if left == 1:
            cuts.append((s, n))
            break
        e_min = s + 1
        e_max = n - (left - 1)
        remain_w = prefix[n] - prefix[s]
        tgt = remain_w / float(left)
        # Leave no more work than the remaining days can hold at a modest cap,
        # so the last day cannot be dumped a huge leftover.
        max_day = max(tgt * 1.45, tgt + 400)
        min_later = left - 1
        # prefix[n] - prefix[e] <= max_day * (left-1)
        min_take_w = remain_w - max_day * (left - 1)
        if min_take_w > 0:
            forced = s + 1
            while forced < e_max and prefix[forced] - prefix[s] < min_take_w:
                forced += 1
            e_min = max(e_min, min(forced, e_max))
        best_e = e_min
        best = None
        for e in range(e_min, e_max + 1):
            w = prefix[e] - prefix[s]
            reunite = False
            seen = set()
            for i in range(s, e):
                if units[i].get("split"):
                    key = (units[i]["book"], units[i]["ch"])
                    if key in seen:
                        reunite = True
                        break
                    seen.add(key)
            # Prefer the word target; avoid putting a split long chapter back on one day.
            penalty = 0.0
            if reunite:
                penalty = 0.35 * tgt
            score = (abs(w - tgt) + penalty, e)
            if best is None or score < best:
                best = score
                best_e = e
        cuts.append((s, best_e))
        s = best_e
    if cuts[-1][1] != n or len(cuts) != days:
        raise AssertionError("pack_units did not produce {0} cuts covering all units".format(days))
    return cuts


def even_size(remain, left):
    return remain // left


def split_verses(items, days=DAYS, snap=0):
    """Cut a verse stream into `days` nearly even spans (used for Proverbs)."""
    n = len(items)
    if n < days:
        raise ValueError("Stream has {0} verses, fewer than {1} days".format(n, days))
    cuts = []
    s = 0
    for d in range(days):
        left = days - d
        if left == 1:
            cuts.append((s, n))
            break
        remain = n - s
        tgt = even_size(remain, left)
        if remain - tgt * left > 0:
            tgt += 1
        e_min = s + 1
        e_max = n - (left - 1)
        ideal = s + tgt
        e = max(e_min, min(e_max, ideal))
        if snap:
            window = range(max(e_min, e - snap), min(e_max, e + snap) + 1)
            cands = [i for i in window if i < n and items[i].get("ch_start")]
            if not cands:
                cands = [i for i in window if i < n and items[i].get("para_start")]
            if cands:
                e = min(cands, key=lambda i: (abs(i - ideal), abs(i - e)))
        cuts.append((s, e))
        s = e
    if cuts[-1][1] != n or len(cuts) != days:
        raise AssertionError("verse split did not finish evenly")
    return cuts


def proverb_items(chapters):
    items = []
    for ch in chapters:
        for i, verse in enumerate(ch["verses"]):
            items.append({
                "book": ch["book"],
                "ch": ch["ch"],
                "v": verse["v"],
                "words": verse["words"],
                "ch_start": i == 0,
                "para_start": i == 0 or verse["v"] in set(ch["paras"] or []),
            })
    return items


def verses_to_units(items, s, e):
    units = []
    i = s
    while i < e:
        bid = items[i]["book"]
        chn = items[i]["ch"]
        j = i
        while j < e and items[j]["book"] == bid and items[j]["ch"] == chn:
            j += 1
        # we don't know whole without chapter length; set from ch_start and next
        whole = items[i].get("ch_start") and (j == len(items) or items[j].get("ch_start") or items[j]["ch"] != chn or items[j]["book"] != bid)
        # For a mid-plan cut, whole is true only if we started at verse 1 of the
        # chapter and consumed the rest of that chapter present in `items` and
        # the next item (if any in the full stream) starts a new chapter.
        if not items[i].get("ch_start"):
            whole = False
        else:
            # If the following item in the full stream is the next verse of this chapter, not whole.
            if j < len(items) and items[j]["book"] == bid and items[j]["ch"] == chn:
                whole = False
            else:
                whole = True
        units.append({
            "book": bid,
            "ch": chn,
            "sv": items[i]["v"],
            "ev": items[j - 1]["v"],
            "verses": j - i,
            "words": sum(x["words"] for x in items[i:j]),
            "whole": whole,
            "split": not whole,
        })
        i = j
    return units


def pack_stream_even(chapters, days=DAYS, snap=CHAPTER_SNAP):
    """Cut a chapter stream into exactly `days` portions, even by verse count."""
    items = proverb_items(chapters)
    cuts = split_verses(items, days, snap=snap)
    return [verses_to_units(items, s, e) for s, e in cuts]


def psalm_units_for_year(psalm_chapters, days=DAYS):
    """Two passes of the 150 psalms, splitting long ones so the stream fills 365 days."""
    def whole(ch):
        return unit_from_span(ch, 0, ch["nverses"] - 1)

    by_n = {ch["ch"]: ch for ch in psalm_chapters}
    units = []
    for _pass in range(2):
        for ch in psalm_chapters:
            units.append(whole(ch))

    def can_split(u):
        return u["verses"] >= 16

    def split_unit(u):
        ch = by_n[u["ch"]]
        # indices in the chapter verse list
        verses = ch["verses"]
        start_i = next(i for i, v in enumerate(verses) if v["v"] == u["sv"])
        end_i = next(i for i, v in enumerate(verses) if v["v"] == u["ev"])
        length = end_i - start_i + 1
        mid = start_i + length // 2
        paras = set(ch["paras"] or [])
        # Psalm 119: snap to a stanza (paragraph) boundary.
        if u["ch"] == 119:
            cands = [i for i in range(start_i + 8, end_i - 6) if verses[i]["v"] in paras]
            if cands:
                mid = min(cands, key=lambda i: (abs(i - mid), i))
                return [unit_from_span(ch, start_i, mid - 1), unit_from_span(ch, mid, end_i)]
        # Other long psalms: paragraph near the midpoint, keeping 8–20 when possible.
        cands = [i for i in range(start_i + 8, end_i - 7) if verses[i]["v"] in paras]
        if cands:
            mid = min(cands, key=lambda i: (abs(i - mid), i))
            return [unit_from_span(ch, start_i, mid - 1), unit_from_span(ch, mid, end_i)]
        mid = start_i + length // 2
        if mid <= start_i or mid > end_i:
            return [u]
        return [unit_from_span(ch, start_i, mid - 1), unit_from_span(ch, mid, end_i)]

    # Split the longest eligible unit until we have 365 (or cannot split more).
    guard = 0
    while len(units) < days and guard < 1000:
        guard += 1
        idx = max((i for i, u in enumerate(units) if can_split(u)), key=lambda i: units[i]["verses"], default=None)
        if idx is None:
            break
        parts = split_unit(units[idx])
        if len(parts) < 2:
            break
        units[idx:idx + 1] = parts

    # If still short, begin a third pass of whole psalms from Psalm 1.
    if len(units) < days:
        for ch in psalm_chapters:
            if len(units) >= days:
                break
            units.append(whole(ch))

    # If we overshot (should not, we only add), group adjacent short psalms.
    guard = 0
    while len(units) > days and guard < 1000:
        guard += 1
        # Merge the two adjacent whole short psalms with the smallest combined verses.
        best = None
        for i in range(len(units) - 1):
            a, b = units[i], units[i + 1]
            if a["whole"] and b["whole"] and a["ch"] + 1 == b["ch"] and a["verses"] <= 8 and b["verses"] <= 8:
                score = (a["verses"] + b["verses"], i)
                if best is None or score < best[0]:
                    best = (score, i)
        if best is None:
            # last resort: merge any two adjacent short whole psalms
            for i in range(len(units) - 1):
                a, b = units[i], units[i + 1]
                if a["whole"] and b["whole"] and a["verses"] + b["verses"] <= 12:
                    best = ((a["verses"] + b["verses"], i), i)
                    break
        if best is None:
            raise ValueError("Could not reduce psalm units from {0} to {1}".format(len(units), days))
        i = best[1] if isinstance(best[1], int) else best[1]
        # best is ((score), i)
        i = best[-1]
        a, b = units[i], units[i + 1]
        # Represent grouped psalms as two units... we need one day with two units.
        # pack later is 1 unit per day for psalms. So we need a compound unit.
        compound = {
            "book": "psalms",
            "ch": a["ch"],
            "sv": 1,
            "ev": a["ev"],
            "verses": a["verses"] + b["verses"],
            "words": a["words"] + b["words"],
            "whole": False,
            "split": False,
            "group": [a, b],
        }
        units[i:i + 2] = [compound]

    if len(units) != days:
        raise AssertionError("Psalms produced {0} units, expected {1}".format(len(units), days))
    # Each psalm "day" is a list of 1+ units (a grouped day has group)
    days_units = []
    for u in units:
        if u.get("group"):
            days_units.append(u["group"])
        else:
            days_units.append([u])
    return days_units


def can_merge(prev, nxt):
    return (
        prev["whole"] and nxt["whole"]
        and prev["book"] == nxt["book"]
        and nxt["ch"] == prev["ch"] + 1
    )


def merge_units(units):
    """Merge consecutive whole chapters of the same book into one part."""
    if not units:
        return []
    out = []
    cur = dict(units[0])
    cur["ec"] = cur.get("ec", cur["ch"])
    for u in units[1:]:
        nxt_ch = u["ch"]
        if can_merge({"whole": cur["whole"], "book": cur["book"], "ch": cur["ec"]}, u):
            cur["ec"] = u.get("ec", u["ch"])
            cur["ev"] = u["ev"]
            cur["verses"] += u["verses"]
            cur["words"] += u["words"]
        else:
            out.append(cur)
            cur = dict(u)
            cur["ec"] = cur.get("ec", cur["ch"])
    out.append(cur)
    return out


def group_short_units(units, days, target_words=680, max_merge_words=1100):
    """Merge adjacent short whole chapters of the same book, shortest first,
    only while the stream has more than `days` units. That keeps 365 days
    and prevents a one-verse chapter from standing alone.
    """
    units = [dict(u) for u in units]
    for u in units:
        u["ec"] = u.get("ec", u["ch"])

    def can(a, b):
        return (
            a["whole"] and b["whole"]
            and a["book"] == b["book"]
            and b["ch"] == a["ec"] + 1
            and not a.get("split") and not b.get("split")
            and a["words"] + b["words"] <= max_merge_words
            and a["words"] < target_words
            and b["words"] < target_words
        )

    guard = 0
    while len(units) > days and guard < 8000:
        guard += 1
        best = None
        for i in range(len(units) - 1):
            a, b = units[i], units[i + 1]
            if not can(a, b):
                continue
            score = (a["words"] + b["words"], a["verses"] + b["verses"], i)
            if best is None or score < best[0]:
                best = (score, i)
        if best is None:
            break
        i = best[1]
        a, b = units[i], units[i + 1]
        units[i] = {
            "book": a["book"],
            "ch": a["ch"],
            "sv": 1 if a.get("whole") else a["sv"],
            "ev": b["ev"],
            "verses": a["verses"] + b["verses"],
            "words": a["words"] + b["words"],
            "whole": True,
            "split": False,
            "ec": b.get("ec", b["ch"]),
        }
        del units[i + 1]
    return units



def label(part, books):
    b = books[part["book"]]
    name = b["name"]
    sc = part["ch"]
    ec = part.get("ec", part["ch"])
    if part["book"] == "psalms":
        name = "Psalm" if sc == ec else "Psalms"
    ch_count = None
    counts = books[part["book"]]
    # chapterCount may be a string
    try:
        ch_count = int(b.get("chapterCount") or 0) or None
    except (TypeError, ValueError):
        ch_count = None
    whole = part["whole"] and sc == part["ch"]  # start at beginning of first chapter in the part
    # 'whole' on a merged part means each chapter was whole; sc may be first ch.
    if part["whole"]:
        if ch_count == 1 and sc == ec:
            return name
        if sc == ec:
            return "{0} {1}".format(name, sc)
        return "{0} {1}\u2013{2}".format(name, sc, ec)
    if sc == ec:
        if part["sv"] == part["ev"]:
            return "{0} {1}:{2}".format(name, sc, part["sv"])
        return "{0} {1}:{2}\u2013{3}".format(name, sc, part["sv"], part["ev"])
    return "{0} {1}:{2}\u2013{3}:{4}".format(name, sc, part["sv"], ec, part["ev"])


def portion_entries(parts, books):
    out = []
    for p in parts:
        out.append({
            "label": label(p, books),
            "book": p["book"],
            "ch": p["ch"],
            "v": 1 if p["whole"] else p["sv"],
            "verses": p["verses"],
        })
    return out


def entries_from_units(units, books):
    return portion_entries(merge_units(units), books)


def stream_ids(catalog_books):
    """Split the catalog into the five daily sections, in book-list order."""
    ot, nt, extra = [], [], []
    for b in catalog_books:
        bid, div = b["id"], b.get("division")
        if bid == PSALMS_ID or bid == PROVERBS_ID:
            continue
        if div == "Old Testament":
            ot.append(bid)
        elif div == "New Testament":
            nt.append(bid)
        elif div in ("Apocrypha", "Pseudepigrapha"):
            extra.append(bid)
        else:
            raise SystemExit("Unknown division for {0}: {1}".format(bid, div))
    return {
        "ot": ot,
        "ps": [PSALMS_ID],
        "pr": [PROVERBS_ID],
        "nt": nt,
        "ex": extra,
    }


def summarize_unit_days(name, day_units):
    sizes = [sum(u["verses"] for u in du) for du in day_units]
    words = [sum(u["words"] for u in du) for du in day_units]
    books = []
    for du in day_units:
        for u in du:
            if u["book"] not in books:
                books.append(u["book"])
    chapters = 0
    seen_ch = set()
    for du in day_units:
        for u in du:
            key = (u["book"], u["ch"])
            if key not in seen_ch:
                seen_ch.add(key)
                chapters += 1
    return {
        "stream": name,
        "books": len(books),
        "book_ids": books,
        "chapters": chapters,
        "verses": sum(sizes),
        "words": sum(words),
        "days": len(day_units),
        "verse_min": min(sizes) if sizes else 0,
        "verse_max": max(sizes) if sizes else 0,
        "verse_avg": (sum(sizes) / len(sizes)) if sizes else 0,
        "word_min": min(words) if words else 0,
        "word_max": max(words) if words else 0,
        "word_avg": (sum(words) / len(words)) if words else 0,
        "last_end": len(day_units) == DAYS,
        "mid_chapter_days": sum(1 for du in day_units if any(not u["whole"] for u in du)),
    }


def build(root, fallback=None, out_path=None):
    cat = load_json(os.path.join(root, "data", "books.json"))
    catalog_books = cat["books"]
    books = {b["id"]: b for b in catalog_books}
    ids = stream_ids(catalog_books)
    covered_ids = []
    for key in STREAM_KEYS:
        covered_ids.extend(ids[key])
    missing = [b["id"] for b in catalog_books if b["id"] not in set(covered_ids)]
    if missing:
        raise SystemExit("Catalog books not placed in any stream: " + ", ".join(missing))
    if len(covered_ids) != len(set(covered_ids)):
        raise SystemExit("A book was placed in more than one stream")

    counts = {}
    fallbacks = set()
    day_units = {}
    for key in STREAM_KEYS:
        chapters, ch_counts, used_fb = load_chapters(root, catalog_books, ids[key], fallback)
        counts.update(ch_counts)
        fallbacks.update(used_fb)
        packed = pack_stream_even(chapters, DAYS)
        if len(packed) != DAYS:
            raise SystemExit("{0} stream packed into {1} days, not 365".format(key, len(packed)))
        day_units[key] = packed

    start = datetime.date(2025, 1, 1)
    days = []
    daily = []
    for d in range(DAYS):
        date = start + datetime.timedelta(days=d)
        day = {"date": date.strftime("%m-%d")}
        verse_total = 0
        word_total = 0
        for key in STREAM_KEYS:
            units = day_units[key][d]
            day[key] = entries_from_units(units, books)
            verse_total += sum(u["verses"] for u in units)
            word_total += sum(u["words"] for u in units)
        days.append(day)
        daily.append({"date": day["date"], "verses": verse_total, "words": word_total})

    apoc = [b["id"] for b in catalog_books if b.get("division") == "Apocrypha"]
    pseud = [b["id"] for b in catalog_books if b.get("division") == "Pseudepigrapha"]
    note = (
        "Each day has five readings, one from each section of this Bible: the "
        "Old Testament (except Psalms and Proverbs), the Psalms, Proverbs, the "
        "New Testament, and the extra books (the Apocrypha and the "
        "Pseudepigrapha, in this Bible’s book order). Each section is divided "
        "evenly over 365 days by verse count and finishes on December 31. A "
        "long chapter is split by verse when that keeps the days even. Every "
        "book and verse is read once. On February 29 in a leap year, read the "
        "February 28 portion again, or use the day to catch up."
    )
    out = {
        "title": "Bible in a Year",
        "note": note,
        "canonBooks": len(catalog_books),
        "leapDay": {"02-29": "02-28"},
        "placement": {
            "streams": ids,
        },
        "verseCounts": counts,
        "days": days,
    }
    dest = out_path or os.path.join(root, "data", "bible-in-a-year.json")
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    stats = {k: summarize_unit_days(k, day_units[k]) for k in STREAM_KEYS}
    totals_v = [x["verses"] for x in daily]
    totals_w = [x["words"] for x in daily]
    samples = {}
    for key in ("01-01", "11-24", "12-31"):
        day = next(x for x in days if x["date"] == key)
        samples[key] = {k: [it["label"] for it in day[k]] for k in STREAM_KEYS}
    report = {
        "output": dest,
        "catalog_books": len(catalog_books),
        "covered_books": len(covered_ids),
        "stream_books": ids,
        "apocrypha": apoc,
        "pseudepigrapha": pseud,
        "fallback_books": sorted(fallbacks),
        "streams": stats,
        "samples": samples,
        "day_verse_min": min(totals_v),
        "day_verse_max": max(totals_v),
        "day_verse_avg": sum(totals_v) / len(totals_v),
        "day_word_min": min(totals_w),
        "day_word_max": max(totals_w),
        "day_word_avg": sum(totals_w) / len(totals_w),
        "minutes_avg_at_150wpm": (sum(totals_w) / len(totals_w)) / 150.0,
        "minutes_min_at_150wpm": min(totals_w) / 150.0,
        "minutes_max_at_150wpm": max(totals_w) / 150.0,
        "daily": daily,
    }
    return out, report


def print_report(report):
    print("Wrote", report["output"])
    print("Books in catalog / covered: {0} / {1}".format(report["catalog_books"], report["covered_books"]))
    names = {
        "ot": "Old Testament",
        "ps": "Psalms",
        "pr": "Proverbs",
        "nt": "New Testament",
        "ex": "Extra books (Apocrypha and Pseudepigrapha)",
    }
    if report["fallback_books"]:
        print("  Used fallback text for: {0}".format(", ".join(report["fallback_books"])))
    for k in STREAM_KEYS:
        s = report["streams"][k]
        print(
            "{0}: {1} books, {2} chapters, {3} verses, {4} words; "
            "per day {5:.2f} verses (min {6}, max {7}); mid-chapter days {8}; fills 365: {9}".format(
                names[k], s["books"], s["chapters"], s["verses"], s["words"],
                s["verse_avg"], s["verse_min"], s["verse_max"],
                s["mid_chapter_days"], s["last_end"],
            )
        )
    print(
        "Daily total: {0:.1f} verses (min {1}, max {2}); {3:.0f} words (min {4}, max {5}); "
        "about {6:.0f} minutes/day at 150 words/minute (range {7:.0f}–{8:.0f}).".format(
            report["day_verse_avg"], report["day_verse_min"], report["day_verse_max"],
            report["day_word_avg"], report["day_word_min"], report["day_word_max"],
            report["minutes_avg_at_150wpm"], report["minutes_min_at_150wpm"], report["minutes_max_at_150wpm"],
        )
    )
    for key, labels in report["samples"].items():
        print(key + ":", "; ".join("{0}: {1}".format(k, ", ".join(v)) for k, v in labels.items()))


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("root", nargs="?", default=".", help="Site repository root")
    p.add_argument("--fallback", default=None, help="Second repo root for missing book files")
    p.add_argument("--out", default=None, help="Output JSON path (default: data/bible-in-a-year.json)")
    args = p.parse_args(argv)
    _out, report = build(
        os.path.abspath(args.root),
        fallback=args.fallback and os.path.abspath(args.fallback),
        out_path=args.out,
    )
    print_report(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
