#!/usr/bin/env python3
"""
Nodal Research, Goalset 1 spike: the latest MATERIAL news story for every ticker,
picked with plain rules (no AI).

How to run (Python 3.9+, standard library only, nothing to install):

    python3 news_spike.py fetch      # download tickers + the last 14 days of Massive news into ./data
    python3 news_spike.py analyze    # apply the rules to ./data, write results into ./out
    python3 news_spike.py            # both

The fetch step needs the company's Massive API key, either exported as
MASSIVE_API_KEY or saved in a file called .env next to this script:

    MASSIVE_API_KEY=paste_the_key_here
"""
import csv
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

DAYS = 14  # how far back "latest news" may reach
HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
OUT = HERE / "out"

WATCHLISTS = "https://nodal-fvj3.onrender.com/api/watchlist-cache/custom-watchlists"
TAB_QUERIES = ["", "?resourceTab=ai-applications", "?resourceTab=watchlist"]
TAB_LABELS = {"ai-buildout": "AI Buildout", "ai-applications": "AI Applications",
              "watchlist": "Areas of Interest"}
MASSIVE = "https://api.polygon.io"  # Massive's API (api.massive.com is the same thing)

# Share classes that should count as the ticker we list.
ALIASES = {"GOOGL": "GOOG", "GOOGM": "GOOG", "GOOGN": "GOOG"}

# Press-release wires: a release headline starts with the company that issued it, so for
# these we only trust a ticker tag when that company's name is in the headline.
WIRES = {"GlobeNewswire Inc.", "Business Wire", "PR Newswire", "Accesswire", "ACCESSWIRE"}

