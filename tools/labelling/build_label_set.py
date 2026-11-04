#!/usr/bin/env python3
"""
Nodal Research: build the hand-labelled set that measures the news rules (Goalsets 1 and 3).

One fresh 14-day download of Massive news goes through both spikes' rules. The result,
out/items.json, holds every Goalset 1 pick (one per ticker), a random sample of the
article-ticker pairs Goalset 1 dropped, and a random sample of Goalset 3's industry matches.
The labelling page shows those items. Once they are labelled, save the labels as JSON and
score them here; re-score the same labels later to see how much an AI check helps.

How to run (Python 3.9+, standard library only, nothing to install):

    python3 build_label_set.py fetch --env-file ../../server/.env   # news + watchlists into ./data
    python3 build_label_set.py build                                 # ./data -> out/items.json
    python3 build_label_set.py score labels.json                     # accuracy from saved labels

The labels file is a JSON list of {"id", "verdict": "right"|"wrong"|"unsure", "reason", "note"}.

Goalset 1's rules come from ../news-spike/news_spike.py. Goalset 3's spike is on another branch,
so its script is read with `git show origin/industry-news-v0:tools/industry-spike/industry_spike.py`
(pick another branch or commit with --industry-ref).
"""
import argparse
import hashlib
import json
import math
import os
import random
import subprocess
import sys
import types
import urllib.parse
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.dont_write_bytecode = True  # don't leave a __pycache__ folder in ../news-spike
sys.path.insert(0, str(REPO / "tools" / "news-spike"))
import news_spike as ns  # noqa: E402

DAYS = ns.DAYS
DATA = HERE / "data"
OUT = HERE / "out"
ENV_FILES = [HERE / ".env", REPO / "server" / ".env"]
INDUSTRY_SCRIPT = "tools/industry-spike/industry_spike.py"
SEED = 2026
SET_SIZE = 200          # about an hour of labelling
INDUSTRY_SAMPLE = 100
MIN_DROP_SAMPLE = 25    # dropped Goalset 1 articles, to measure misses; they fill the set up to SET_SIZE

REASONS = {"opinion": "opinion piece", "roundup": "market roundup", "not_company": "not about this company",
           "wrong_event": "wrong event type", "minor": "too minor to matter", "not_industry": "not industry news",
           "wrong_theme": "wrong theme", "should_show": "real news, should have been shown", "other": "other"}


# ---------------------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------------------
def api_key(env_file=None):
    for name in ("MASSIVE_API_KEY", "POLYGON_API_KEY"):
        if os.environ.get(name):
            return os.environ[name]
    for path in ([Path(env_file)] if env_file else []) + ENV_FILES:
        if path.exists():
            for line in path.read_text(encoding="utf-8").splitlines():
                key, _, value = line.strip().partition("=")
                if key.strip() in ("MASSIVE_API_KEY", "POLYGON_API_KEY") and value.strip():
                    return value.strip().strip("'\"")
    raise SystemExit("No MASSIVE_API_KEY or POLYGON_API_KEY found. Pass --env-file path/to/.env.")


def with_key(link, key):
    """Massive's next_url leaves out the key. Only add it to links back to Massive itself."""
    parts = urllib.parse.urlsplit(link)
    return ns.with_key(link, key) if "%s://%s" % (parts.scheme, parts.netloc) == ns.MASSIVE else None


def load_industry(ref):
    """Load the Goalset 3 spike from another branch without checking it out."""
    source = subprocess.run(["git", "show", "%s:%s" % (ref, INDUSTRY_SCRIPT)], cwd=REPO, check=True,
                            capture_output=True, text=True, encoding="utf-8").stdout
    commit = subprocess.run(["git", "rev-parse", "--short", ref], cwd=REPO, check=True,
                            capture_output=True, text=True).stdout.strip()
    module = types.ModuleType("industry_spike")
    module.__file__ = str(REPO / INDUSTRY_SCRIPT)  # its imports resolve news_spike from this checkout
    exec(compile(source, module.__file__, "exec"), module.__dict__)
    return module, commit


def item_id(prefix, *parts):
    return prefix + "-" + hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:10]


def iso(when):
    return when.strftime("%Y-%m-%dT%H:%M:%SZ")


def unique_articles(news, since, until):
    """Articles in the window, deduped by id and URL, as both spikes do it."""
    seen = set()
    for article in news:
        when = ns.parse_time(article.get("published_utc"))
        url = article.get("article_url") or ""
        ids = {article.get("id"), ns.canonical_url(url)} - {None, ""}
        if when is None or when < since or when >= until or ids & seen:
            continue
        seen |= ids
        yield article, when, url, " ".join((article.get("title") or "").split())


