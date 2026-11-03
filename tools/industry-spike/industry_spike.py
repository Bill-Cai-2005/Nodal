#!/usr/bin/env python3
"""
Nodal Research, Goalset 3 spike: INDUSTRY news, meaning articles about a theme we track
rather than about one of our companies, matched to our themes with plain rules (no AI).

How to run (Python 3.9+, standard library only, nothing to install):

    python3 industry_spike.py fetch      # download themes + the last 14 days of Massive news into ./data
    python3 industry_spike.py analyze    # find industry articles, match them to themes, write ./out
    python3 industry_spike.py score      # after filling in out/handcheck.csv: precision per theme
    python3 industry_spike.py            # fetch + analyze

The fetch step needs the company's Massive API key, as MASSIVE_API_KEY or POLYGON_API_KEY,
either exported, in a file called .env next to this script, in the repo's server/.env,
or in a file you point to with --env-file:

    python3 industry_spike.py fetch --env-file ../../server/.env

To test rule changes on two weeks you haven't read yet, pull an earlier window into its own folder:

    python3 industry_spike.py fetch --until 2026-10-20 --dir holdout
    python3 industry_spike.py analyze --dir holdout

Shared pieces (ticker names, junk rules, HTTP helpers) come from ../news-spike/news_spike.py.
"""
import argparse
import csv
import os
import random
import re
import sys
import urllib.parse
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True  # don't leave a __pycache__ folder in ../news-spike
sys.path.insert(0, str(HERE.parent / "news-spike"))
import news_spike as ns  # noqa: E402

DAYS = ns.DAYS
DATA = HERE / "data"
OUT = HERE / "out"
ENV_FILES = [HERE / ".env", HERE.parents[1] / "server" / ".env"]
HANDCHECK_SIZE = 50

# ---------------------------------------------------------------------------------------
# Our themes. Each theme gets its tickers from the live watchlists: AI Buildout themes from
# the per-ticker tags on that list ("tags"), the others from a whole watchlist ("watchlist").
# "words" are what we look for in headlines: theme words first, then peers outside our
# universe (a peer's news usually moves our names too, e.g. SK Hynix for memory).
# Case-insensitive, except words starting with "=" which must match exactly (EDA, SMR).
# ---------------------------------------------------------------------------------------
SEMI_TAGS = ["GPU", "AI Accelerator", "ASIC", "Custom Silicon", "CPU", "Foundry", "Advanced Packaging",
             "OSAT", "HBM", "DRAM", "NAND", "Memory", "Semi Equipment", "Lithography", "Etch",
             "Deposition", "Semi Materials", "Analog", "MCU", "Power Semi", "EDA"]