# ---------------------------------------------------------------------------------------
# Names we look for in headlines. Case-insensitive, except names starting with "=" which
# must match exactly (for names that are also ordinary words, like Arm or Carrier).
# Tickers missing here are looked up from Massive during fetch (saved to data/names.json).
# ---------------------------------------------------------------------------------------
NAMES = {
    # AI Buildout
    "AOSL": ["Alpha and Omega", "Alpha & Omega"], "TXN": ["Texas Instruments"],
    "STM": ["STMicroelectronics", "STMicro"], "WOLF": ["Wolfspeed"],
    "ON": ["onsemi", "ON Semiconductor"], "NVDA": ["Nvidia"], "AMD": ["AMD", "Advanced Micro Devices"],
    "AVGO": ["Broadcom"], "QCOM": ["Qualcomm"], "LSCC": ["Lattice Semiconductor", "Lattice"],
    "MRVL": ["Marvell"], "INTC": ["Intel"], "EQIX": ["Equinix"], "IRM": ["Iron Mountain"],
    "STX": ["Seagate"], "WDC": ["Western Digital"], "NTAP": ["NetApp"], "SNDK": ["Sandisk"],
    "SNPS": ["Synopsys"], "CDNS": ["Cadence"], "RMBS": ["Rambus"], "ETN": ["Eaton"],
    "NVT": ["nVent"], "POWL": ["Powell Industries", "Powell"], "HUBB": ["Hubbell"],
    "MYRG": ["MYR Group"], "VICR": ["Vicor"], "LWLG": ["Lightwave Logic"],
    "POET": ["POET Technologies", "=POET"], "FLR": ["Fluor"], "PWR": ["Quanta Services", "Quanta"],
    "EME": ["EMCOR"], "JCI": ["Johnson Controls"], "TT": ["Trane"], "AMKR": ["Amkor"],
    "MU": ["Micron"], "TSEM": ["Tower Semiconductor"], "KLIC": ["Kulicke"], "IREN": ["IREN"],
    "NBIS": ["Nebius"], "APLD": ["Applied Digital"], "CORZ": ["Core Scientific"],
    "WULF": ["TeraWulf"], "CRWV": ["CoreWeave"], "CLS": ["Celestica"], "JBL": ["Jabil"],
    "FLEX": ["=Flex"], "SANM": ["Sanmina"], "PLXS": ["Plexus"], "BHE": ["Benchmark Electronics"],
    "ALAB": ["Astera Labs", "Astera"], "CRDO": ["Credo"], "APH": ["Amphenol"],
    "TEL": ["TE Connectivity"], "BDC": ["Belden"], "SMTC": ["Semtech"], "LIN": ["Linde"],
    "AXTI": ["=AXT"], "CBT": ["Cabot"], "APD": ["Air Products"], "SMR": ["NuScale"],
    "OKLO": ["Oklo"], "BE": ["Bloom Energy"], "CCJ": ["Cameco"], "COHR": ["=Coherent"],
    "LITE": ["Lumentum"], "IPGP": ["IPG Photonics"], "AAOI": ["Applied Optoelectronics"],
    "FN": ["Fabrinet"], "CIEN": ["Ciena"], "VIAV": ["Viavi"], "MTSI": ["MACOM"],
    "GFS": ["GlobalFoundries"], "AMAT": ["Applied Materials"], "LRCX": ["Lam Research"],
    "ACMR": ["ACM Research"], "ACLS": ["Axcelis"], "ENTG": ["Entegris"], "MKSI": ["=MKS"],
    "SMCI": ["Super Micro", "Supermicro"], "DELL": ["Dell"],
    "HPE": ["Hewlett Packard Enterprise", "=HPE"], "ANET": ["Arista"], "CSCO": ["Cisco"],
    "FORM": ["FormFactor"], "ONTO": ["Onto Innovation"], "TER": ["Teradyne"], "COHU": ["Cohu"],
    "AEHR": ["Aehr"], "KLAC": ["=KLA"], "VRT": ["Vertiv"], "CARR": ["=Carrier"],
    "FIX": ["Comfort Systems"], "MOD": ["Modine"], "CEG": ["Constellation Energy", "Constellation"],
    "EXC": ["Exelon"], "NEE": ["NextEra"], "VST": ["Vistra"], "MXL": ["MaxLinear"],
    "TTMI": ["TTM Technologies", "=TTM"], "VECO": ["Veeco"], "HUT": ["Hut 8"],
    "HIVE": ["HIVE Digital", "=HIVE"], "WYFI": ["WhiteFiber"],
    "ASX": ["ASE Technology", "=ASE"], "NOK": ["Nokia"], "Q": ["Qnity"], "LASR": ["nLight"],
    "NVTS": ["Navitas"], "STRL": ["Sterling Infrastructure"], "TLN": ["Talen"],
    "PLAB": ["Photronics"], "PENG": ["Penguin Solutions"], "FCEL": ["FuelCell"],
    "P": ["Everpure", "Pure Storage"], "TSM": ["TSMC", "Taiwan Semiconductor"], "ASML": ["ASML"],
    "SEDG": ["SolarEdge"], "CBRS": ["Cerebras"], "SHAZ": ["SharonAI"],
    "SIMO": ["Silicon Motion"], "MCHP": ["Microchip"], "NXPI": ["NXP"], "ARM": ["=Arm"],
    "SWKS": ["Skyworks"], "AMBA": ["Ambarella"], "DIOD": ["=Diodes"],
    "EXTR": ["Extreme Networks"], "TE": ["T1 Energy"],
    # AI Applications
    "ESTC": ["=Elastic"], "DT": ["Dynatrace"], "AKAM": ["Akamai"], "SNOW": ["Snowflake"],
    "DDOG": ["Datadog"], "NOW": ["ServiceNow"], "GOOG": ["Alphabet", "Google"],
    "META": ["=Meta"], "AMZN": ["Amazon", "AWS"], "MSFT": ["Microsoft"], "TEM": ["Tempus"],
    "TWST": ["Twist Bioscience"], "PLTR": ["Palantir"], "MDB": ["MongoDB"],
    "NET": ["Cloudflare"], "PATH": ["UiPath"], "AI": ["C3.ai", "C3 AI"],
    "SOUN": ["SoundHound"], "CRM": ["Salesforce"], "BBAI": ["BigBear.ai", "BigBear"],
    "TEAM": ["Atlassian"], "WDAY": ["Workday"], "DOCU": ["Docusign"], "HUBS": ["HubSpot"],
    "INTU": ["Intuit"], "ADBE": ["Adobe"], "DUOL": ["Duolingo"], "GTLB": ["GitLab"],
    "FIG": ["Figma"], "SHOP": ["Shopify"], "WIX": ["Wix"], "RDDT": ["Reddit"],
    "BAND": ["=Bandwidth"], "TWLO": ["Twilio"],
    # Areas of Interest
    "WELL": ["Welltower"], "VTR": ["Ventas"], "CTRE": ["CareTrust"], "OHI": ["Omega Healthcare"],
    "NHI": ["National Health Investors"], "LTC": ["LTC Properties"], "PLNT": ["Planet Fitness"],
    "BRBR": ["BellRing"], "EOLS": ["Evolus"], "INMD": ["InMode"],
    "SKIN": ["SkinHealth", "Beauty Health"], "HIMS": ["Hims"], "SEZL": ["Sezzle"],
    "KLAR": ["Klarna"], "DLTR": ["Dollar Tree"], "CRWD": ["CrowdStrike"],
    "ATEN": ["A10 Networks"], "PANW": ["Palo Alto Networks"], "ZS": ["Zscaler"],
    "S": ["SentinelOne"], "OKTA": ["Okta"], "SAIL": ["SailPoint"], "FTNT": ["Fortinet"],
    "OUST": ["Ouster"], "CGNX": ["Cognex"], "AEVA": ["=Aeva"], "SYM": ["Symbotic"],
    "ROK": ["Rockwell Automation", "Rockwell"], "BULL": ["Webull"], "HOOD": ["Robinhood"],
    "IBKR": ["Interactive Brokers"],
}