# ---------------------------------------------------------------------------------------
# Step 1: fetch
# ---------------------------------------------------------------------------------------
def fetch(env_file=None):
    key = api_key(env_file)
    DATA.mkdir(parents=True, exist_ok=True)
    end = datetime.now(timezone.utc).replace(microsecond=0)
    window = {"since": iso(end - timedelta(days=DAYS)), "until": iso(end)}

    print("1/3 Getting watchlists, tickers and tags from Nodal Research (first call can be slow)...")
    watchlists = []
    for query in ns.TAB_QUERIES:
        for watchlist in ns.get_json(ns.WATCHLISTS + query).get("watchlists", []):
            if watchlist.get("name", "").startswith("__"):
                continue
            watchlists.append({"name": watchlist.get("name", ""), "tab": watchlist.get("resource_tab") or "",
                               "tickers": watchlist.get("tickers", []),
                               "tags": watchlist.get("stock_tags") or {}})
    ns.save_json(DATA / "watchlists.json", watchlists)
    print("    %d watchlists, %d tickers" % (len(watchlists), len({t for w in watchlists for t in w["tickers"]})))

    print("2/3 Downloading %d days of Massive news, all tickers, %s to %s..." % (DAYS, window["since"], window["until"]))
    url = ns.MASSIVE + "/v2/reference/news?" + urllib.parse.urlencode({
        "published_utc.gte": window["since"], "published_utc.lt": window["until"], "order": "asc",
        "sort": "published_utc", "limit": 1000, "apiKey": key})
    news, page = [], 0
    while url:
        page += 1
        data = ns.get_json(url)
        news.extend(data.get("results", []))
        print("    page %d: %d articles so far" % (page, len(news)))
        next_url = data.get("next_url")
        url = with_key(next_url, key) if next_url else None
    ns.save_json(DATA / "news.json", news)
    ns.save_json(DATA / "window.json", window)

    missing = sorted({t for w in watchlists for t in w["tickers"]} - set(ns.NAMES))
    print("3/3 Looking up company names for %d tickers not in news_spike.NAMES..." % len(missing))
    extra = {}
    for ticker in missing:
        result = ns.get_json(ns.MASSIVE + "/v3/reference/tickers/" + urllib.parse.quote(ticker)
                             + "?apiKey=" + key).get("results") or {}
        if result.get("name"):
            extra[ticker] = [ns.clean_name(result["name"])]
    ns.save_json(DATA / "names.json", extra)
    print("Done. Saved to %s" % DATA)


# ---------------------------------------------------------------------------------------
# Step 2: build the items to label
# ---------------------------------------------------------------------------------------
def goalset1(news, watchlists, since, until, rng, room):
    """news_spike.analyze()'s pairs and picks, for the 194 tickers in news_spike.NAMES."""
    where = {}
    for watchlist in watchlists:
        for ticker in watchlist["tickers"]:
            where.setdefault(ticker, (ns.TAB_LABELS.get(watchlist["tab"], watchlist["tab"] or "Other"), watchlist["name"]))
    names = {t: ns.compile_names(ns.NAMES[t], t) for t in ns.NAMES}

    pairs = []
    for article, when, url, title in unique_articles(news, since, until):
        tagged = ns.dedupe([ns.ALIASES.get(t, t) for t in article.get("tickers") or []])
        ours = [t for t in tagged if t in names]
        if not ours:
            continue
        publisher = (article.get("publisher") or {}).get("name", "")
        named_count = sum(1 for t in ours if any(p.search(title) for p in names[t]))
        for ticker in ours:
            verdict, why, event = ns.classify(title, publisher, tagged, ticker, names[ticker], named_count)
            pairs.append({"ticker": ticker, "when": when, "title": title, "publisher": publisher, "url": url,
                          "verdict": verdict, "why": why, "event": event, "tagged": len(tagged)})

    def item(prefix, pair, kind):
        group, watchlist = where.get(pair["ticker"], ("", ""))
        return {"id": item_id(prefix, pair["ticker"], pair["url"]), "set": kind, "ticker": pair["ticker"],
                "company": ns.NAMES[pair["ticker"]][0].lstrip("="), "group": group, "watchlist": watchlist,
                "title": pair["title"], "url": pair["url"], "publisher": pair["publisher"], "utc": iso(pair["when"]),
                "event": pair["event"], "why": pair["why"], "tagged": pair["tagged"]}

    picks = []
    for ticker in ns.NAMES:
        shown = sorted((p for p in pairs if p["ticker"] == ticker and p["verdict"] == "show"),
                       key=lambda p: p["when"], reverse=True)
        if shown:
            picks.append(item("p", shown[0], "g1_pick"))
    # One pair per article, so a roundup tagged with ten of our tickers counts once.
    dropped, seen = [], set()
    for pair in pairs:
        if pair["verdict"] == "drop" and pair["url"] not in seen:
            seen.add(pair["url"])
            dropped.append(pair)
    size = max(MIN_DROP_SAMPLE, room - len(picks))
    drops = [item("d", p, "g1_drop") for p in rng.sample(dropped, min(size, len(dropped)))]
    rng.shuffle(picks)
    stats = {"tickers": len(ns.NAMES), "tickers_with_pick": len(picks), "pairs": len(pairs),
             "dropped_pairs": sum(1 for p in pairs if p["verdict"] == "drop"), "dropped_articles": len(dropped),
             "dropped_articles_by_reason": dict(Counter(p["why"] for p in dropped).most_common())}
    return picks, drops, stats