THEMES = [
    # ---- AI Buildout, cross-cutting ----
    {"name": "AI Buildout spending", "watchlist": "AI Buildout", "words": [
        r"capex", r"capital (expenditures?|spending)", r"hyperscalers?", r"AI (spending|investment|capex|boom|bubble|trade|build-?out)",
        r"AI infrastructure (spending|investment|deals?|build)", r"Stargate", r"compute (deals?|capacity|contracts?)",
        r"OpenAI", r"Oracle", r"gigawatts? of (compute|capacity|AI)"]},
    {"name": "Chip trade and export policy", "tags": SEMI_TAGS, "words": [
        r"export (controls?|curbs?|rules?|restrictions?|licen[cs]es?|ban)", r"entity list",
        r"(chip|semiconductor)s? tariffs?", r"tariffs? on (chips|semiconductors)", r"section 232",
        r"chips act", r"rare earths?", r"gallium", r"germanium", r"chip (war|curbs|ban|smuggling)",
        r"(china|beijing|chinese)\b.{0,40}\b(chips?|semiconductors?|nvidia)", r"(chips?|semiconductors?)\b.{0,40}\b(china|beijing)"]},
    # ---- AI Buildout, by part of the supply chain ----
    {"name": "AI chips", "tags": ["GPU", "AI Accelerator", "ASIC", "Custom Silicon", "CPU", "FPGA", "Inference",
                                   "Wafer Scale", "AI Systems"], "words": [
        r"AI chips?", r"GPUs?", r"(AI )?accelerators?", r"custom (silicon|chips?)", r"ASICs?", r"TPUs?",
        r"AI processors?", r"inference chips?", r"chipmakers?", r"chip stocks", r"semiconductor stocks",
        r"Huawei", r"Cambricon", r"Groq", r"Tenstorrent", r"Blackwell", r"Trainium"]},
    {"name": "Memory and storage", "tags": ["HBM", "DRAM", "NAND", "SSD", "HDD", "Storage", "Flash", "Memory",
                                            "Enterprise Storage", "Flash Storage", "NAND Controller",
                                            "SSD Controller", "Memory Interface IP"], "words": [
        r"=HBM\d?E?", r"high-bandwidth memory", r"DRAM", r"NAND", r"memory (chips?|prices?|makers?|shortage|market|supercycle)",
        r"flash memory", r"SSDs?", r"hard (disk )?drives?", r"HDDs?", r"=CXL", r"SK Hynix", r"Hynix",
        r"Samsung Electronics", r"Kioxia", r"CXMT", r"YMTC"]},
    {"name": "Foundry and advanced packaging", "tags": ["Foundry", "Advanced Packaging", "OSAT",
                                                        "Advanced Packaging Equipment", "Assembly Equipment",
                                                        "Advanced Packaging Materials"], "words": [
        r"foundry", r"foundries", r"CoWoS", r"advanced packaging", r"chip packaging", r"chiplets?",
        r"(2|3|1\.4|1\.6)\s?nm", r"=18A", r"=14A", r"wafers?", r"fabs?", r"chip (plants?|factory|factories)",
        r"Rapidus", r"SMIC", r"=UMC", r"Samsung Foundry"]},
    {"name": "Chip equipment and materials", "tags": ["Semi Equipment", "Deposition", "Etch", "Cleaning", "Plating",
                                                      "Ion Implant", "Lithography", "Inspection", "Metrology", "Test",
                                                      "Probe Cards", "Handlers", "Burn-In", "Semi Materials",
                                                      "Semiconductor Gases", "Specialty Chemicals", "Photoresist",
                                                      "CMP", "Photomasks", "Filtration", "Process Materials", "InP"],
     "words": [
        r"chip(making)? (equipment|tools?|machines?|gear)", r"semiconductor (equipment|tools?|materials)",
        r"wafer fab equipment", r"=WFE", r"lithography", r"=EUV", r"photoresists?", r"chip materials",
        r"=SEMI", r"Tokyo Electron", r"ASM International", r"Advantest", r"Screen Holdings"]},
    {"name": "Networking and optics", "tags": ["Networking", "Ethernet", "AI Networking", "Optical Networking",
                                               "Photonics", "Lasers", "Optical Components", "Transceivers",
                                               "Optical Transceivers", "Optical Engines", "Optical Packaging",
                                               "Silicon Photonics", "Interconnect", "Cables", "Connectors",
                                               "Data Center Connectivity", "SerDes", "AEC", "PCIe",
                                               "Signal Integrity", "Modulators", "Optical Connectivity",
                                               "Optical Test", "Network Test", "Photonics Semis",
                                               "Optical Manufacturing", "Interconnection"], "words": [
        r"optical", r"photonics", r"co-packaged optics", r"=CPO", r"transceivers?", r"fiber[- ]optics?",
        r"optical fiber", r"(800G|1\.6T)", r"InfiniBand", r"Ethernet", r"networking", r"network switch(es)?",
        r"interconnects?", r"subsea cables?", r"(fiber|industrial|diode) lasers?", r"laser (makers?|chips?)"]},
    {"name": "AI servers and electronics makers", "tags": ["AI Servers", "Server Systems", "EMS/ODM",
                                                           "Networking Hardware", "Data Center Hardware",
                                                           "Electronics Manufacturing", "PCB", "AI Factory Systems",
                                                           "GPU Infrastructure"], "words": [
        r"AI servers?", r"servers?", r"server racks?", r"rack-scale", r"Foxconn", r"Hon Hai", r"Quanta Computer",
        r"Wistron", r"Inventec", r"Lenovo", r"contract manufactur\w+", r"electronics manufactur\w+",
        r"(printed )?circuit boards?"]},
    {"name": "Data-center power equipment", "tags": ["Electrical", "Power Distribution", "UPS", "Switchgear",
                                                     "Data Center Equipment", "Power Semi", "Power Modules",
                                                     "AI Server Power", "Power Management", "GaN", "SiC",
                                                     "Power Electronics"], "words": [
        r"(power|electrical) transformers?", r"transformer (shortage|demand|makers?)", r"switchgear",
        r"electrical equipment", r"power equipment", r"800\s?V(DC)?", r"high-voltage", r"gallium nitride",
        r"=GaN", r"silicon carbide", r"=SiC", r"power (chips?|semiconductors?)", r"GE Vernova", r"Schneider Electric",
        r"Siemens Energy", r"=ABB"]},
    {"name": "Cooling", "tags": ["Cooling", "HVAC", "Thermal Management", "Liquid Cooling", "Building Systems"],
     "words": [r"(data[- ]cent(er|re)|liquid|immersion|server|rack|direct-to-chip) cooling",
               r"cooling (systems?|equipment|solutions?|technology|demand|capacity)", r"=HVAC", r"chillers?",
               r"thermal management", r"heat pumps?", r"air condition\w+"]},
    {"name": "Power generation and the grid", "tags": ["Grid", "Utility", "Renewables", "Power Generation",
                                                       "Fuel Cell", "Distributed Power", "Data Center Power",
                                                       "Solar", "Energy Storage", "Battery Storage", "Power"],
     "words": [
        r"(power|electric|electrical) grids?", r"the grid", r"electricity", r"power (demand|prices?|bills?|plants?|supply|shortage|crunch)",
        r"utilit(y|ies)", r"natural gas (plants?|turbines?|power|generation)", r"gas turbines?", r"=PJM", r"=ERCOT",
        r"=FERC", r"=MISO", r"=NERC", r"capacity auction", r"renewables?", r"solar", r"wind (power|farms?|energy)",
        r"offshore wind", r"(battery|energy) storage", r"fuel cells?", r"megawatts?", r"gigawatts?", r"\d+\s?GW\b",
        r"transmission lines?", r"blackouts?", r"power outages?", r"ratepayers?", r"Duke Energy", r"Dominion",
        r"Southern Co(mpany)?", r"=AEP", r"Entergy", r"=NRG", r"PG&E", r"Xcel"]},
    {"name": "Nuclear power", "tags": ["Nuclear", "SMR", "Advanced Reactor", "Uranium", "Nuclear Fuel"], "words": [
        r"nuclear", r"uranium", r"small modular reactors?", r"=SMRs?", r"reactors?", r"enrichment", r"=NRC",
        r"fusion", r"Westinghouse(?! Air)", r"TerraPower", r"Kairos"]},
    {"name": "Data-center construction", "tags": ["Data Center Construction", "Electrical Contractor", "EPC",
                                                  "Civil Construction", "Mechanical"], "words": [
        r"(data cent(er|re)|power plant|grid|transmission|electrical|industrial) (construction|contractors?|builders?)",
        r"construction (backlog|spending|boom|labor|costs)", r"=EPC", r"electricians", r"skilled (labor|workers|trades)",
        r"infrastructure (bill|spending)"]},
    {"name": "Data centers and neoclouds", "tags": ["AI Data Center", "Colocation", "Data Center REIT",
                                                   "Data Center Developer", "Neocloud", "GPU Cloud",
                                                   "AI Infrastructure", "Bitcoin Mining", "Interconnection"],
     "words": [
        r"data cent(er|re)s?", r"hyperscale", r"neoclouds?", r"GPU (cloud|rental|capacity)", r"colocation",
        r"AI (campus|campuses|factory|factories|hubs?|clusters?)", r"bitcoin min(ers?|ing)", r"crypto miners?",
        r"Lambda", r"Crusoe", r"Nscale", r"Fluidstack", r"Digital Realty", r"Vantage", r"Aligned Data"]},
    {"name": "Analog, MCU and edge chips", "tags": ["Analog", "MCU", "Embedded", "Edge AI", "SoC", "Sensors", "RF",
                                                   "Computer Vision", "Analog/RF"], "words": [
        r"analog (chips?|semiconductors?)", r"microcontrollers?", r"=MCUs?", r"(auto|automotive|car) chips?",
        r"chip shortage", r"industrial chips?", r"smartphone chips?", r"edge AI", r"on-device AI", r"AI PCs?",
        r"Nexperia", r"Infineon", r"Renesas", r"Analog Devices", r"MediaTek"]},
    {"name": "Chip design software and IP", "tags": ["EDA", "Semiconductor IP", "CPU IP"], "words": [
        r"=EDA", r"chip design (software|tools)", r"electronic design automation", r"RISC-V", r"chip IP"]},
    # ---- AI Applications ----
    {"name": "AI Applications", "watchlist": "AI Applications", "words": [
        r"generative AI", r"gen ?AI", r"AI agents?", r"agentic", r"chatbots?", r"large language models?", r"=LLMs?",
        r"AI models?", r"enterprise AI", r"AI (software|apps?|assistants?|search|adoption|startups?)", r"=SaaS",
        r"software (stocks|companies|sector|selloff)", r"cloud (computing|spending|providers?|market)",
        r"ChatGPT", r"Anthropic", r"=Claude", r"=Gemini", r"=xAI", r"Grok", r"Perplexity", r"Mistral", r"DeepSeek",
        r"=IBM", r"=SAP", r"Apple Intelligence"]},
    # ---- Areas of Interest ----
    {"name": "Elderly Care", "watchlist": "Elderly Care", "words": [
        r"senior (housing|living|care|citizens)", r"assisted living", r"skilled nursing", r"nursing (homes?|facilit\w+)",
        r"long-term care", r"medicare", r"medicaid", r"retirees?", r"retirement (communit\w+|homes?)",
        r"aging (population|americans|boomers)", r"baby boomers?", r"elderly", r"home health", r"post-acute",
        r"=CMS(?! Energy)", r"healthcare REITs?", r"Brookdale", r"Sabra", r"Ensign Group"]},
    {"name": "Looksmaxxing", "watchlist": "Looksmaxxing", "words": [
        r"GLP-1s?", r"weight[- ]loss", r"obesity (drugs?|pills?|shots?|treatments?)", r"Ozempic", r"Wegovy",
        r"Zepbound", r"Mounjaro", r"semaglutide", r"tirzepatide", r"orforglipron", r"compounded", r"gyms?",
        r"fitness", r"botox", r"neurotoxins?", r"aesthetics?", r"cosmetic", r"dermal fillers?", r"med ?spas?",
        r"skin ?care", r"beauty", r"telehealth", r"protein (shakes?|drinks?|bars?)", r"hair loss", r"testosterone",
        r"Novo Nordisk", r"Eli Lilly", r"=Lilly"]},
    {"name": "Weak Consumer", "watchlist": "Weak Consumer", "words": [
        r"buy now,? pay later", r"=BNPL", r"consumer (spending|confidence|sentiment|credit|debt|stress)",
        r"credit card (debt|delinquenc\w+|balances)", r"delinquenc\w+", r"dollar stores?",
        r"discount (retail\w*|stores?|chains?)", r"trad(e|ing)[- ]down", r"low-income (consumers|shoppers|households|americans)",
        r"household debt", r"student loans?", r"=SNAP", r"food stamps", r"retail sales", r"personal (income|spending)",
        r"affordability", r"shoppers", r"Affirm", r"Afterpay", r"Dollar General", r"Five Below", r"Ollie'?s"]},
    {"name": "Agentic Cybersecurity", "watchlist": "Agentic Cybersecurity", "words": [
        r"cyber ?attacks?", r"cyber ?security", r"ransomware", r"(data|security) breach(es)?", r"breached",
        r"hack(ed|ers?|ing)?", r"malware", r"phishing", r"zero-day", r"vulnerabilit(y|ies)", r"=CISA",
        r"identity security", r"spyware", r"=DDoS", r"Salt Typhoon", r"Check Point", r"CyberArk", r"Rapid7",
        r"Tenable", r"Qualys", r"Varonis", r"=Wiz"]},
    {"name": "Robotics", "watchlist": "Robotics", "words": [
        r"robots?", r"robotics?", r"robotaxis?", r"humanoids?", r"lidar", r"autonomous (vehicles?|driving|trucks?|cars?)",
        r"self-driving", r"driverless", r"(factory|industrial|warehouse|robotic) automation", r"machine vision",
        r"computer vision", r"physical AI", r"Optimus", r"Waymo", r"Zoox", r"Mobileye", r"Hesai", r"Luminar",
        r"Unitree", r"Figure AI", r"Boston Dynamics"]},
    {"name": "Retail Investors", "watchlist": "Retail Investors", "words": [
        r"retail (investors?|traders?|trading|brokerages?|money)", r"brokerages?", r"online brokers?",
        r"trading apps?", r"meme stocks?", r"options trading", r"zero-day options", r"=0DTE", r"prediction markets?",
        r"Kalshi", r"Polymarket", r"crypto (trading|exchanges?)", r"margin debt", r"day traders?",
        r"payment for order flow", r"tokeni[sz]ed (stocks?|equities|shares)", r"trading volumes?", r"Coinbase",
        r"Schwab", r"eToro", r"=SoFi", r"=Futu", r"moomoo"]},
]