# ---------------------------------------------------------------------------------------
# The rules. Each article-ticker pair goes through these checks in order:
#   1. junk patterns (law-firm ads, event notices, insider trades, ratings, opinion)
#   2. test 1 "about the company": its name is in the headline (or it is the only ticker)
#   3. tests 2+3 "something material happened": the headline names one of the event types
# ---------------------------------------------------------------------------------------
def rx(*parts):
    return re.compile("|".join(parts), re.IGNORECASE)


# "X beats estimates" is real earnings news, so it is exempt from the rating/opinion rules.
EARNINGS_BEAT = rx(r"\b(beats?|tops?|miss(es)?|exceeds?|surpass(es)?|falls? short of|lags?)\b"
                   r".{0,40}\b(estimates|expectations|forecasts?|views|consensus)\b")

JUNK = [
    ("law-firm ad", rx(
        r"class action", r"lead plaintiff", r"securities (fraud|litigation|investigation)",
        r"\b(shareholder|investor)s? (alert|news|reminder|notice)\b",
        r"\b(investors|shareholders) (who|with) (lost|suffered|substantial)",
        r"suffered (substantial )?losses", r"lost money", r"encourag\w* .{0,60}investors",
        r"\binvestors? (are )?(encouraged|urged|reminded)", r"deadline alert", r"filing deadline",
        r"law firm", r"important notice to .{0,40}shareholders", r"long-term shareholders",
        r"\b(rosen|pomerantz|bronstein|glancy|kirby mcinerney|levi & korsinsky|faruqi"
        r"|bragar|robbins geller|hagens berman|portnoy|schall|kessler topaz|bernstein liebhard"
        r"|block & leviton)\b")),
    ("market-research ad", rx(
        r"market (size|share|report|research)", r"global forecast", r"trend analysis",
        r"featuring profiles", r"research and markets", r"\bcagr\b", r"industry (report|analysis)")),
    ("event notice / preview", rx(
        r"\bexpected to (beat|grow|report|post|rise|decline|fall)\b", r"what to know ahead",
        r"ahead of next week", r"\bwill\b.{0,50}\bbeat\b", r"\bpoised to beat\b", r"\bunlocking q[1-4]\b",
        r"exploring wall street estimates", r"\bearnings (preview|test)\b",
        r"\b(announces|sets|schedules|confirms)\b.{0,60}\b(date|time|timing)\b",
        r"\bto (report|announce|release|host|hold|present|participate|webcast)\b",
        r"conference call", r"fireside chat", r"\b(investor|analyst|r&d) day\b", r"earnings preview",
        r"what to expect", r"gears up", r"ahead of (its )?(q[1-4]|earnings|results)",
        r"earnings on deck")),
    ("holdings / insider trade", rx(
        r"\b(director|executive|ceo|cfo|insider|fund|capital|management|advisors|llc|wealth|trust)\b"
        r".{0,40}\b(buys|sells|purchases|trims|adds|boosts|cuts|acquires|dumps|unloads)\b"
        r".{0,40}\b(shares|stake|position|stock)\b",
        r"\b13f\b", r"insider (buying|selling|buys|sells)", r"\bshares (sold|bought|acquired) by\b")),
    ("analyst rating", rx(
        r"upgrade", r"downgrade", r"price target", r"\bPT\b", r"\brating\b", r"zacks rank",
        r"strong (buy|sell)", r"outperform", r"underperform", r"overweight", r"underweight",
        r"initiat\w* (coverage|at)", r"reiterat", r"\bmaintains\b", r"\banalysts?\b",
        r"estimates? (signal|revision|rise|move|cut)", r"earnings estimate", r"\bconsensus\b")),
    ("opinion / listicle", rx(
        r"\?\s*$", r"better buy", r"should you", r"is it (time|too late)", r"\bbuy (it )?now\b",
        r"stocks? to (buy|own|hold|watch|avoid)", r"prediction",
        r"could (be worth|make you|soar|double|triple)", r"\$[\d,.]+[kKmM]? invested",
        r"invest(ed|ing)? \$[\d,.]+", r"millionaire", r"forever", r"no-brainer", r"smartest",
        r"\btop \d+\b", r"\bbest\b.{0,20}\bstocks?\b", r"\b\d+ (reasons|things|stocks|ways)\b",
        r"buy, sell,? or hold", r"\bvs\b\.?", r"\bversus\b", r"\bbubble\b", r"here'?s why",
        r"here'?s what", r"what (you|investors) (should|need to) know", r"reasons to (hold|buy|sell)",
        r"worth buying", r"caution warranted", r"\bsafer\b", r"time to buy", r"undervalued",
        r"overvalued", r"poised to", r"billionaire", r"hidden gem", r"game.?changer",
        r"\bmy (top|favorite|largest|biggest)\b", r"\bi('m|'d| am| would| just| bought| own)\b",
        r"\bwall street (thinks|says|expects|is)\b", r"\b(bull|bear) case\b", r"\bsleeper\b",
        r"\bzacks\b", r"\bthese \d+\b", r"\bbet on\b", r"industry outlook", r"counting on",
        r"\bwhy\b.{0,60}\b(matters?|looks|is|are|could|should|will|remains)\b", r"the reason is",
        r"history says", r"\betfs?\b", r"\battractive\b", r"\btakeaways?\b",
        r"\b\d+ [\w-]+ stocks\b", r"\bbuy-rated\b", r"\bone clear winner\b")),
]

