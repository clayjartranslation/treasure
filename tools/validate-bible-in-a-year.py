#!/usr/bin/env python3
"""Prove a Bible in a Year plan covers every catalog verse exactly once and finishes in 365 days.

Each section (Old Testament except Psalms and Proverbs, Psalms, Proverbs,
New Testament, and the extra books) must have a portion every day and
must finish on December 31. No book may be skipped or repeated.

Usage:
  python3 tools/validate-bible-in-a-year.py [repo_root]
  python3 tools/validate-bible-in-a-year.py [repo_root] --fallback /path/to/other-bible
"""
from __future__ import annotations

import argparse
import json
import os
import sys

KINDS = ("ot", "ps", "pr", "nt", "ex")


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def resolve_book_file(root, entry, fallback):
    rel = (entry.get("file") or "").strip() or os.path.join("data", "books", entry["id"] + ".json")
    for base in (root, fallback) if fallback else (root,):
        if not base:
            continue
        for cand in (os.path.join(base, rel), os.path.join(base, "data", "books", entry["id"] + ".json")):
            if os.path.isfile(cand):
                return cand
    return None


def expected_verses(root, catalog, plan, fallback):
    """Map (book, ch, v) from book files and/or the plan's verseCounts."""
    expected = set()
    sources = {}
    counts = plan.get("verseCounts") or {}
    by_id = {b["id"]: b for b in catalog["books"]}
    for b in catalog["books"]:
        bid = b["id"]
        path = resolve_book_file(root, b, fallback)
        book_counts = {}
        if path:
            data = load_json(path)
            for ch in data.get("chapters") or []:
                n = ch["n"]
                vs = ch.get("verses") or []
                book_counts[str(n)] = len(vs)
                for verse in vs:
                    expected.add((bid, int(n), int(verse["v"])))
            sources[bid] = "file"
            # If the plan embedded counts, they must match the files.
            if bid in counts and counts[bid] != book_counts:
                raise AssertionError("verseCounts for {0} do not match the book file".format(bid))
        elif bid in counts:
            for ch, nverses in counts[bid].items():
                for v in range(1, int(nverses) + 1):
                    expected.add((bid, int(ch), v))
            sources[bid] = "verseCounts"
        else:
            raise AssertionError("No book file or verseCounts for {0}".format(bid))
    return expected, sources


def expand_portion(item, counts):
    """Expand a plan item into (book, ch, v) using verseCounts, same rule as the player."""
    bid = item["book"]
    ch = int(item["ch"])
    v = int(item.get("v") or 1)
    remaining = int(item.get("verses") or 0)
    book_counts = counts.get(bid) or {}
    def ch_len(c):
        return int(book_counts.get(str(c), 0))
    if remaining < 1:
        remaining = max(0, ch_len(ch) - v + 1)
    out = []
    guard = 0
    while remaining > 0 and guard < 10000:
        guard += 1
        n = ch_len(ch)
        if not n or v > n:
            raise AssertionError("Cannot expand {0} {1}:{2} with {3} verses left".format(bid, ch, v, remaining))
        take = min(remaining, n - v + 1)
        for i in range(take):
            out.append((bid, ch, v + i))
        remaining -= take
        ch += 1
        v = 1
    return out