def compile_words(words):
    patterns = []
    for word in words:
        flags = 0 if word.startswith("=") else re.IGNORECASE
        # Not inside "(...)": Zacks puts tickers there, and "(HBM)" is HudBay Minerals, not memory.
        patterns.append(re.compile(r"(?<![A-Za-z0-9(])(" + word.lstrip("=") + r")(?![A-Za-z0-9)])", flags))
    return patterns


# Junk that news_spike's rules let through, because they were written for one company's
# news: stock-move notes, picks, and investor commentary about a whole sector or an IPO.
INDUSTRY_JUNK = [
    ("stock-move note", ns.rx(
        r"\b(key|some|important) (facts|insights|information)\b", r"facts to (know|consider|note)",
        r"market returns", r"than (the )?(general |broader )?market", r"\b(while|as|despite) (the )?(broader )?market\b",
        r"why the market", r"trending stock", r"implied volatility", r"^why .{0,60}\b(stock|shares)\b",
        r"\bpre-?markets?\b", r"\bmarkets? (await|today)\b", r"big day for")),
    ("stock pick", ns.rx(
        r"new (strong )?buy stock", r"(bull|bear) of the day", r"great choice", r"momentum (anomaly )?(stocks?|picks?)",
        r"how to (find|boost)", r"set to beat", r"slated for", r"hedge funds", r"will be worth", r"not too late")),
    ("investor commentary", ns.rx(
        r"\binvestors?\b.{0,40}\b(should|need to|must)\b", r"shouldn'?t ignore", r"what it means", r"\bwinners? from\b",
        r"\bloser\b", r"\b(epic|biggest) (failure|risk)", r"\brisks? (with|to)\b", r"\bi asked\b", r"shocked me",
        r"riskier", r"wrong question", r"reality check", r"best (ai )?investment", r"\bforget\b", r"\bcatch\b",
        r"breakfast news", r"\bwhat is an?\b", r"\bhint:", r"can you invest", r"\bhere'?s (the|how|where)\b",
        r"\bthe (\d+ )?numbers? that\b", r"history (tells|says)", r"fact from fiction", r"news failure",
        r"\bwill .{0,40}\b(soar|crash|fail)\b")),
]


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


