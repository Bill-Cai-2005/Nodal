// Relevance rules for "latest news per ticker", ported from tools/news-spike/news_spike.py.
// Keep the two in step: same names, same patterns, same order. Pattern strings are copied
// verbatim from the Python (String.raw keeps the backslashes as written there).
//
// One engine difference to know about: in Python, \b, \w and \d also treat non-ASCII letters
// and digits (é, ü, ...) as word characters; in JavaScript they are ASCII-only. Headlines only
// differ when such a character sits right next to a keyword.

// Share classes that should count as the ticker we list.
export const ALIASES: Record<string, string> = { GOOGL: "GOOG", GOOGM: "GOOG", GOOGN: "GOOG" };

// Press-release wires: a release headline starts with the company that issued it, so for
// these we only trust a ticker tag when that company's name is in the headline.
export const WIRES = new Set(["GlobeNewswire Inc.", "Business Wire", "PR Newswire", "Accesswire", "ACCESSWIRE"]);

// Names we look for in headlines. Case-insensitive, except names starting with "=" which
// must match exactly (for names that are also ordinary words, like Arm or Carrier).
export const NAMES: Record<string, string[]> = {
  // AI Buildout
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
  // AI Applications
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
  // Areas of Interest
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
};

// ---------------------------------------------------------------------------------------
// The rules. Each article-ticker pair goes through these checks in order:
//   1. junk patterns (law-firm ads, event notices, insider trades, ratings, opinion)
//   2. test 1 "about the company": its name is in the headline (or it is the only ticker)
//   3. tests 2+3 "something material happened": the headline names one of the event types
// ---------------------------------------------------------------------------------------
const rx = (...parts: string[]) => new RegExp(parts.join("|"), "i");

// "X beats estimates" is real earnings news, so it is exempt from the rating/opinion rules.
export const EARNINGS_BEAT = rx(String.raw`\b(beats?|tops?|miss(es)?|exceeds?|surpass(es)?|falls? short of|lags?)\b`
  + String.raw`.{0,40}\b(estimates|expectations|forecasts?|views|consensus)\b`);

