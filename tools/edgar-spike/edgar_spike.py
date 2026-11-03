#!/usr/bin/env python3
"""
Nodal Research, Goalset 1 v1 spike: what would free SEC filings add to our Massive news?

US companies must file an 8-K within four business days of certain material events (results,
a big deal, a CEO leaving...), and its item numbers say what kind of event it was. Foreign companies
file 6-Ks instead, which have no item numbers. This script gets the last 14 days of both for
every ticker on Nodal, labels them, and compares them with the rules-only Massive picks.

How to run (Python 3.9+, standard library only, nothing to install):

    python3 edgar_spike.py fetch      # download Massive news + SEC filings into ./data
    python3 edgar_spike.py analyze    # label the filings, compare with Massive, write ./out
    python3 edgar_spike.py            # both

The SEC asks every script to say who is calling, with a contact email. Put it in a file
called .env next to this script (it is gitignored), or export it:

    SEC_USER_AGENT=Nodal Research Your Name you@example.com

The Massive key is read from MASSIVE_API_KEY or POLYGON_API_KEY, or else from server/.env.
Downloads are cached in ./data. Filed documents never change, so each is fetched once; the
filing lists and the news are fetched again once they are more than 12 hours old.
"""
import csv
import gzip
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone, tzinfo
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
OUT = HERE / "out"
REPO = HERE.parent.parent

sys.path.insert(0, str(HERE.parent / "news-spike"))
import news_spike as ns  # noqa: E402  (our tickers, company names and news rules live there)

DAYS = ns.DAYS
TICKERS = sorted({ns.ALIASES.get(t, t) for t in ns.NAMES})
FRESH_HOURS = 12

SEC_TICKERS = "https://www.sec.gov/files/company_tickers.json"
SEC_SUBMISSIONS = "https://data.sec.gov/submissions/CIK%010d.json"
SEC_FOLDER = "https://www.sec.gov/Archives/edgar/data/%d/%s/"
SEC_GAP = 0.15  # seconds between SEC requests: about 7 a second, under the SEC's limit of 10
FORMS = {"8-K", "8-K/A", "6-K", "6-K/A"}

# ---------------------------------------------------------------------------------------
# 8-K item numbers: what kind of event the filing reports, in plain words, and which
# news_spike event type it counts as, so filings and news can be compared ("Warning sign"
# is for events news_spike has no type for).
#   None   routine paperwork: never shown on its own.
#   PRESS  7.01 "Regulation FD" and 8.01 "Other events" are catch-alls that usually just
#          attach a press release (a dividend, a product, an investor deck...). The number
#          alone can't tell, so these are shown only when the press release's headline
#          passes the same rules as a news headline.
# 9.01 only lists the attached exhibits, so it is never news by itself.
# ---------------------------------------------------------------------------------------
PRESS = "press release"
ITEMS = {
    "1.01": ("signed a major agreement", "Deal / contract / M&A"),
    "1.02": ("ended a major agreement", "Deal / contract / M&A"),
    "1.03": ("bankruptcy or receivership", "Warning sign"),
    "1.04": ("mine safety violation", None),
    "1.05": ("cybersecurity incident", "Warning sign"),
    "2.01": ("completed an acquisition or sale", "Deal / contract / M&A"),
    "2.02": ("quarterly results", "Earnings / guidance"),
    "2.03": ("took on new debt", "Capital / buyback / dividend"),
    "2.04": ("debt repayment sped up", "Warning sign"),
    "2.05": ("restructuring or layoffs", "Warning sign"),
    "2.06": ("wrote down an asset", "Warning sign"),
    "3.01": ("delisting notice or exchange move", "Warning sign"),
    "3.02": ("sold new shares privately", "Capital / buyback / dividend"),
    "3.03": ("changed shareholder rights", "Capital / buyback / dividend"),
    "4.01": ("changed auditor", "Warning sign"),
    "4.02": ("past results can't be relied on", "Warning sign"),
    "5.01": ("change in control", "Deal / contract / M&A"),
    "5.02": ("executive or board change", "Leadership"),
    "5.03": ("amended bylaws or fiscal year", None),
    "5.04": ("paused employee-plan trading", None),
    "5.05": ("changed code of ethics", None),
    "5.06": ("changed shell company status", None),
    "5.07": ("shareholder vote results", None),
    "5.08": ("shareholder nomination dates", None),
    "7.01": ("shared information with investors", PRESS),
    "8.01": ("other events", PRESS),
    "9.01": ("exhibits attached", None),
}


# ---------------------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------------------
def read_env(path):
    values = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip("'\"")
    return values


def sec_user_agent():
    agent = os.environ.get("SEC_USER_AGENT") or read_env(HERE / ".env").get("SEC_USER_AGENT", "")
    if "@" not in agent:
        raise SystemExit("No SEC_USER_AGENT with an email found. Put a line like this in %s:\n\n"
                         "    SEC_USER_AGENT=Nodal Research Your Name you@example.com" % (HERE / ".env"))
    return agent


def massive_key():
    key = (os.environ.get("MASSIVE_API_KEY") or os.environ.get("POLYGON_API_KEY")
           or read_env(REPO / "server" / ".env").get("POLYGON_API_KEY"))
    if not key:
        raise SystemExit("No Massive key found. Set POLYGON_API_KEY, or run this inside the repo with server/.env.")
    return key