# ---------------------------------------------------------------------------------------
# Step 1: fetch
# ---------------------------------------------------------------------------------------
def fetch(env_file=None, until=None):
    key = api_key(env_file)
    DATA.mkdir(parents=True, exist_ok=True)
    end = datetime.strptime(until, "%Y-%m-%d").replace(tzinfo=timezone.utc) if until else datetime.now(timezone.utc)
    window = {"since": (end - timedelta(days=DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ"),
              "until": end.strftime("%Y-%m-%dT%H:%M:%SZ")}

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

    tickers = {t for w in watchlists for t in w["tickers"]}
    missing = sorted(t for t in tickers if t not in ns.NAMES)
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
# Step 2: analyze
# Each article goes through these checks in order:
#   1. company story: the headline names 1 or 2 of our companies, so Goalset 1 shows it on
#      that ticker's row. Everything else is an industry candidate, in one of four buckets.
#   2. junk: news_spike's junk patterns (ads, previews, ratings, opinion) and market wraps
#   3. theme: a theme word in the headline (or, as a looser second try, in Massive's keywords)
# ---------------------------------------------------------------------------------------
def theme_tickers(watchlists):
    tags, lists = {}, {}
    for watchlist in watchlists:
        lists[watchlist["name"]] = list(watchlist["tickers"])
        for ticker, ticker_tags in watchlist["tags"].items():
            tags.setdefault(ticker, set()).update(ticker_tags)
    for theme in THEMES:
        if "watchlist" in theme:
            theme["tickers"] = lists.get(theme["watchlist"], [])
        else:
            wanted = set(theme["tags"])
            theme["tickers"] = sorted(t for t, ticker_tags in tags.items() if ticker_tags & wanted)
        theme["patterns"] = compile_words(theme["words"])


def bucket(tagged, ours, named):
    if len(named) >= 3:  # Goalset 1 drops these as roundups; they can still be sector news
        return "names 3+ of our companies"
    if not tagged:
        return "untagged"
    if not ours:
        return "tagged only outside our universe"
    return "tagged with ours, none named"


def junk(title):
    beat = bool(ns.EARNINGS_BEAT.search(title))
    for reason, pattern in ns.JUNK + INDUSTRY_JUNK:
        if beat and reason in ("analyst rating", "opinion / listicle"):
            continue
        if pattern.search(title):
            return reason
    if ns.ROUNDUP.search(title):
        return "market wrap"
    if not re.search(r"[A-Za-z]{3}", title) or len(re.findall(r"[^\x00-\x7f]", title)) > len(title) / 4:
        return "not in English"
    return ""


def match_themes(text):
    hits = []
    for theme in THEMES:
        words = ns.dedupe([m.group(1) for p in theme["patterns"] for m in [p.search(text)] if m])
        if words:
            hits.append((theme, words))
    return hits


def analyze():
    watchlists = ns.load_json(DATA / "watchlists.json")
    news = ns.load_json(DATA / "news.json")
    extra = ns.load_json(DATA / "names.json") if (DATA / "names.json").exists() else {}
    theme_tickers(watchlists)
    universe = {t for w in watchlists for t in w["tickers"]}
    names = {t: ns.compile_names(ns.NAMES.get(t) or extra.get(t) or [], t) for t in universe}
    window = ns.load_json(DATA / "window.json") if (DATA / "window.json").exists() else {}
    cutoff = ns.parse_time(window.get("since")) or datetime.now(timezone.utc) - timedelta(days=DAYS)
    end = ns.parse_time(window.get("until")) or datetime.now(timezone.utc)

    articles, seen = [], set()
    for article in news:
        when = ns.parse_time(article.get("published_utc"))
        url = article.get("article_url") or ""
        ids = {article.get("id"), ns.canonical_url(url)} - {None, ""}
        if when is None or when < cutoff or when >= end or ids & seen:
            continue
        seen |= ids
        title = " ".join((article.get("title") or "").split())
        tagged = ns.dedupe([ns.ALIASES.get(t, t) for t in article.get("tickers") or []])
        ours = [t for t in tagged if t in universe]
        named = [t for t in sorted(universe) if any(p.search(title) for p in names[t])]
        row = {"when": when, "title": title, "publisher": (article.get("publisher") or {}).get("name", ""),
               "url": url, "tagged": tagged, "ours": ours, "named": named, "bucket": "", "junk": "",
               "themes": [], "matched_on": ""}
        articles.append(row)
        if 1 <= len(named) <= 2:
            row["bucket"] = "company story (Goalset 1)"
            continue
        row["bucket"] = bucket(tagged, ours, named)
        row["junk"] = junk(title)
        if row["junk"]:
            continue
        row["themes"] = match_themes(title)
        if row["themes"]:
            row["matched_on"] = "headline"
        else:
            row["themes"] = match_themes(" ; ".join(article.get("keywords") or []))
            row["matched_on"] = "keywords only" if row["themes"] else ""
    write_outputs(news, articles)


def affected(row):
    """Our tickers an article may affect: ones Massive tagged first, then the themes' tickers."""
    theme_set = ns.dedupe([t for theme, _ in row["themes"] for t in theme["tickers"]])
    return ns.dedupe([t for t in row["ours"] if t in theme_set] + theme_set)


def write_outputs(news, articles):
    OUT.mkdir(parents=True, exist_ok=True)
    candidates = [a for a in articles if a["bucket"] != "company story (Goalset 1)"]
    clean = [a for a in candidates if not a["junk"]]
    headline = [a for a in clean if a["matched_on"] == "headline"]
    keywords_only = [a for a in clean if a["matched_on"] == "keywords only"]
    unmatched = [a for a in clean if not a["themes"]]
    whens = [a["when"] for a in articles]
    days = max((max(whens) - min(whens)).total_seconds() / 86400, 1) if whens else 1

    def theme_cell(row):
        return "; ".join("%s (%s)" % (theme["name"], ", ".join(words)) for theme, words in row["themes"])

    with open(OUT / "matches.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["time", "matched_on", "bucket", "publisher", "headline", "themes (words)",
                    "our tickers tagged", "tickers it may affect", "url"])
        for a in sorted(headline + keywords_only, key=lambda a: a["when"], reverse=True):
            w.writerow([ns.et(a["when"]), a["matched_on"], a["bucket"], a["publisher"], a["title"], theme_cell(a),
                        " ".join(a["ours"]), len(affected(a)), a["url"]])

    # A fixed random sample to read by hand. Fill in the two y/n columns, then run "score".
    # A sample that already has answers is kept, so rule changes can be scored against it.
    rng = random.Random(7)
    if has_answers(OUT / "handcheck.csv"):
        print("Kept the answered %s; delete it to draw a new sample." % (OUT / "handcheck.csv"))
    else:
        with open(OUT / "handcheck.csv", "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(["id", "publisher", "headline", "themes (words)", "time", "url",
                        "industry news? (y/n)", "right theme? (y/n)", "notes"])
            for i, a in enumerate(rng.sample(headline, min(HANDCHECK_SIZE, len(headline))), 1):
                w.writerow([i, a["publisher"], a["title"], theme_cell(a), ns.et(a["when"]), a["url"], "", "", ""])
    with open(OUT / "unmatched_sample.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["publisher", "headline", "bucket", "time", "url", "missed industry news? (y/n)"])
        for a in rng.sample(unmatched, min(30, len(unmatched))):
            w.writerow([a["publisher"], a["title"], a["bucket"], ns.et(a["when"]), a["url"], ""])

    # ---- summary ----
    def pct(a, b):
        return "%d%%" % round(100.0 * a / b) if b else "0%"

    def cell(text):
        return (text or "").replace("|", "/")

    window = "%s to %s" % (ns.et(min(whens)), ns.et(max(whens))) if whens else "no articles"
    lines = [
        "# Goalset 3 spike: industry news matched to our themes (rules only)", "",
        "Window: %s (%.1f days). Source: Massive news (%d articles downloaded)." % (window, days, len(news)), "",
        "| Step | Articles | Per day |", "| --- | --- | --- |",
        "| Unique articles in the window | %d | %.0f |" % (len(articles), len(articles) / days),
        "| Company stories (headline names 1-2 of ours), left to Goalset 1 | %d | %.0f |"
        % (len(articles) - len(candidates), (len(articles) - len(candidates)) / days),
        "| Industry candidates (everything else) | %d | %.0f |" % (len(candidates), len(candidates) / days),
        "| ...after dropping junk | %d | %.0f |" % (len(clean), len(clean) / days),
        "| ...matched to a theme by headline | %d | %.1f |" % (len(headline), len(headline) / days),
        "| ...matched only by Massive's keywords field | %d | %.1f |" % (len(keywords_only), len(keywords_only) / days),
        "", "## Industry candidates by bucket", "",
        "| Bucket | Candidates | After junk | Headline match |", "| --- | --- | --- | --- |",
    ]
    for name, count in Counter(a["bucket"] for a in candidates).most_common():
        lines.append("| %s | %d | %d | %d |" % (name, count, sum(1 for a in clean if a["bucket"] == name),
                                                 sum(1 for a in headline if a["bucket"] == name)))
    if not any(a["bucket"] == "untagged" for a in candidates):  # worth seeing: Massive tags every article
        lines.append("| untagged | 0 | 0 | 0 |")
    lines += ["", "## Why candidates were dropped", "", "| Reason | Articles |", "| --- | --- |"]
    for reason, count in Counter(a["junk"] for a in candidates if a["junk"]).most_common():
        lines.append("| %s | %d |" % (reason, count))
    lines += ["", "## Publishers", "", "| Publisher | Candidates | Headline matches |", "| --- | --- | --- |"]
    for publisher, count in Counter(a["publisher"] for a in candidates).most_common():
        lines.append("| %s | %d | %d |" % (publisher, count, sum(1 for a in headline if a["publisher"] == publisher)))
    lines += ["", "## Headline matches per theme", "",
              "| Theme | Our tickers | Matches | Top words |", "| --- | --- | --- | --- |"]
    for theme in THEMES:
        mine = [words for a in headline for t, words in a["themes"] if t is theme]
        top = Counter(word.lower() for words in mine for word in words).most_common(4)
        lines.append("| %s | %d | %d | %s |" % (theme["name"], len(theme["tickers"]), len(mine),
                                              ", ".join("%s %d" % kv for kv in top)))
    multi = sum(1 for a in headline if len(a["themes"]) > 1)
    lines += ["", "Headline matches touching 2+ themes: %d of %d. Median tickers a match may affect: %d."
              % (multi, len(headline), sorted(len(affected(a)) for a in headline)[len(headline) // 2] if headline else 0)]
    lines += ["", "## Newest headline matches", "", "| Time | Publisher | Headline | Themes |", "| --- | --- | --- | --- |"]
    for a in sorted(headline, key=lambda a: a["when"], reverse=True)[:25]:
        lines.append("| %s | %s | %s | %s |" % (ns.et(a["when"]), a["publisher"], cell(a["title"]),
                                              cell(", ".join(t["name"] for t, _ in a["themes"]))))
    (OUT / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print("\n%d articles; %d industry candidates; %d after junk; %d matched by headline (%.1f a day), "
          "%d more by keywords only." % (len(articles), len(candidates), len(clean), len(headline),
                                         len(headline) / days, len(keywords_only)))
    print("Wrote: %s, %s, %s, %s" % (OUT / "summary.md", OUT / "matches.csv", OUT / "handcheck.csv",
                                     OUT / "unmatched_sample.csv"))


# ---------------------------------------------------------------------------------------
# Step 3: score the hand-check
# ---------------------------------------------------------------------------------------
def has_answers(path):
    if not path.exists():
        return False
    with open(path, newline="", encoding="utf-8-sig") as f:
        return any(r.get("industry news? (y/n)", "").strip() for r in csv.DictReader(f))


def score():
    with open(OUT / "handcheck.csv", newline="", encoding="utf-8-sig") as f:
        rows = [r for r in csv.DictReader(f) if r["industry news? (y/n)"].strip()]
    if not rows:
        raise SystemExit("Fill in the y/n columns of %s first." % (OUT / "handcheck.csv"))
    theme_tickers(ns.load_json(DATA / "watchlists.json"))

    def yes(row, column):
        return row[column].strip().lower().startswith("y")

    def report(label, checked):
        right = [r for r in checked if yes(r, "industry news? (y/n)") and yes(r, "right theme? (y/n)")]
        news = [r for r in checked if yes(r, "industry news? (y/n)")]
        print("%s: %d checked, %d industry news, %d with the right theme -> precision %d%%"
              % (label, len(checked), len(news), len(right), round(100.0 * len(right) / len(checked)) if checked else 0))
        return right

    # The sample was drawn with the rules as they were then; re-run today's rules on the same headlines.
    right = report("Rules when the sample was drawn", rows)
    kept = [r for r in rows if not junk(r["headline"]) and match_themes(r["headline"])]
    kept_right = report("Today's rules, same headlines  ", kept)
    lost = [r["headline"] for r in right if r not in kept_right]
    if lost:
        print("  good matches today's rules drop: " + " | ".join(lost))

    by_theme, good = Counter(), Counter()
    for r in rows:
        for name in re.findall(r"(?:^|; )([^;(]+?) \(", r["themes (words)"]):
            by_theme[name] += 1
            good[name] += r in right
    print("\n  Theme (at sampling)                     checked  correct")
    for name, count in by_theme.most_common():
        print("  %-40s %5d  %5d" % (name, count, good[name]))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", nargs="?", default="all", choices=["fetch", "analyze", "score", "all"])
    parser.add_argument("--env-file", help="a .env file holding MASSIVE_API_KEY or POLYGON_API_KEY")
    parser.add_argument("--until", help="fetch the %d days before this date (YYYY-MM-DD) instead of the last %d"
                        % (DAYS, DAYS))
    parser.add_argument("--dir", help="folder for data/ and out/ (default: next to this script), "
                        "e.g. a second window to test the rules on")
    args = parser.parse_args()
    if args.dir:
        DATA, OUT = Path(args.dir) / "data", Path(args.dir) / "out"
    if args.command in ("fetch", "all"):
        fetch(args.env_file, args.until)
    if args.command in ("analyze", "all"):
        analyze()
    if args.command == "score":
        score()