export const JUNK: [string, RegExp][] = [
  ["law-firm ad", rx(
    String.raw`class action`, String.raw`lead plaintiff`, String.raw`securities (fraud|litigation|investigation)`,
    String.raw`\b(shareholder|investor)s? (alert|news|reminder|notice)\b`,
    String.raw`\b(investors|shareholders) (who|with) (lost|suffered|substantial)`,
    String.raw`suffered (substantial )?losses`, String.raw`lost money`, String.raw`encourag\w* .{0,60}investors`,
    String.raw`\binvestors? (are )?(encouraged|urged|reminded)`, String.raw`deadline alert`, String.raw`filing deadline`,
    String.raw`law firm`, String.raw`important notice to .{0,40}shareholders`, String.raw`long-term shareholders`,
    String.raw`\b(rosen|pomerantz|bronstein|glancy|kirby mcinerney|levi & korsinsky|faruqi`
    + String.raw`|bragar|robbins geller|hagens berman|portnoy|schall|kessler topaz|bernstein liebhard`
    + String.raw`|block & leviton)\b`)],
  ["market-research ad", rx(
    String.raw`market (size|share|report|research)`, String.raw`global forecast`, String.raw`trend analysis`,
    String.raw`featuring profiles`, String.raw`research and markets`, String.raw`\bcagr\b`, String.raw`industry (report|analysis)`)],
  ["event notice / preview", rx(
    String.raw`\bexpected to (beat|grow|report|post|rise|decline|fall)\b`, String.raw`what to know ahead`,
    String.raw`ahead of next week`, String.raw`\bwill\b.{0,50}\bbeat\b`, String.raw`\bpoised to beat\b`, String.raw`\bunlocking q[1-4]\b`,
    String.raw`exploring wall street estimates`, String.raw`\bearnings (preview|test)\b`,
    String.raw`\b(announces|sets|schedules|confirms)\b.{0,60}\b(date|time|timing)\b`,
    String.raw`\bto (report|announce|release|host|hold|present|participate|webcast)\b`,
    String.raw`conference call`, String.raw`fireside chat`, String.raw`\b(investor|analyst|r&d) day\b`, String.raw`earnings preview`,
    String.raw`what to expect`, String.raw`gears up`, String.raw`ahead of (its )?(q[1-4]|earnings|results)`,
    String.raw`earnings on deck`)],
  ["holdings / insider trade", rx(
    String.raw`\b(director|executive|ceo|cfo|insider|fund|capital|management|advisors|llc|wealth|trust)\b`
    + String.raw`.{0,40}\b(buys|sells|purchases|trims|adds|boosts|cuts|acquires|dumps|unloads)\b`
    + String.raw`.{0,40}\b(shares|stake|position|stock)\b`,
    String.raw`\b13f\b`, String.raw`insider (buying|selling|buys|sells)`, String.raw`\bshares (sold|bought|acquired) by\b`)],
  ["analyst rating", rx(
    String.raw`upgrade`, String.raw`downgrade`, String.raw`price target`, String.raw`\bPT\b`, String.raw`\brating\b`, String.raw`zacks rank`,
    String.raw`strong (buy|sell)`, String.raw`outperform`, String.raw`underperform`, String.raw`overweight`, String.raw`underweight`,
    String.raw`initiat\w* (coverage|at)`, String.raw`reiterat`, String.raw`\bmaintains\b`, String.raw`\banalysts?\b`,
    String.raw`estimates? (signal|revision|rise|move|cut)`, String.raw`earnings estimate`, String.raw`\bconsensus\b`)],
  ["opinion / listicle", rx(
    String.raw`\?\s*$`, String.raw`better buy`, String.raw`should you`, String.raw`is it (time|too late)`, String.raw`\bbuy (it )?now\b`,
    String.raw`stocks? to (buy|own|hold|watch|avoid)`, String.raw`prediction`,
    String.raw`could (be worth|make you|soar|double|triple)`, String.raw`\$[\d,.]+[kKmM]? invested`,
    String.raw`invest(ed|ing)? \$[\d,.]+`, String.raw`millionaire`, String.raw`forever`, String.raw`no-brainer`, String.raw`smartest`,
    String.raw`\btop \d+\b`, String.raw`\bbest\b.{0,20}\bstocks?\b`, String.raw`\b\d+ (reasons|things|stocks|ways)\b`,
    String.raw`buy, sell,? or hold`, String.raw`\bvs\b\.?`, String.raw`\bversus\b`, String.raw`\bbubble\b`, String.raw`here'?s why`,
    String.raw`here'?s what`, String.raw`what (you|investors) (should|need to) know`, String.raw`reasons to (hold|buy|sell)`,
    String.raw`worth buying`, String.raw`caution warranted`, String.raw`\bsafer\b`, String.raw`time to buy`, String.raw`undervalued`,
    String.raw`overvalued`, String.raw`poised to`, String.raw`billionaire`, String.raw`hidden gem`, String.raw`game.?changer`,
    String.raw`\bmy (top|favorite|largest|biggest)\b`, String.raw`\bi('m|'d| am| would| just| bought| own)\b`,
    String.raw`\bwall street (thinks|says|expects|is)\b`, String.raw`\b(bull|bear) case\b`, String.raw`\bsleeper\b`,
    String.raw`\bzacks\b`, String.raw`\bthese \d+\b`, String.raw`\bbet on\b`, String.raw`industry outlook`, String.raw`counting on`,
    String.raw`\bwhy\b.{0,60}\b(matters?|looks|is|are|could|should|will|remains)\b`, String.raw`the reason is`,
    String.raw`history says`, String.raw`\betfs?\b`, String.raw`\battractive\b`, String.raw`\btakeaways?\b`,
    String.raw`\b\d+ [\w-]+ stocks\b`, String.raw`\bbuy-rated\b`, String.raw`\bone clear winner\b`)],
];

export const ROUNDUP = rx(
  String.raw`stock market today`, String.raw`\bstocks? making the biggest moves\b`, String.raw`\b(biggest|top) (stock )?movers\b`,
  String.raw`\bmarket (wrap|recap|update)\b`, String.raw`\bpre-?market\b`, String.raw`\bafter-?hours\b`, String.raw`\bweek ahead\b`,
  String.raw`\b(dow|nasdaq|s&p 500|s&p|stocks|futures|wall street)\b.{0,12}\b(gains?|jumps?|rises?|falls?`
  + String.raw`|drops?|slips?|sinks?|rall(y|ies)|tumbles?|climbs?|edges?|closes?|opens?)\b`);