ROUNDUP = rx(
    r"stock market today", r"\bstocks? making the biggest moves\b", r"\b(biggest|top) (stock )?movers\b",
    r"\bmarket (wrap|recap|update)\b", r"\bpre-?market\b", r"\bafter-?hours\b", r"\bweek ahead\b",
    r"\b(dow|nasdaq|s&p 500|s&p|stocks|futures|wall street)\b.{0,12}\b(gains?|jumps?|rises?|falls?"
    r"|drops?|slips?|sinks?|rall(y|ies)|tumbles?|climbs?|edges?|closes?|opens?)\b")

EVENTS = [
    ("Earnings / guidance", rx(
        r"\bearnings\b", r"\bresults\b", r"\brevenue\b", r"\bsales\b", r"\bprofit", r"\bnet (income|loss)\b",
        r"\beps\b", r"\bguidance\b", r"\boutlook\b", r"\bforecast", r"\bq[1-4]\b", r"\bquarter",
        r"\bfiscal\b", r"\bbeats?\b", r"\bmiss(es)?\b", r"pre-?announce")),
    ("Deal / contract / M&A", rx(
        r"\bacquir", r"\bacquisition", r"\bmerger\b", r"\bmerge", r"\bto buy\b", r"\bbuyout\b",
        r"\btakeover\b", r"\bdivest", r"spin-?off", r"\bspins? off\b", r"\bdeals?\b", r"\bagreement\b",
        r"\bpartnership\b", r"\bpartners? with\b", r"\bteams? up\b", r"\bcollaborat", r"\bcontract",
        r"\bawarded\b", r"\bwins?\b", r"\border(s)? (from|for|worth)\b", r"\bjoint venture\b",
        r"\balliance\b", r"\bselect(s|ed)\b", r"\bsigns?\b", r"\bbacklog\b", r"\bpact\b",
        r"\binvest(s|ment)? \$", r"\bstake\b")),
    ("Capital / buyback / dividend", rx(
        r"\boffering\b", r"private placement", r"\bconvertible\b", r"\bnotes\b", r"\bdebt\b",
        r"\braises? \$", r"\bfinancing\b", r"credit facility", r"\bbuyback\b", r"\brepurchase",
        r"\bdividend\b", r"stock split", r"\bipo\b", r"goes public", r"\bdelist")),
    ("Product / capacity", rx(
        r"\blaunch", r"\bunveil", r"\bintroduc", r"\bdebut", r"\brolls? out\b", r"\breleases?\b",
        r"now available", r"general availability", r"\bships?\b", r"\bshipping\b",
        r"begins (production|shipping|operations)", r"\bstarts? production\b", r"breaks ground",
        r"groundbreaking", r"\bopens?\b", r"\bexpands?\b", r"\bexpansion\b",
        r"new (facility|fab|plant|data cent(er|re)|campus|factory|site)", r"\bcapacity\b",
        r"\bmegawatts?\b", r"\b\d+\s?(mw|gw)\b", r"\bgigawatts?\b", r"power purchase", r"\bppa\b")),
    ("Leadership", rx(
        r"\bceo\b", r"\bcfo\b", r"\bcoo\b", r"\bcto\b", r"chief (executive|financial|operating|technology)",
        r"\bchair(man|woman|person)?\b", r"\bboard\b", r"\bappoint",
        r"\bnames\b.{0,40}\b(chief|president|ceo|cfo|head|director|chair)", r"\bhires?\b",
        r"\bresign", r"steps? down", r"\bretire", r"succession", r"\bdeparts?\b")),
    ("Legal / regulatory", rx(
        r"\bexport", r"\bbans?\b", r"\bbanned\b", r"\brestrict", r"\bsanction", r"\btariff",
        r"antitrust", r"\blawsuit", r"\bsues?\b", r"\bsued\b", r"\bsettle", r"\bprobe\b",
        r"\binvestigat", r"subpoena", r"\bsec\b", r"\bdoj\b", r"\bftc\b", r"\bfcc\b", r"\bfda\b",
        r"\bregulat", r"\bapprov", r"\bclearance\b", r"\bfined\b", r"\bfines\b",
        r"\bpenalt", r"\bcourt\b", r"\bjudge\b", r"\bruling\b", r"\bverdict\b", r"\bpatent",
        r"\brecall", r"\blicens", r"\bpentagon\b", r"department of", r"chips act", r"\bgrant\b")),
]