def fresh(path, hours):
    return path.exists() and time.time() - path.stat().st_mtime < hours * 3600


def decode(body):
    try:
        return body.decode("utf-8")
    except UnicodeDecodeError:  # older filings are often Windows-1252
        return body.decode("cp1252", errors="replace")


_last_request = [0.0]


def sec_get(url, cache, hours=None):
    """Fetch a SEC URL, keeping a copy in data/sec/<cache>. hours=None: the copy never goes stale."""
    path = DATA / "sec" / cache
    if path.exists() and (hours is None or fresh(path, hours)):
        return path.read_text(encoding="utf-8")
    headers = {"User-Agent": sec_user_agent(), "Accept-Encoding": "gzip"}
    for attempt in range(5):
        time.sleep(max(0.0, _last_request[0] + SEC_GAP - time.time()))
        _last_request[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as response:
                body = response.read()
                if response.headers.get("Content-Encoding") == "gzip":
                    body = gzip.decompress(body)
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            if error.code == 403:  # no contact in the User-Agent, or we went over 10 a second
                raise SystemExit("HTTP 403 from the SEC for %s. Check SEC_USER_AGENT has a name and email; "
                                 "if it does, the SEC may have paused us for going too fast. Wait 10 minutes." % url)
            if error.code == 429 or error.code >= 500:
                wait = 10 * (attempt + 1)
                print("    HTTP %d, waiting %ds and retrying..." % (error.code, wait))
                time.sleep(wait)
                continue
            raise SystemExit("HTTP %d from %s" % (error.code, url))
        except urllib.error.URLError as error:
            wait = 10 * (attempt + 1)
            print("    network error (%s), retrying in %ds..." % (error.reason, wait))
            time.sleep(wait)
            continue
        text = decode(body)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return text
    raise SystemExit("Gave up on " + url)


def accepted_time(value):
    """When the SEC accepted a filing, e.g. "2026-11-03T21:16:27.000Z" (UTC)."""
    return datetime.strptime(value[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)


class Eastern(tzinfo):
    """US Eastern time with daylight saving (2nd Sunday of March to 1st Sunday of November).
    news_spike falls back to a fixed UTC-4 on Windows without tzdata, an hour off in winter."""
    def utcoffset(self, dt):
        return timedelta(hours=-5) + self.dst(dt)

    def dst(self, dt):
        start = datetime(dt.year, 3, 8 + (6 - datetime(dt.year, 3, 8).weekday()) % 7, 2)
        end = datetime(dt.year, 11, 1 + (6 - datetime(dt.year, 11, 1).weekday()) % 7, 1)
        return timedelta(hours=1) if start <= dt.replace(tzinfo=None) < end else timedelta(0)

    def tzname(self, dt):
        return "ET"


if isinstance(ns.ET, timezone):
    ns.ET = Eastern()
et = ns.et


# ---------------------------------------------------------------------------------------
# Reading a filing: its list of documents, the press release headline, the 8-K item text
# ---------------------------------------------------------------------------------------
INLINE_TAGS = r"</?(span|font|b|i|u|a|strong|em|sup|sub|small|big)\b[^>]*>"
NOT_A_HEADLINE = ns.rx(
    # exhibit labels, contact blocks, addresses, datelines and bullets above or around the headline
    r"^ex(hibit)?\.?\s*\d", r"\bexhibit 99", r"^(press|news|media) release\b", r"for immediate release",
    r"^(contacts?|for|from|investors?|media|source)\s*:", r"\b(investor|media|public) relations\b",
    r"@", r"\(\d{3}\)\s*\d{3}", r"\b\d{3}[-.]\d{3}[-.]\d{4}\b", r"\b[A-Z]{2} \d{5}\b", r"filed by",
    r"^\d+ [\w .]*\b(blvd|boulevard|street|avenue|road|freeway|parkway|drive|plaza)\b", r"\bsuite \d",
    r"^[\w.'-]+( [\w.'-]+){1,2},\s*(cfa,?\s*)?(chief|vice|senior|executive|director|head|president"
    r"|treasurer|corporate|general|managing|manager|svp|evp|vp)\b",  # "Jane Doe, Chief Financial Officer"
    r"^(\w+,\s*)?\w+\.?\s+\d{1,2},?\s+\d{4}$", r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.? \d{1,2},$",
    r"\b(officer|counsel|relations|communications)$", r"^\(", r"^[•▪●◦·*–-]", r"^[“\"]", r"(\b\w ){5,}",
    r"^dear\b",
    r"^(\S+ ){0,4}(inc|incorporated|corp|corporation|ltd|limited|plc|n\.?v|s\.?a|ag|llc|holdings?|group)\.?$",
    r"\band subsidiaries$",
    # the cover page and signature block of a 6-K
    r"securities and exchange commission", r"washington,? d\.?\s?c\.?", r"\bform (6-k|8-k|20-f|40-f)\b",
    r"foreign private issuer", r"commission file", r"check mark", r"^pursuant to", r"duly (caused|authorized)",
    r"for the month of", r"(name|address) of (registrant|principal)", r"^(by|name|title|date)\s*:",
    r"^page \d", r"table of contents")
DATELINE = re.compile(  # "SANTA CLARA, Calif., Oct. 28, 2026 (GLOBE NEWSWIRE) -- Acme today..."
    r"^[A-Z0-9][\w .,'&()/–—-]{0,100}?\d{4}\)?\s*(\([^)]*\))?\s*(/[^/]{0,60}/)?\s*(--|—|–|-)\s*(.{20,})")
SPLIT_DATELINE = re.compile(r"^[A-Z][A-Z .'-]+,.{0,40}\b\d{4}\s*[–—-]?$")  # "BEVERLY, Mass., October 27, 2026"
WRAPPED = re.compile(r"^(a|an|and|as|at|by|for|from|in|into|of|on|or|the|to|with)\b")  # case-sensitive
SMALL_WORDS = {"a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "its", "of", "on", "or", "the",
               "to", "with"}
DANGLING = SMALL_WORDS | {"provide", "provides", "providing", "announce", "announces"}
ABBREVIATIONS = {"inc", "corp", "co", "ltd", "llc", "plc", "mr", "ms", "mrs", "dr", "jr", "sr", "st", "no", "vs",
                 "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "calif",
                 "mass", "fla", "ariz", "wash", "ore", "colo", "conn", "minn", "approx"}


def to_lines(markup):
    """The visible text of an HTML document, one line per paragraph or table row."""
    markup = re.sub(r"(?is)^\s*<DOCUMENT>.*?<TEXT>", "", markup)  # the SEC's own header: type, filename...
    markup = re.sub(r"(?is)<(script|style|title|ix:header)\b.*?</\1>", " ", markup)
    markup = re.sub(r"(?i)" + INLINE_TAGS, "", markup)
    markup = re.sub(r"(?i)</(p|div|h[1-6]|tr|li|table|title)>|<br\s*/?>", "\n", markup)
    text = html.unescape(re.sub(r"<[^>]+>", " ", markup))
    return [line for line in (" ".join(raw.split()) for raw in text.splitlines()) if line]


def documents(index_markup):
    """The rows of a filing's index page: [{type, description, url}]."""
    docs = []
    for row in re.findall(r"(?is)<tr[^>]*>(.*?)</tr>", index_markup or ""):
        cells = [" ".join(html.unescape(re.sub(r"<[^>]+>", " ", c)).split())
                 for c in re.findall(r"(?is)<td[^>]*>(.*?)</td>", row)]
        link = re.search(r'href="([^"]+)"', row)
        if len(cells) >= 4 and link:
            url = urllib.parse.urljoin("https://www.sec.gov", link.group(1).replace("/ix?doc=", ""))
            docs.append({"type": cells[3], "description": cells[1], "url": url})
    return docs


def first_sentence(text, limit=300):
    for match in re.finditer(r"[.!]\s+(?=[A-Z\"“(])", text):
        word = re.split(r"[\s(]", text[:match.start()])[-1].lower()
        if len(word) > 1 and word not in ABBREVIATIONS and "." not in word:  # not "Inc.", "A.", "L.P."
            text = text[:match.start() + 1]
            break
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + "..."


def is_title(text):
    """Title Case or ALL CAPS: nearly every word that isn't a small word starts with a capital."""
    words = [w for w in re.findall(r"[A-Za-z][\w'’.-]*", text) if w.lower() not in SMALL_WORDS]
    return len(words) >= 3 and sum(w[0].isupper() for w in words) >= 0.8 * len(words)


def wraps_onto(text, line):
    """Is this line the rest of a headline that wrapped onto the next line?"""
    if DATELINE.match(line) or SPLIT_DATELINE.match(line) or len((text + " " + line).split()) > 45:
        return False
    if text.split()[-1].lower() in DANGLING or text[-1] in ",;:&(–-" or text.count("(") > text.count(")"):
        return True  # it stopped mid-phrase: "...Names Jeroen Delsman as"
    if (NOT_A_HEADLINE.search(line) or line.endswith(",")
            or re.search(r"(highlights|summary|overview)$", line, re.IGNORECASE)):
        return False
    return (line[0].islower() or line.split()[0].lower() in SMALL_WORDS  # "AND ANNOUNCES DIVIDEND INCREASE"
            or (len(text.split()) >= 9 and is_title(text) and is_title(line)))


def headline(lines, names):
    """Guess a press release's headline from the lines above its opening paragraph (the one
    starting "CITY, Date --"): the first that reads like a headline, preferring one that names
    the company, plus any lines it wrapped onto. With none, the opening's first sentence."""
    top, opening = lines[:80], ""
    for i, line in enumerate(top):
        dateline = DATELINE.match(line)
        if dateline:
            opening = dateline.group(4)
        elif SPLIT_DATELINE.match(line):  # the dateline's text carries on on the next line
            opening = " ".join(top[i + 1:i + 3]).lstrip("–—- ")
        elif len(line.split()) > 40:  # a body paragraph with no dateline
            opening = line
        else:
            continue
        top = top[:i]
        break

    def named(text):
        return any(p.search(text) for p in names)

    picks = [i for i, line in enumerate(top)
             if len(line.split()) >= 4 and not NOT_A_HEADLINE.search(line) and not WRAPPED.match(line)
             and not (line[0].islower() and not any(p.match(line) for p in names))]  # "onsemi", not "of the"
    if not picks:
        return first_sentence(opening) if opening else ""
    i = ([i for i in picks if named(top[i])] or picks)[0]
    text = top[i]
    before = top[i - 1] if i else ""
    if (not named(text) and 1 <= len(before.split()) <= 3 and not NOT_A_HEADLINE.search(before)
            and named(before + " " + text)):  # "Lattice Semiconductor Appoints" / "John McCool and..."
        text = before + " " + text
    for line in top[i + 1:i + 4]:
        if not wraps_onto(text, line):
            break
        text += " " + line
    return text


def after_cover(lines):
    """A 6-K with no exhibit has the press release in its own body, after the cover page."""
    ends = [i for i, line in enumerate(lines[:80]) if re.search(r"form 40-f|rule 101\(b\)", line, re.IGNORECASE)]
    return lines[ends[-1] + 1:] if ends else lines


def item_sentence(lines, item):
    """The first sentence under an 8-K's "Item 5.02" heading: all a filing without a press release says."""
    heading = re.compile(r"^item\s*" + re.escape(item) + r"(?!\d)", re.IGNORECASE)
    for i, line in enumerate(lines):
        if heading.match(line):
            text = ""
            for line in lines[i + 1:i + 12]:
                if re.match(r"^item\s*\d", line, re.IGNORECASE) or len(text) > 400:
                    break
                if text or (len(line.split()) >= 3 and not (is_title(line) and not re.search(r"\d", line))):
                    # skip the item's own title ("Departure of Directors or...") and markers like "(b)"
                    text = (text + " " + line).strip()
            return first_sentence(re.sub(r"^\([a-z0-9]{1,3}\)\s*", "", text))
    return ""


# ---------------------------------------------------------------------------------------
# Step 1: fetch
# ---------------------------------------------------------------------------------------
def fetch():
    DATA.mkdir(exist_ok=True)
    since = datetime.now(timezone.utc) - timedelta(days=DAYS)
    fetch_massive(since)

    print("2/4 Matching our %d tickers to SEC company numbers (CIKs)..." % len(TICKERS))
    sec_ids = {}
    for row in json.loads(sec_get(SEC_TICKERS, "company_tickers.json", 24 * 7)).values():
        sec_ids.setdefault(row["ticker"].upper(), (row["cik_str"], row["title"]))
    companies = {}
    for ticker in TICKERS:
        spellings = [ticker] + [a for a, b in ns.ALIASES.items() if b == ticker]
        cik, name = next((sec_ids[s] for s in spellings if s in sec_ids), (None, ""))
        companies[ticker] = {"cik": cik, "name": name}
    missing = [t for t, c in companies.items() if not c["cik"]]
    print("    %d matched; not on the SEC's list: %s" % (len(TICKERS) - len(missing), ", ".join(missing) or "none"))

    print("3/4 Reading each company's filing list (cached for %d hours)..." % FRESH_HOURS)
    wanted = []
    for n, (ticker, company) in enumerate(companies.items(), 1):
        if not company["cik"]:
            continue
        submissions = json.loads(sec_get(SEC_SUBMISSIONS % company["cik"],
                                          "submissions/CIK%010d.json" % company["cik"], FRESH_HOURS))
        recent = submissions["filings"]["recent"]
        forms = recent["form"]
        company["files"] = "/".join(f for f in ("8-K", "6-K") if f in forms) or "neither"
        company["oldest_listed"] = recent["filingDate"][-1] if forms else ""
        company["eight_ks"] = [[recent["filingDate"][i], recent["items"][i]]  # for the year-round view
                               for i, form in enumerate(forms) if form.startswith("8-K")]
        for i, form in enumerate(forms):
            if form in FORMS and accepted_time(recent["acceptanceDateTime"][i]) >= since:
                wanted.append({"ticker": ticker, "cik": company["cik"], "form": form,
                               "accession": recent["accessionNumber"][i],
                               "accepted": accepted_time(recent["acceptanceDateTime"][i]).isoformat(),
                               "items": [x.strip() for x in recent["items"][i].split(",") if x.strip()],
                               "primary": recent["primaryDocument"][i]})
        if n % 25 == 0:
            print("    %d of %d companies, %d filings so far" % (n, len(companies), len(wanted)))
    ns.save_json(DATA / "companies.json", companies)

    print("4/4 Opening %d 8-Ks and 6-Ks to find the press release..." % len(wanted))
    for n, filing in enumerate(wanted, 1):
        open_filing(filing, company_names(filing["ticker"], companies[filing["ticker"]]["name"]))
        if n % 50 == 0:
            print("    %d of %d" % (n, len(wanted)))
    ns.save_json(DATA / "filings.json", wanted)
    print("Done. Saved to %s" % DATA)


def fetch_massive(since):
    """The same download as news_spike.py's fetch, into our own data/massive folder."""
    folder = DATA / "massive"
    folder.mkdir(parents=True, exist_ok=True)
    ns.save_json(folder / "tickers.json", {t: {"group": "", "list": ""} for t in TICKERS})
    ns.save_json(folder / "names.json", {})  # every ticker already has names in news_spike.NAMES
    if fresh(folder / "news.json", FRESH_HOURS):
        print("1/4 Massive news: using the copy in %s (under %d hours old)" % (folder, FRESH_HOURS))
        return
    print("1/4 Downloading the last %d days of Massive news..." % DAYS)
    key = massive_key()
    url = ns.MASSIVE + "/v2/reference/news?" + urllib.parse.urlencode({
        "published_utc.gte": since.strftime("%Y-%m-%dT%H:%M:%SZ"), "order": "asc", "sort": "published_utc",
        "limit": 1000, "apiKey": key})
    news, page = [], 0
    while url:
        page += 1
        data = ns.get_json(url)
        news.extend(data.get("results", []))
        print("    page %d: %d articles so far" % (page, len(news)))
        next_url = data.get("next_url")
        url = ns.with_key(next_url, key) if next_url else None
    ns.save_json(folder / "news.json", news)


def company_names(ticker, sec_name):
    """news_spike's name patterns for a ticker, plus the name the SEC files it under."""
    return ns.compile_names(ns.NAMES.get(ticker, []) + [ns.clean_name(sec_name)], ticker)


def open_filing(filing, names):
    """Find the filing's press release (its EX-99 exhibit) and pull out a headline. With no
    press release, an 8-K's own text under its first newsworthy item is the only summary."""
    folder = SEC_FOLDER % (filing["cik"], filing["accession"].replace("-", ""))
    cache = "archives/%s/" % filing["accession"]
    filing["index_url"] = folder + filing["accession"] + "-index.htm"
    filing["primary_url"] = folder + filing["primary"]
    docs = documents(sec_get(filing["index_url"], cache + "index.htm"))
    exhibit = next((d for d in docs if d["type"].upper().startswith("EX-99")), None)
    filing["exhibit"] = exhibit
    filing["headline"] = filing["summary"] = ""
    if exhibit:
        lines = to_lines(sec_get(exhibit["url"], cache + exhibit["url"].rsplit("/", 1)[-1]) or "")
        filing["headline"] = headline(lines, names)
        return
    lines = to_lines(sec_get(filing["primary_url"], cache + filing["primary"]) or "")
    if filing["form"].startswith("6-K"):
        text = headline(after_cover(lines), names)  # STMicro: "Enclosure: A press release dated ..., announcing X"
        filing["headline"] = re.sub(r"(?i)^enclosure:\s*(an?\s+)?press release dated [^,]+,\s*(announcing\s+)?",
                                    "", text)
        return
    news_items = [i for i in filing["items"] if ITEMS.get(i, ("", None))[1]]
    filing["summary"] = item_sentence(lines, news_items[0]) if news_items else ""


# ---------------------------------------------------------------------------------------
# Step 2: analyze
# ---------------------------------------------------------------------------------------
def newsworthy(items):
    """The 8-K items that are news by their number alone (not routine, not 7.01 / 8.01)."""
    return [i for i in items if ITEMS.get(i, ("", None))[1] not in (None, PRESS)]


def label(filing):
    """Return (event_type, decided_by, why_dropped) for one filing."""
    if filing["form"].startswith("8-K"):
        news_items = newsworthy(filing["items"])
        if news_items:
            return ITEMS[news_items[0]][1], "item number", ""
        if not any(ITEMS.get(i, ("", None))[1] == PRESS for i in filing["items"]):
            return "", "", "routine items only"
    # A 6-K, or an 8-K with only 7.01 / 8.01: only the press release can say what happened.
    if not filing["headline"]:
        return "", "", "no press release headline found"
    names = ns.compile_names(ns.NAMES.get(filing["ticker"], []), filing["ticker"])
    verdict, why, event = ns.classify(filing["headline"], "SEC filing", [filing["ticker"]],
                                      filing["ticker"], names)
    return (event, "headline rules", "") if verdict == "show" else ("", "", "headline dropped: " + why)


def describe(filing):
    """What a filing card would say: the form, what the items mean, and the best one-liner."""
    what = "; ".join(ITEMS[i][0] for i in filing["items"] if i in ITEMS and ITEMS[i][1]) or "no item numbers"
    words = filing["headline"] or filing["summary"]
    return "%s, %s: %s%s" % (filing["form"], et(filing["when"]), what, (". \"%s\"" % words) if words else "")


def analyze():
    cutoff = datetime.now(timezone.utc) - timedelta(days=DAYS)

    print("Massive: running news_spike.py's own rules on our copy of the news...")
    OUT.mkdir(exist_ok=True)
    ns.DATA, ns.OUT = DATA / "massive", OUT / "massive"
    news_outputs, kept = ns.write_outputs, {}

    def keep_pairs(tickers, news, pairs, results, article_count):  # its verdict on every article-ticker pair
        kept["pairs"] = pairs
        news_outputs(tickers, news, pairs, results, article_count)

    ns.write_outputs = keep_pairs
    ns.analyze()
    ns.write_outputs = news_outputs
    with open(OUT / "massive" / "results.csv", encoding="utf-8-sig") as f:
        massive = {row["ticker"]: row for row in csv.DictReader(f)}

    companies = ns.load_json(DATA / "companies.json")
    filings = []
    for filing in ns.load_json(DATA / "filings.json"):
        filing["when"] = datetime.fromisoformat(filing["accepted"])
        if filing["when"] >= cutoff:
            filing["event"], filing["how"], filing["why"] = label(filing)
            filings.append(filing)
    filings.sort(key=lambda f: f["when"], reverse=True)

    rows = []
    for ticker in TICKERS:
        mine = [f for f in filings if f["ticker"] == ticker]
        eights = [f for f in mine if f["form"].startswith("8-K")]
        sixes = [f for f in mine if f["form"].startswith("6-K")]
        m = massive[ticker]
        row = {"ticker": ticker, "company": companies[ticker], "massive": m,
               "m_articles": int(m["articles_14d"]), "m_pick": int(m["material_14d"]) > 0,
               "eights": eights, "sixes": sixes,
               "pick8": next((f for f in eights if f["event"]), None),
               "pick8_items": next((f for f in eights if f["how"] == "item number"), None),
               "pick6": next((f for f in sixes if f["event"]), None)}
        row["pick"] = row["pick8"] or row["pick6"]
        rows.append(row)
    write_outputs(rows, filings, cutoff, year_round(companies), earnings_speed(filings, kept["pairs"]))


def earnings_speed(filings, pairs):
    """For each earnings 8-K (item 2.02): hours until Massive's first material earnings story on
    that ticker, or None if none came. Negative means the story came first (the press release
    went out on a newswire before the SEC accepted the filing)."""
    stories = {}
    for pair in pairs:
        if pair["verdict"] == "show" and pair["event"] == "Earnings / guidance":
            stories.setdefault(pair["ticker"], []).append(pair["when"])
    speeds = []
    for x in filings:
        if x["form"] == "8-K" and "2.02" in x["items"]:
            later = sorted(w for w in stories.get(x["ticker"], []) if w >= x["when"] - timedelta(hours=12))
            speeds.append((x, (later[0] - x["when"]).total_seconds() / 3600 if later else None))
    return speeds


def year_round(companies):
    """For each 14-day stretch of the past year (by filing date): how many tickers filed a
    newsworthy 8-K, and how many still did without counting quarterly results (2.02)."""
    today = datetime.now(timezone.utc).date()
    windows = []
    for k in range(365 // DAYS):
        end = today - timedelta(days=DAYS * k)
        start = end - timedelta(days=DAYS)
        any_news = not_results = 0
        for company in companies.values():
            found = [newsworthy([i.strip() for i in items.split(",")]) for day, items in company.get("eight_ks", [])
                     if start < datetime.strptime(day, "%Y-%m-%d").date() <= end]
            any_news += any(found)
            not_results += any(set(f) - {"2.02"} for f in found)
        windows.append((start + timedelta(days=1), end, any_news, not_results))
    return windows


def write_outputs(rows, filings, cutoff, windows, speeds):
    OUT.mkdir(exist_ok=True)
    with open(OUT / "filings.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["ticker", "form", "accepted", "items", "what_the_items_mean", "event", "decided_by",
                    "why_not_shown", "exhibit", "exhibit_description", "headline", "item_text",
                    "press_release_url", "filing_url", "index_url"])
        for x in filings:
            exhibit = x["exhibit"] or {}
            w.writerow([x["ticker"], x["form"], et(x["when"]), " ".join(x["items"]),
                        "; ".join(ITEMS.get(i, ("item " + i,))[0] for i in x["items"]), x["event"], x["how"],
                        x["why"], exhibit.get("type", ""), exhibit.get("description", ""), x["headline"],
                        x["summary"], exhibit.get("url", ""), x["primary_url"], x["index_url"]])

    with open(OUT / "compare.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["ticker", "sec_name", "files", "massive_articles", "massive_material", "massive_pick",
                    "eight_ks", "eight_k_pick", "six_ks", "six_k_pick"])
        for r in rows:
            m = r["massive"]
            w.writerow([r["ticker"], r["company"]["name"], r["company"].get("files", "not on SEC list"),
                        r["m_articles"], m["material_14d"],
                        "%s: %s (%s, %s)" % (m["pick_event"], m["pick_headline"], m["pick_publisher"],
                                             m["pick_time"]) if r["m_pick"] else "",
                        len(r["eights"]), describe(r["pick8"]) if r["pick8"] else "",
                        len(r["sixes"]), describe(r["pick6"]) if r["pick6"] else ""])

    # ---- the numbers ----
    now = datetime.now(timezone.utc)
    total = len(rows)
    has_m = {r["ticker"] for r in rows if r["m_pick"]}
    has_8 = {r["ticker"] for r in rows if r["pick8"]}
    has_8_items = {r["ticker"] for r in rows if r["pick8_items"]}
    has_6 = {r["ticker"] for r in rows if r["pick6"]}
    has_sec = has_8 | has_6
    just_filed = {r["ticker"] for r in rows if r["pick"] and now - r["pick"]["when"] < timedelta(hours=24)}
    no_articles = [r for r in rows if not r["m_articles"]]
    no_cik = [r["ticker"] for r in rows if not r["company"]["cik"]]
    six_filers = [r for r in rows if r["company"].get("files") == "6-K"]
    eights = [x for x in filings if x["form"].startswith("8-K")]
    sixes = [x for x in filings if x["form"].startswith("6-K")]
    shown8 = [x for x in eights if x["event"]]
    shown6 = [x for x in sixes if x["event"]]
    by_row = {r["ticker"]: r for r in rows}

    def pct(a, b):
        return "%d%%" % round(100.0 * a / b) if b else "0%"

    def share(test, group):
        return "%d of %d" % (sum(1 for x in group if test(x)), len(group))

    def cell(text):
        return (text or "").replace("|", "/")

    def massive_cell(r):
        m = r["massive"]
        if r["m_pick"]:
            return "%s: %s (%s, %s)" % (m["pick_event"], cell(m["pick_headline"]), m["pick_publisher"],
                                        m["pick_time"])
        return "nothing material (%d articles)" % r["m_articles"]

    def filing_cell(r):
        if r["pick"]:
            return "%s: %s" % (r["pick"]["event"], cell(describe(r["pick"])))
        mine = r["eights"] + r["sixes"]
        return "nothing material (%d filings%s)" % (len(mine), ": " + mine[0]["why"] if mine else "")

    def overlap(sec):
        return [len(has_m - sec), len(sec - has_m), len(has_m & sec), len(has_m | sec), total - len(has_m | sec)]

    lines = [
        "# Goalset 1 v1 spike: what SEC filings add to Massive news", "",
        "Window: %s to %s (the last %d days). %d 8-Ks and %d 6-Ks from our %d tickers."
        % (et(cutoff), et(now), DAYS, len(eights), len(sixes), total), "",
        "## Coverage: tickers with something material to show", "",
        "| Source | Tickers |", "| --- | --- |",
        "| Massive news (rules only) | %d (%s) |" % (len(has_m), pct(len(has_m), total)),
        "| 8-K, by item number only | %d (%s) |" % (len(has_8_items), pct(len(has_8_items), total)),
        "| 8-K, also using press release headlines for 7.01 / 8.01 | %d (%s) |"
        % (len(has_8), pct(len(has_8), total)),
        "| 6-K, using press release headlines | %d |" % len(has_6),
        "| Any SEC filing (8-K or 6-K) | %d (%s) |" % (len(has_sec), pct(len(has_sec), total)),
        "", "| Overlap | Massive vs 8-K | Massive vs 8-K or 6-K |", "| --- | --- | --- |",
    ]
    names = ["Massive only", "Filing only", "Both", "Either", "Neither"]
    for name, a, b in zip(names, overlap(has_8), overlap(has_sec)):
        lines.append("| %s | %d | %d |" % (name, a, b))
    hours = sorted(h for x, h in speeds if h is not None)
    missed = [x for x, h in speeds if h is None]
    lines += [
        "", "Of the %d \"filing only\" tickers, %d filed in the last 24 hours, so Massive may not have caught up yet."
        % (len(has_sec - has_m), len((has_sec - has_m) & just_filed)), "",
        "## Earnings: is the filing faster than the news?", "",
        "| Measure | Earnings 8-Ks |", "| --- | --- |",
        "| Earnings 8-Ks (item 2.02) | %d |" % len(speeds),
        "| Massive later had a material earnings story | %d |" % len(hours),
        "| ... hours from filing to that first story (median) | %.1f |" % (hours[len(hours) // 2] if hours else 0),
        "| ... within 1 hour / 6 hours / over 12 hours | %d / %d / %d |"
        % (sum(h <= 1 for h in hours), sum(h <= 6 for h in hours), sum(h > 12 for h in hours)),
        "| Massive never had an earnings story | %d (%d of them filed in the last 24 hours) |"
        % (len(missed), sum(1 for x in missed if now - x["when"] < timedelta(hours=24))),
        "", "No earnings story on Massive: %s" % ", ".join(x["ticker"] for x in missed), "",
        "## The %d tickers with no Massive articles at all" % len(no_articles), "",
        "| Measure | Tickers |", "| --- | --- |",
        "| Filed any 8-K | %d |" % sum(1 for r in no_articles if r["eights"]),
        "| Filed a material 8-K | %d |" % sum(1 for r in no_articles if r["pick8"]),
        "| Filed a material 6-K | %d |" % sum(1 for r in no_articles if r["pick6"]),
        "",
        "Filled by a filing: %s" % ", ".join(r["ticker"] for r in no_articles if r["pick"]),
        "Still empty: %s" % ", ".join(r["ticker"] for r in no_articles if not r["pick"]),
        "",
        "## The 6-K gap", "",
        "%d of our tickers file 6-Ks instead of 8-Ks: %s."
        % (len(six_filers), ", ".join(r["ticker"] for r in six_filers)),
        "Not on the SEC's ticker list (%d): %s." % (len(no_cik), ", ".join(no_cik) or "none"), "",
        "| Measure | Count |", "| --- | --- |",
        "| 6-K filers that filed in the window | %s |" % share(lambda r: r["sixes"], six_filers),
        "| 6-Ks filed | %d |" % len(sixes),
        "| 6-Ks with a press release headline found | %d |" % sum(1 for x in sixes if x["headline"]),
        "| 6-Ks the headline rules would show | %d |" % len(shown6),
        "| 6-K filers with a material Massive story | %s |" % share(lambda r: r["m_pick"], six_filers),
        "| 6-K filers with a material 6-K | %s |" % share(lambda r: r["pick6"], six_filers),
        "| 6-K filers with either | %s |" % share(lambda r: r["pick6"] or r["m_pick"], six_filers),
        "",
        "## 8-K items filed", "", "| Item | Meaning | 8-Ks |", "| --- | --- | --- |",
    ]
    for item, count in sorted(Counter(i for x in eights for i in x["items"]).items()):
        lines.append("| %s | %s | %d |" % (item, ITEMS.get(item, ("unknown",))[0], count))
    press_only = [x for x in eights if not newsworthy(x["items"])
                  and any(ITEMS.get(i, ("", None))[1] == PRESS for i in x["items"])]
    lines += ["", "### 8-Ks with only 7.01 / 8.01 (%d): what the press release rule decided" % len(press_only), "",
              "| Ticker | Items | Press release headline (or item text) | Result |", "| --- | --- | --- | --- |"]
    for x in press_only:
        lines.append("| %s | %s | %s | %s |" % (x["ticker"], " ".join(x["items"]),
                                              cell(x["headline"] or x["summary"]),
                                              ("shown: " + x["event"]) if x["event"] else x["why"]))
    lines += ["", "| Why a filing is not shown | Filings |", "| --- | --- |"]
    for why, count in Counter(x["why"] for x in filings if not x["event"]).most_common():
        lines.append("| %s | %d |" % (why, count))

    middle = sorted(w[2] for w in windows)[len(windows) // 2]
    lines += ["", "## The past year, 14 days at a time (8-K item numbers only, by filing date)", "",
              "Median %d tickers; range %d to %d. This window is earnings season." % (
                  middle, min(w[2] for w in windows), max(w[2] for w in windows)), "",
              "| 14 days | Tickers with a newsworthy 8-K | Without counting results (2.02) |", "| --- | --- | --- |"]
    for start, end, any_news, not_results in windows:
        lines.append("| %s to %s | %d | %d |" % (start.strftime("%b %d, %Y"), end.strftime("%b %d"),
                                                 any_news, not_results))

    with_pr = [x for x in shown8 if x["exhibit"]]
    without = [x for x in shown8 if not x["exhibit"]]
    lengths = sorted(len(x["summary"]) for x in without if x["summary"])
    lines += ["", "## What a filing card has to work with", "",
              "| Measure | Filings |", "| --- | --- |",
              "| 8-Ks we would show | %d (%d of them amendments, 8-K/A) |"
              % (len(shown8), sum(1 for x in shown8 if x["form"] == "8-K/A")),
              "| ... with a press release (EX-99 exhibit) | %d (%s) |"
              % (len(with_pr), pct(len(with_pr), len(shown8))),
              "| ... press release headline found | %s |" % share(lambda x: x["headline"], with_pr),
              "| ... no press release: first sentence of the item text found | %s |"
              % share(lambda x: x["summary"], without),
              "| ... typical length of that sentence | %d characters |"
              % (lengths[len(lengths) // 2] if lengths else 0),
              "| 6-Ks we would show | %d (%d with an EX-99 exhibit, %d with the release in the 6-K itself) |"
              % (len(shown6), sum(1 for x in shown6 if x["exhibit"]), sum(1 for x in shown6 if not x["exhibit"])),
              "", "| Ticker | Card label | One-liner | Link |", "| --- | --- | --- | --- |"]
    by_event = {}
    for x in shown8 + shown6:
        by_event.setdefault(x["event"], []).append(x)
    for event, group in sorted(by_event.items()):
        for x in group[:3]:
            link = (x["exhibit"] or {}).get("url") or x["primary_url"]
            lines.append("| %s | %s, %s | %s | %s |" % (x["ticker"], x["form"], event,
                                                       cell(x["headline"] or x["summary"] or "(none)"), link))

    only = [by_row[t] for t in sorted(has_sec - has_m)]
    examples = ([r for r in only if not r["m_articles"]][:5]
                + sorted((r for r in only if r["m_articles"] and r["ticker"] not in just_filed),
                         key=lambda r: -r["m_articles"])[:5]
                + [by_row[t] for t in sorted(has_m & has_8)][:5]
                + [by_row[t] for t in sorted(has_m - has_sec)]
                + [r for r in six_filers if r["sixes"]][:4])
    lines += ["", "## Side by side", "", "| Ticker | Massive (rules pick) | SEC filing pick |", "| --- | --- | --- |"]
    for r in examples:
        lines.append("| %s | %s | %s |" % (r["ticker"], massive_cell(r), filing_cell(r)))
    (OUT / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print("\nMassive: %d of %d tickers have a material story. 8-K: %d (%d by item number alone). 6-K: %d."
          % (len(has_m), total, len(has_8), len(has_8_items), len(has_6)))
    print("Massive only %d, filing only %d, both %d, either %d (of %d)."
          % tuple(overlap(has_sec)[:4] + [total]))
    print("Of %d tickers with no Massive articles, %d filed a material 8-K or 6-K."
          % (len(no_articles), sum(1 for r in no_articles if r["pick"])))
    print("Wrote: %s, %s, %s" % (OUT / "summary.md", OUT / "compare.csv", OUT / "filings.csv"))


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else "all"
    if command not in ("fetch", "analyze", "all"):
        print(__doc__)
        sys.exit(1)
    if command in ("fetch", "all"):
        fetch()
    if command in ("analyze", "all"):
        analyze()