export const EVENTS: [string, RegExp][] = [
  ["Earnings / guidance", rx(
    String.raw`\bearnings\b`, String.raw`\bresults\b`, String.raw`\brevenue\b`, String.raw`\bsales\b`, String.raw`\bprofit`, String.raw`\bnet (income|loss)\b`,
    String.raw`\beps\b`, String.raw`\bguidance\b`, String.raw`\boutlook\b`, String.raw`\bforecast`, String.raw`\bq[1-4]\b`, String.raw`\bquarter`,
    String.raw`\bfiscal\b`, String.raw`\bbeats?\b`, String.raw`\bmiss(es)?\b`, String.raw`pre-?announce`)],
  ["Deal / contract / M&A", rx(
    String.raw`\bacquir`, String.raw`\bacquisition`, String.raw`\bmerger\b`, String.raw`\bmerge`, String.raw`\bto buy\b`, String.raw`\bbuyout\b`,
    String.raw`\btakeover\b`, String.raw`\bdivest`, String.raw`spin-?off`, String.raw`\bspins? off\b`, String.raw`\bdeals?\b`, String.raw`\bagreement\b`,
    String.raw`\bpartnership\b`, String.raw`\bpartners? with\b`, String.raw`\bteams? up\b`, String.raw`\bcollaborat`, String.raw`\bcontract`,
    String.raw`\bawarded\b`, String.raw`\bwins?\b`, String.raw`\border(s)? (from|for|worth)\b`, String.raw`\bjoint venture\b`,
    String.raw`\balliance\b`, String.raw`\bselect(s|ed)\b`, String.raw`\bsigns?\b`, String.raw`\bbacklog\b`, String.raw`\bpact\b`,
    String.raw`\binvest(s|ment)? \$`, String.raw`\bstake\b`)],
  ["Capital / buyback / dividend", rx(
    String.raw`\boffering\b`, String.raw`private placement`, String.raw`\bconvertible\b`, String.raw`\bnotes\b`, String.raw`\bdebt\b`,
    String.raw`\braises? \$`, String.raw`\bfinancing\b`, String.raw`credit facility`, String.raw`\bbuyback\b`, String.raw`\brepurchase`,
    String.raw`\bdividend\b`, String.raw`stock split`, String.raw`\bipo\b`, String.raw`goes public`, String.raw`\bdelist`)],
  ["Product / capacity", rx(
    String.raw`\blaunch`, String.raw`\bunveil`, String.raw`\bintroduc`, String.raw`\bdebut`, String.raw`\brolls? out\b`, String.raw`\breleases?\b`,
    String.raw`now available`, String.raw`general availability`, String.raw`\bships?\b`, String.raw`\bshipping\b`,
    String.raw`begins (production|shipping|operations)`, String.raw`\bstarts? production\b`, String.raw`breaks ground`,
    String.raw`groundbreaking`, String.raw`\bopens?\b`, String.raw`\bexpands?\b`, String.raw`\bexpansion\b`,
    String.raw`new (facility|fab|plant|data cent(er|re)|campus|factory|site)`, String.raw`\bcapacity\b`,
    String.raw`\bmegawatts?\b`, String.raw`\b\d+\s?(mw|gw)\b`, String.raw`\bgigawatts?\b`, String.raw`power purchase`, String.raw`\bppa\b`)],
  ["Leadership", rx(
    String.raw`\bceo\b`, String.raw`\bcfo\b`, String.raw`\bcoo\b`, String.raw`\bcto\b`, String.raw`chief (executive|financial|operating|technology)`,
    String.raw`\bchair(man|woman|person)?\b`, String.raw`\bboard\b`, String.raw`\bappoint`,
    String.raw`\bnames\b.{0,40}\b(chief|president|ceo|cfo|head|director|chair)`, String.raw`\bhires?\b`,
    String.raw`\bresign`, String.raw`steps? down`, String.raw`\bretire`, String.raw`succession`, String.raw`\bdeparts?\b`)],
  ["Legal / regulatory", rx(
    String.raw`\bexport`, String.raw`\bbans?\b`, String.raw`\bbanned\b`, String.raw`\brestrict`, String.raw`\bsanction`, String.raw`\btariff`,
    String.raw`antitrust`, String.raw`\blawsuit`, String.raw`\bsues?\b`, String.raw`\bsued\b`, String.raw`\bsettle`, String.raw`\bprobe\b`,
    String.raw`\binvestigat`, String.raw`subpoena`, String.raw`\bsec\b`, String.raw`\bdoj\b`, String.raw`\bftc\b`, String.raw`\bfcc\b`, String.raw`\bfda\b`,
    String.raw`\bregulat`, String.raw`\bapprov`, String.raw`\bclearance\b`, String.raw`\bfined\b`, String.raw`\bfines\b`,
    String.raw`\bpenalt`, String.raw`\bcourt\b`, String.raw`\bjudge\b`, String.raw`\bruling\b`, String.raw`\bverdict\b`, String.raw`\bpatent`,
    String.raw`\brecall`, String.raw`\blicens`, String.raw`\bpentagon\b`, String.raw`department of`, String.raw`chips act`, String.raw`\bgrant\b`)],
];