PRICE_MOVE = rx(
    r"\b(soar|surge|jump|rall(y|ies)|climb|gain|pop|spike|sink|sank|plunge|plummet|tumble|drop|fall"
    r"|fell|slide|slid|slump|dive|crater|skyrocket|rocket|rise|rose|slip)\w*\b",
    r"\bwhy .{0,40}\b(stock|shares)\b")


COMMON_WORD_TICKERS = {"NOW", "NET", "PATH", "TEAM", "FIX", "MOD", "WELL", "SKIN", "BULL", "HOOD",
                       "SAIL", "FIG", "BAND", "SHOP", "ARM", "LIN", "WIX", "POET", "FORM", "ONTO"}


def compile_names(names, ticker=""):
    patterns = []
    if ticker:  # Zacks-style headlines often use the ticker itself, e.g. "SNDK Q1 Earnings..."
        patterns.append(re.compile(r"\(" + re.escape(ticker) + r"\)"))
        if len(ticker) >= 3 and ticker not in COMMON_WORD_TICKERS:
            patterns.append(re.compile(r"(?<![A-Za-z0-9])" + re.escape(ticker) + r"(?![A-Za-z0-9])"))
    for name in names:
        flags = 0 if name.startswith("=") else re.IGNORECASE
        name = name.lstrip("=")
        patterns.append(re.compile(r"(?<![A-Za-z0-9])" + re.escape(name) + r"(?![A-Za-z0-9])", flags))
    return patterns