def goalset3(ind, news, watchlists, extra, since, until, rng):
    """industry_spike.analyze()'s headline matches."""
    ind.theme_tickers(watchlists)
    universe = {t for w in watchlists for t in w["tickers"]}
    names = {t: ns.compile_names(ns.NAMES.get(t) or extra.get(t) or [], t) for t in universe}
    matches = []
    for article, when, url, title in unique_articles(news, since, until):
        tagged = ns.dedupe([ns.ALIASES.get(t, t) for t in article.get("tickers") or []])
        ours = [t for t in tagged if t in universe]
        named = [t for t in sorted(universe) if any(p.search(title) for p in names[t])]
        if 1 <= len(named) <= 2 or ind.junk(title):  # company stories are Goalset 1's
            continue
        themes = ind.match_themes(title)
        if themes:
            row = {"ours": ours, "themes": themes}
            matches.append({
                "id": item_id("i", url), "set": "g3", "title": title, "url": url,
                "publisher": (article.get("publisher") or {}).get("name", ""), "utc": iso(when),
                "bucket": ind.bucket(tagged, ours, named), "affects": len(ind.affected(row)),
                "themes": [{"name": theme["name"], "words": words, "tickers": theme["tickers"]}
                           for theme, words in themes]})
    sample = rng.sample(matches, min(INDUSTRY_SAMPLE, len(matches)))
    return sample, {"headline_matches": len(matches)}


def build(industry_ref):
    ind, commit = load_industry(industry_ref)
    watchlists = ns.load_json(DATA / "watchlists.json")
    news = ns.load_json(DATA / "news.json")
    extra = ns.load_json(DATA / "names.json") if (DATA / "names.json").exists() else {}
    window = ns.load_json(DATA / "window.json")
    since, until = ns.parse_time(window["since"]), ns.parse_time(window["until"])

    rng = random.Random(SEED)
    matches, g3 = goalset3(ind, news, watchlists, extra, since, until, rng)
    picks, drops, g1 = goalset1(news, watchlists, since, until, rng, SET_SIZE - len(matches))
    items = picks + drops + matches
    meta = {"window": window, "articles_downloaded": len(news), "seed": SEED,
            "industry_ref": "%s (%s)" % (industry_ref, commit), "goalset1": g1, "goalset3": g3,
            "counts": dict(Counter(i["set"] for i in items))}
    OUT.mkdir(parents=True, exist_ok=True)
    ns.save_json(OUT / "items.json", {"meta": meta, "items": items})
    print("%d items: %d Goalset 1 picks (of %d tickers), %d dropped pairs, %d of %d Goalset 3 matches."
          % (len(items), len(picks), g1["tickers"], len(drops), len(matches), g3["headline_matches"]))
    print("Wrote %s" % (OUT / "items.json"))


# ---------------------------------------------------------------------------------------
# Step 3: score the labels
# ---------------------------------------------------------------------------------------
def wilson(k, n, z=1.96):
    """95% range for a rate measured on n items."""
    if not n:
        return 0.0, 0.0
    p, d = k / n, 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return max(0.0, centre - half), min(1.0, centre + half)