export const PRICE_MOVE = rx(
  String.raw`\b(soar|surge|jump|rall(y|ies)|climb|gain|pop|spike|sink|sank|plunge|plummet|tumble|drop|fall`
  + String.raw`|fell|slide|slid|slump|dive|crater|skyrocket|rocket|rise|rose|slip)\w*\b`,
  String.raw`\bwhy .{0,40}\b(stock|shares)\b`);

export const COMMON_WORD_TICKERS = new Set(["NOW", "NET", "PATH", "TEAM", "FIX", "MOD", "WELL", "SKIN", "BULL", "HOOD",
  "SAIL", "FIG", "BAND", "SHOP", "ARM", "LIN", "WIX", "POET", "FORM", "ONTO"]);

// Escapes the same characters as Python's re.escape, so compiled name patterns come out
// identical to news_spike.py's.
const escapeLikePython = (text: string) => text.replace(/[()[\]{}?*+\-|^$\\.&~# \t\n\r\v\f]/g, "\\$&");

export function compileNames(names: string[], ticker = ""): RegExp[] {
  const patterns: RegExp[] = [];
  if (ticker) { // Zacks-style headlines often use the ticker itself, e.g. "SNDK Q1 Earnings..."
    patterns.push(new RegExp(String.raw`\(` + escapeLikePython(ticker) + String.raw`\)`));
    if (ticker.length >= 3 && !COMMON_WORD_TICKERS.has(ticker)) {
      patterns.push(new RegExp(String.raw`(?<![A-Za-z0-9])` + escapeLikePython(ticker) + String.raw`(?![A-Za-z0-9])`));
    }
  }
  for (const rawName of names) {
    const flags = rawName.startsWith("=") ? "" : "i";
    const name = rawName.replace(/^=+/, "");
    patterns.push(new RegExp(String.raw`(?<![A-Za-z0-9])` + escapeLikePython(name) + String.raw`(?![A-Za-z0-9])`, flags));
  }
  return patterns;
}

export type Verdict = "show" | "drop";

/** Returns [verdict, why_dropped, event_type] for one article-ticker pair. */
export function classify(
  title: string,
  publisher: string,
  tagged: string[],
  ticker: string,
  namePatterns: RegExp[],
  namedCount = 0,
): [Verdict, string, string] {
  const hasName = namePatterns.some((p) => p.test(title));
  const beat = EARNINGS_BEAT.test(title);

  for (const [reason, pattern] of JUNK) {
    if (beat && (reason === "analyst rating" || reason === "opinion / listicle")) continue;
    if (pattern.test(title)) return ["drop", reason, ""];
  }

  // Test 1: is the article about this company?
  if (namedCount >= 3) { // a headline naming 3+ of our companies is commentary, not one company's news
    return ["drop", "market roundup", ""];
  }
  if (!hasName) {
    if (ROUNDUP.test(title) || tagged.length >= 5) return ["drop", "market roundup", ""];
    if (!(tagged.length === 1 && !WIRES.has(publisher))) return ["drop", "only mentions the company", ""];
  }

  // Tests 2 + 3: did something material happen?
  for (const [event, pattern] of EVENTS) {
    if (pattern.test(title)) return ["show", "", event];
  }
  if (PRICE_MOVE.test(title)) return ["drop", "price move, no cause named", ""];
  return ["drop", "no material event", ""];
}

// Python's str.isspace() characters, so normalizeTitle splits exactly where str.split() does.
const PY_WHITESPACE = /[\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/;

/** Collapses runs of whitespace like news_spike.py's `" ".join(title.split())`. */
export const normalizeTitle = (title: string) => title.split(PY_WHITESPACE).filter(Boolean).join(" ");

/** Removes repeats, keeping first-seen order (news_spike.py's dedupe). */
export const dedupe = <T>(items: T[]) => [...new Set(items)];