def classify(title, publisher, tagged, ticker, name_patterns, named_count=0):
    """Return (verdict, why_dropped, event_type) for one article-ticker pair."""
    has_name = any(p.search(title) for p in name_patterns)
    beat = bool(EARNINGS_BEAT.search(title))

    for reason, pattern in JUNK:
        if beat and reason in ("analyst rating", "opinion / listicle"):
            continue
        if pattern.search(title):
            return "drop", reason, ""

    # Test 1: is the article about this company?
    if named_count >= 3:  # a headline naming 3+ of our companies is commentary, not one company's news
        return "drop", "market roundup", ""
    if not has_name:
        if ROUNDUP.search(title) or len(tagged) >= 5:
            return "drop", "market roundup", ""
        if not (len(tagged) == 1 and publisher not in WIRES):
            return "drop", "only mentions the company", ""

    # Tests 2 + 3: did something material happen?
    for event, pattern in EVENTS:
        if pattern.search(title):
            return "show", "", event
    if PRICE_MOVE.search(title):
        return "drop", "price move, no cause named", ""
    return "drop", "no material event", ""


# ---------------------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------------------
try:
    from zoneinfo import ZoneInfo
    ET = ZoneInfo("America/New_York")
except Exception:  # Windows without tzdata: fall back to a fixed UTC-4 (EDT)
    ET = timezone(timedelta(hours=-4), "ET")


def et(dt):
    return dt.astimezone(ET).strftime("%b %d, %I:%M %p ET") if dt else ""


def parse_time(value):
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def canonical_url(url):
    parts = urllib.parse.urlsplit((url or "").strip())
    return (parts.netloc.lower() + parts.path.rstrip("/")).lower()


def dedupe(items):
    seen, out = set(), []
    for item in items:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def clean_name(name):
    suffix = (r"[,.]?\s+(inc|corp|corporation|co|company|ltd|limited|plc|holdings?|group|n\.?v\.?"
              r"|s\.?a\.?|ag|se|llc|lp|class [a-z]|common stock|ordinary shares|ads|american depositary)\b.*$")
    return re.sub(suffix, "", name, flags=re.IGNORECASE).strip()


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def save_json(path, obj):
    Path(path).write_text(json.dumps(obj, indent=1), encoding="utf-8")


def redact(url):
    return re.sub(r"apiKey=[^&]+", "apiKey=***", url)


def with_key(url, key):
    return url if "apiKey=" in url else url + ("&" if "?" in url else "?") + "apiKey=" + key


def get_json(url, tries=6):
    for attempt in range(tries):
        request = urllib.request.Request(url, headers={"User-Agent": "nodal-news-spike/0.1"})
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            if error.code in (401, 403):
                raise SystemExit("HTTP %d: the API key was rejected. Check MASSIVE_API_KEY." % error.code)
            if error.code == 429 or error.code >= 500:  # rate limit or server waking up
                wait = 15 * (attempt + 1)
                print("    HTTP %d, waiting %ds and retrying..." % (error.code, wait))
                time.sleep(wait)
                continue
            raise SystemExit("HTTP %d from %s" % (error.code, redact(url)))
        except urllib.error.URLError as error:
            wait = 10 * (attempt + 1)
            print("    network error (%s), retrying in %ds..." % (error.reason, wait))
            time.sleep(wait)
    raise SystemExit("Gave up on " + redact(url))


def load_env():
    env_file = HERE / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip("'\""))