def validate(root, fallback=None, plan_path=None):
    root = os.path.abspath(root)
    plan_path = plan_path or os.path.join(root, "data", "bible-in-a-year.json")
    plan = load_json(plan_path)
    catalog = load_json(os.path.join(root, "data", "books.json"))
    days = plan.get("days") or []
    errors = []
    if len(days) != 365:
        errors.append("Plan has {0} days, expected 365".format(len(days)))
    leap = (plan.get("leapDay") or {}).get("02-29")
    if leap != "02-28":
        errors.append("leapDay 02-29 should map to 02-28 (catch-up or rest), not a 366th unique reading")
    dates = [d.get("date") for d in days]
    if dates[0] != "01-01" or dates[-1] != "12-31":
        errors.append("Plan should run January 1 through December 31, got {0}..{1}".format(dates[0], dates[-1]))
    if "02-29" in dates:
        errors.append("02-29 should not be its own unique day in the 365-day list")
    if len(set(dates)) != len(dates):
        errors.append("Duplicate calendar dates in the plan")

    counts = plan.get("verseCounts")
    if not counts:
        errors.append("Plan is missing verseCounts; cannot prove coverage without them or book files")
        counts = counts or {}

    expected, sources = expected_verses(root, catalog, plan, fallback)
    seen = []
    daily = []
    catalog_ids = [b["id"] for b in catalog["books"]]
    books_in_plan = set()
    stream_last = {k: None for k in KINDS}

    for i, day in enumerate(days):
        vcount = 0
        for k in KINDS:
            items = day.get(k) or []
            if not items:
                errors.append("{0} has no {1} portion".format(day.get("date"), k))
                continue
            for item in items:
                books_in_plan.add(item["book"])
                try:
                    verses = expand_portion(item, counts)
                except AssertionError as e:
                    errors.append("{0} {1}: {2}".format(day.get("date"), k, e))
                    verses = []
                if not verses:
                    errors.append("{0} {1} item {2} expanded to no verses".format(day.get("date"), k, item))
                seen.extend(verses)
                vcount += len(verses)
                if verses:
                    stream_last[k] = verses[-1]
        daily.append(vcount)

    seen_set = set(seen)
    tally = {}
    for verse in seen:
        tally[verse] = tally.get(verse, 0) + 1
    dups = [v for v, n in tally.items() if n > 1]
    if dups:
        errors.append("Repeated verses ({0}), e.g. {1}".format(len(dups), dups[:8]))
    missing = expected - seen_set
    extra = seen_set - expected
    if missing:
        sample = sorted(missing)[:8]
        errors.append("Missing {0} verses, e.g. {1}".format(len(missing), sample))
    if extra:
        sample = sorted(extra)[:8]
        errors.append("Plan has {0} verses not in the canon files/counts, e.g. {1}".format(len(extra), sample))

    not_in_plan = [i for i in catalog_ids if i not in books_in_plan]
    if not_in_plan:
        errors.append("Catalog books never appear in the plan: {0}".format(not_in_plan))

    # Each book belongs to one section; no mixing of extras into OT/NT slots.
    by_id = {b["id"]: b for b in catalog["books"]}
    def section_of(bid):
        if bid == "psalms":
            return "ps"
        if bid == "proverbs":
            return "pr"
        div = (by_id.get(bid) or {}).get("division")
        if div == "Old Testament":
            return "ot"
        if div == "New Testament":
            return "nt"
        if div in ("Apocrypha", "Pseudepigrapha"):
            return "ex"
        return None

    stream_seen = {k: [] for k in KINDS}
    stream_books = {k: set() for k in KINDS}
    for day in days:
        for k in KINDS:
            for item in day.get(k) or []:
                bid = item["book"]
                stream_books[k].add(bid)
                want = section_of(bid)
                if want and want != k:
                    errors.append("{0} places {1} in the {2} stream, but it belongs in {3}".format(
                        day.get("date"), bid, k, want))
                try:
                    stream_seen[k].extend(expand_portion(item, counts))
                except AssertionError:
                    pass

    def first_last_for_stream(k):
        books = [bid for bid in catalog_ids if section_of(bid) == k]
        if not books:
            return None, None
        first_book, last_book = books[0], books[-1]
        first_vs = [v for v in expected if v[0] == first_book]
        last_vs = [v for v in expected if v[0] == last_book]
        first_expected = min(first_vs, key=lambda v: (v[1], v[2])) if first_vs else None
        last_expected = max(last_vs, key=lambda v: (v[1], v[2])) if last_vs else None
        return first_expected, last_expected

    # Each stream starts on January 1 and finishes on December 31, in catalog order.
    if days and expected:
        first, last = days[0], days[-1]
        for k in KINDS:
            verses = stream_seen[k]
            if not verses:
                errors.append("Stream {0} is empty".format(k))
                continue
            first_expected, last_expected = first_last_for_stream(k)
            if last_expected and verses[-1] != last_expected:
                errors.append("Stream {0} ends on {1}, expected last verse {2} on December 31".format(
                    k, verses[-1], last_expected))
            last_day_verses = []
            for item in last.get(k) or []:
                try:
                    last_day_verses.extend(expand_portion(item, counts))
                except AssertionError:
                    pass
            if last_expected and last_expected not in last_day_verses:
                errors.append("December 31 {0} portion does not include the last verse {1}".format(k, last_expected))
            first_verses = []
            for item in first.get(k) or []:
                try:
                    first_verses.extend(expand_portion(item, counts))
                except AssertionError:
                    pass
            if first_expected and first_verses and first_verses[0] != first_expected:
                errors.append("January 1 {0} starts at {1}, expected {2}".format(k, first_verses[0], first_expected))

    stream_info = {}
    for k in KINDS:
        verses = stream_seen[k]
        daily_k = []
        for day in days:
            n = 0
            for item in day.get(k) or []:
                try:
                    n += len(expand_portion(item, counts))
                except AssertionError:
                    pass
            daily_k.append(n)
        stream_info[k] = {
            "books": len(stream_books[k]),
            "verses": len(set(verses)),
            "verse_min": min(daily_k) if daily_k else 0,
            "verse_max": max(daily_k) if daily_k else 0,
            "verse_avg": (sum(daily_k) / len(daily_k)) if daily_k else 0,
        }

    if daily:
        info = {
            "days": len(days),
            "books_in_catalog": len(catalog_ids),
            "books_in_plan": len(books_in_plan),
            "verses_expected": len(expected),
            "verses_in_plan": len(seen_set),
            "verses_scheduled": len(seen),
            "day_verse_min": min(daily),
            "day_verse_max": max(daily),
            "day_verse_avg": sum(daily) / len(daily),
            "streams": stream_info,
            "sources": {s: sum(1 for v in sources.values() if v == s) for s in set(sources.values())},
        }
    else:
        info = {}

    ok = not errors
    return ok, errors, info


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("root", nargs="?", default=".")
    p.add_argument("--fallback", default=None)
    p.add_argument("--plan", default=None)
    args = p.parse_args(argv)
    ok, errors, info = validate(args.root, fallback=args.fallback, plan_path=args.plan)
    if info:
        print(
            "Coverage: {0}/{1} books, {2}/{3} verses; 365 days min/avg/max verses {4}/{5:.1f}/{6}.".format(
                info.get("books_in_plan"), info.get("books_in_catalog"),
                info.get("verses_in_plan"), info.get("verses_expected"),
                info.get("day_verse_min"), info.get("day_verse_avg"), info.get("day_verse_max"),
            )
        )
        streams = info.get("streams") or {}
        names = {"ot": "OT", "ps": "Psalms", "pr": "Proverbs", "nt": "NT", "ex": "Extras"}
        for k in ("ot", "ps", "pr", "nt", "ex"):
            s = streams.get(k) or {}
            print(
                "  {0}: {1} books, {2} verses; per day {3:.2f} (min {4}, max {5})".format(
                    names[k], s.get("books", 0), s.get("verses", 0),
                    s.get("verse_avg") or 0, s.get("verse_min", 0), s.get("verse_max", 0),
                )
            )
    if ok:
        print("Bible in a Year plan is valid: 100% coverage, no repeats, finishes in 365 days.")
        return 0
    print("Bible in a Year plan failed validation:")
    for e in errors:
        print(" -", e)
    return 1


if __name__ == "__main__":
    sys.exit(main())