def score(labels_path):
    data = ns.load_json(OUT / "items.json")
    items, meta = {i["id"]: i for i in data["items"]}, data["meta"]
    raw = ns.load_json(labels_path)
    labels = {r["id"]: r for r in (raw if isinstance(raw, list) else [dict(v, id=k) for k, v in raw.items()])}
    lines = []

    def pct(a, b):
        return "%d%%" % round(100.0 * a / b) if b else "n/a"

    def rate(k, n):
        low, high = wilson(k, n)
        return "%d of %d (%s; likely %d%%–%d%%)" % (k, n, pct(k, n), round(100 * low), round(100 * high))

    def section(kind, title):
        mine = [i for i in items.values() if i["set"] == kind]
        done = [labels[i["id"]] for i in mine if i["id"] in labels and labels[i["id"]].get("verdict")]
        judged = [r for r in done if r["verdict"] in ("right", "wrong")]
        right = sum(1 for r in judged if r["verdict"] == "right")
        reasons = Counter(REASONS.get(r.get("reason") or "", "no reason given") for r in judged if r["verdict"] == "wrong")
        lines.extend(["", "## " + title, "",
                      "Labelled %d of %d; %d not sure." % (len(done), len(mine), len(done) - len(judged))])
        return mine, judged, right, reasons

    mine, judged, right, reasons = section("g1_pick", "Goalset 1: the pick shown for each ticker")
    lines.append("Right: %s." % rate(right, len(judged)))
    label_only = reasons.get(REASONS["wrong_event"], 0)
    if label_only:
        lines.append("Counting \"right story, wrong event label\" as right: %s." % rate(right + label_only, len(judged)))
    by_event = Counter()
    for r in judged:
        by_event[(items[r["id"]]["event"], r["verdict"])] += 1
    lines += ["", "| Event type | Right | Wrong |", "| --- | --- | --- |"]
    for event in sorted({e for e, _ in by_event}):
        lines.append("| %s | %d | %d |" % (event, by_event[(event, "right")], by_event[(event, "wrong")]))
    lines += ["", "Why picks were wrong:"] + ["- %s: %d" % kv for kv in reasons.most_common()]

    mine, judged, right, reasons = section("g1_drop", "Goalset 1: articles the rules dropped")
    missed = len(judged) - right
    total = meta["goalset1"]["dropped_articles"]
    low, high = wilson(missed, len(judged))
    lines.append("Wrongly dropped (real news we should have shown): %s." % rate(missed, len(judged)))
    lines.append("Across all %d dropped articles that is roughly %d (likely %d–%d)."
                 % (total, round(total * missed / len(judged)) if judged else 0, round(total * low), round(total * high)))
    by_why = Counter((items[r["id"]]["why"], r["verdict"]) for r in judged)
    lines += ["", "| Rule that dropped it | Right to drop | Wrongly dropped |", "| --- | --- | --- |"]
    for why in sorted({w for w, _ in by_why}):
        lines.append("| %s | %d | %d |" % (why, by_why[(why, "right")], by_why[(why, "wrong")]))

    mine, judged, right, reasons = section("g3", "Goalset 3: industry news matched to a theme")
    lines.append("Right: %s." % rate(right, len(judged)))
    by_theme = Counter()
    for r in judged:
        by_theme[(items[r["id"]]["themes"][0]["name"], r["verdict"])] += 1
    lines += ["", "| First theme matched | Right | Wrong |", "| --- | --- | --- |"]
    for theme in sorted({t for t, _ in by_theme}, key=lambda t: -(by_theme[(t, "right")] + by_theme[(t, "wrong")])):
        lines.append("| %s | %d | %d |" % (theme, by_theme[(theme, "right")], by_theme[(theme, "wrong")]))
    lines += ["", "Why matches were wrong:"] + ["- %s: %d" % kv for kv in reasons.most_common()]

    notes = [(items[k]["set"], items[k].get("ticker") or items[k]["themes"][0]["name"], items[k]["title"], r["note"])
             for k, r in labels.items() if k in items and (r.get("note") or "").strip()]
    if notes:
        lines += ["", "## Notes left while labelling", ""] + ["- %s %s, \"%s\": %s" % n for n in notes]
    text = "# Label scores\n\nWindow: %s to %s. Items: %s.\n" % (
        meta["window"]["since"], meta["window"]["until"], ", ".join("%s %d" % kv for kv in meta["counts"].items()))
    text += "\n".join(lines) + "\n"
    (OUT / "score.md").write_text(text, encoding="utf-8")
    print(text)
    print("Wrote %s" % (OUT / "score.md"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["fetch", "build", "score"])
    parser.add_argument("labels", nargs="?", help="score: the saved labels (JSON)")
    parser.add_argument("--env-file", help="a .env file holding MASSIVE_API_KEY or POLYGON_API_KEY")
    parser.add_argument("--industry-ref", default="origin/industry-news-v0",
                        help="branch or commit to read %s from" % INDUSTRY_SCRIPT)
    args = parser.parse_args()
    if args.command == "fetch":
        fetch(args.env_file)
    elif args.command == "build":
        build(args.industry_ref)
    else:
        if not args.labels:
            raise SystemExit("Usage: build_label_set.py score labels.json")
        score(args.labels)