# ---------------------------------------------------------------------------------------
# Step 1: fetch
# ---------------------------------------------------------------------------------------
def fetch():
    load_env()
    key = os.environ.get("MASSIVE_API_KEY") or os.environ.get("POLYGON_API_KEY")
    if not key:
        raise SystemExit("No MASSIVE_API_KEY found. Put MASSIVE_API_KEY=... in a .env file next to this script.")
    DATA.mkdir(exist_ok=True)

    print("1/3 Getting the ticker list from Nodal Research (first call can be slow)...")
    tickers = {}
    for query in TAB_QUERIES:
        for watchlist in get_json(WATCHLISTS + query).get("watchlists", []):
            if watchlist.get("name", "").startswith("__"):
                continue
            tab = watchlist.get("resource_tab") or ""
            group = TAB_LABELS.get(tab, tab or "Other")
            for ticker in watchlist.get("tickers", []):
                tickers.setdefault(ticker, {"group": group, "list": watchlist.get("name", "")})
    save_json(DATA / "tickers.json", tickers)
    print("    %d tickers" % len(tickers))

    print("2/3 Downloading the last %d days of Massive news..." % DAYS)
    since = (datetime.now(timezone.utc) - timedelta(days=DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    url = MASSIVE + "/v2/reference/news?" + urllib.parse.urlencode({
        "published_utc.gte": since, "order": "asc", "sort": "published_utc", "limit": 1000, "apiKey": key})
    news, page = [], 0
    while url:
        page += 1
        data = get_json(url)
        news.extend(data.get("results", []))
        print("    page %d: %d articles so far" % (page, len(news)))
        next_url = data.get("next_url")
        url = with_key(next_url, key) if next_url else None
    save_json(DATA / "news.json", news)

    missing = [t for t in tickers if t not in NAMES]
    print("3/3 Looking up company names for %d tickers not in NAMES..." % len(missing))
    extra = {}
    for ticker in missing:
        result = get_json(MASSIVE + "/v3/reference/tickers/" + urllib.parse.quote(ticker)
                          + "?apiKey=" + key).get("results") or {}
        if result.get("name"):
            extra[ticker] = [clean_name(result["name"])]
    save_json(DATA / "names.json", extra)
    print("Done. Saved to %s" % DATA)


# ---------------------------------------------------------------------------------------
# Step 2: analyze
# ---------------------------------------------------------------------------------------
def analyze():
    tickers = load_json(DATA / "tickers.json")
    news = load_json(DATA / "news.json")
    extra = load_json(DATA / "names.json") if (DATA / "names.json").exists() else {}
    names = {t: compile_names(NAMES.get(t) or extra.get(t) or [], t) for t in tickers}
    cutoff = datetime.now(timezone.utc) - timedelta(days=DAYS)

    pairs, seen, article_count = [], set(), 0
    for article in news:
        when = parse_time(article.get("published_utc"))
        url = article.get("article_url") or ""
        ids = {article.get("id"), canonical_url(url)} - {None, ""}
        if when is None or when < cutoff or ids & seen:
            continue
        seen |= ids
        tagged = dedupe([ALIASES.get(t, t) for t in article.get("tickers") or []])
        ours = [t for t in tagged if t in tickers]
        if not ours:
            continue
        article_count += 1
        title = " ".join((article.get("title") or "").split())
        publisher = (article.get("publisher") or {}).get("name", "")
        named_count = sum(1 for t in ours if any(p.search(title) for p in names[t]))
        for ticker in ours:
            verdict, why, event = classify(title, publisher, tagged, ticker, names[ticker], named_count)
            pairs.append({"ticker": ticker, "when": when, "title": title, "publisher": publisher,
                          "url": url, "verdict": verdict, "why": why, "event": event})

    by_ticker = {}
    for pair in pairs:
        by_ticker.setdefault(pair["ticker"], []).append(pair)
    results = []
    for ticker, info in tickers.items():
        mine = sorted(by_ticker.get(ticker, []), key=lambda p: p["when"], reverse=True)
        shown = [p for p in mine if p["verdict"] == "show"]
        results.append({"ticker": ticker, "group": info["group"], "list": info["list"],
                        "articles": len(mine), "shown": len(shown),
                        "newest": mine[0] if mine else None, "pick": shown[0] if shown else None})
    write_outputs(tickers, news, pairs, results, article_count)


def write_outputs(tickers, news, pairs, results, article_count):
    OUT.mkdir(exist_ok=True)
    group_order = {"AI Buildout": 0, "AI Applications": 1, "Areas of Interest": 2}
    results.sort(key=lambda r: (group_order.get(r["group"], 9), r["list"], r["ticker"]))

    with open(OUT / "results.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["ticker", "group", "watchlist", "articles_14d", "material_14d",
                    "newest_time", "newest_publisher", "newest_headline", "newest_verdict",
                    "pick_time", "pick_event", "pick_publisher", "pick_headline", "pick_url"])
        for r in results:
            n, p = r["newest"], r["pick"]
            w.writerow([r["ticker"], r["group"], r["list"], r["articles"], r["shown"],
                        et(n["when"]) if n else "", n["publisher"] if n else "", n["title"] if n else "",
                        ("shown" if n["verdict"] == "show" else "dropped: " + n["why"]) if n else "",
                        et(p["when"]) if p else "", p["event"] if p else "", p["publisher"] if p else "",
                        p["title"] if p else "No major news in the last %d days" % DAYS, p["url"] if p else ""])

    rng = random.Random(7)
    picks = [r for r in results if r["pick"]]
    with open(OUT / "handcheck.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["ticker", "event", "headline", "publisher", "time", "url",
                    "correct? (y/n)", "notes"])
        for r in rng.sample(picks, min(20, len(picks))):
            p = r["pick"]
            w.writerow([r["ticker"], p["event"], p["title"], p["publisher"], et(p["when"]), p["url"], "", ""])

    dropped = [p for p in pairs if p["verdict"] == "drop"]
    with open(OUT / "dropped_sample.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["ticker", "why_dropped", "headline", "publisher", "time", "url",
                    "wrongly dropped? (y/n)"])
        for p in rng.sample(dropped, min(25, len(dropped))):
            w.writerow([p["ticker"], p["why"], p["title"], p["publisher"], et(p["when"]), p["url"], ""])

    # ---- summary for the meeting ----
    total = len(results)
    with_any = sum(1 for r in results if r["articles"])
    with_pick = len(picks)
    changed = [r for r in picks if r["newest"] is not r["pick"]]
    junk_only = [r for r in results if r["articles"] and not r["pick"]]
    whens = [p["when"] for p in pairs]
    window = "%s to %s" % (et(min(whens)), et(max(whens))) if whens else "no articles"

    def pct(a, b):
        return "%d%%" % round(100.0 * a / b) if b else "0%"

    def cell(text):
        return (text or "").replace("|", "/")

    lines = [
        "# Goalset 1 spike: latest material news per ticker (rules only)", "",
        "Window: %s. Source: Massive news (%d articles downloaded)." % (window, len(news)), "",
        "| Measure | Result |", "| --- | --- |",
        "| Tickers on Nodal | %d |" % total,
        "| Articles tagged with our tickers | %d (%d article-ticker pairs) |" % (article_count, len(pairs)),
        "| Tickers with any article | %d (%s) |" % (with_any, pct(with_any, total)),
        "| Tickers with a material story (coverage) | %d (%s) |" % (with_pick, pct(with_pick, total)),
        "| Tickers where the filter changed what we show | %d of %d |" % (len(changed), with_pick),
        "| Tickers with only junk, now shown as \"No major news\" | %d |" % len(junk_only),
        "", "## Newest article vs. the filter's pick", "",
        "| Ticker | Newest article (what a naive feed shows) | Filter's pick |", "| --- | --- | --- |",
    ]
    showcase = sorted(changed, key=lambda r: r["articles"], reverse=True)[:12]
    for r in showcase:
        n, p = r["newest"], r["pick"]
        lines.append("| %s | %s (%s, %s). Dropped: %s | %s: %s (%s, %s) |" % (
            r["ticker"], cell(n["title"]), n["publisher"], et(n["when"]), n["why"],
            p["event"], cell(p["title"]), p["publisher"], et(p["when"])))
    lines += ["", "## Why article-ticker pairs were dropped", "", "| Reason | Pairs |", "| --- | --- |"]
    for reason, count in Counter(p["why"] for p in dropped).most_common():
        lines.append("| %s | %d |" % (reason, count))
    lines += ["", "## What the picks are, by event type", "", "| Event type | Tickers |", "| --- | --- |"]
    for event, count in Counter(r["pick"]["event"] for r in picks).most_common():
        lines.append("| %s | %d |" % (event, count))
    no_news = [r["ticker"] for r in results if not r["articles"]]
    lines += ["", "Tickers with no articles at all (%d): %s" % (len(no_news), ", ".join(no_news))]
    (OUT / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print("\nCoverage: %d of %d tickers have a material story in the last %d days (%s)."
          % (with_pick, total, DAYS, pct(with_pick, total)))
    print("The filter changed the shown story for %d tickers; %d tickers had only junk."
          % (len(changed), len(junk_only)))
    print("Wrote: %s, %s, %s, %s" % (OUT / "summary.md", OUT / "results.csv",
                                     OUT / "handcheck.csv", OUT / "dropped_sample.csv"))


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else "all"
    if command not in ("fetch", "analyze", "all"):
        print(__doc__)
        sys.exit(1)
    if command in ("fetch", "all"):
        fetch()
    if command in ("analyze", "all"):
        analyze()
