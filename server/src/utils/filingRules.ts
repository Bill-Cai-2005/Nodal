// SEC filing rules for "latest news per ticker", ported from tools/edgar-spike/edgar_spike.py
// (branch edgar-spike). Keep the two in step: same item table, same patterns, same order.
// Pattern strings are copied verbatim from the Python; the \b / \w engine difference noted in
// newsRules.ts applies here too.
import { classify, normalizeTitle, rx } from "./newsRules.js";

// ---------------------------------------------------------------------------------------
// 8-K item numbers: what kind of event the filing reports, in plain words, and which
// news event type it counts as ("Warning sign" is for events the news rules have no type for).
//   null   routine paperwork: never shown on its own.
//   PRESS  7.01 "Regulation FD" and 8.01 "Other events" are catch-alls that usually just
//          attach a press release (a dividend, a product, an investor deck...). The number
//          alone can't tell, so these are shown only when the press release's headline
//          passes the same rules as a news headline.
// 9.01 only lists the attached exhibits, so it is never news by itself.
// ---------------------------------------------------------------------------------------
export const PRESS = "press release";
export const ITEMS: Record<string, [string, string | null]> = {
  "1.01": ["signed a major agreement", "Deal / contract / M&A"],
  "1.02": ["ended a major agreement", "Deal / contract / M&A"],
  "1.03": ["bankruptcy or receivership", "Warning sign"],
  "1.04": ["mine safety violation", null],
  "1.05": ["cybersecurity incident", "Warning sign"],
  "2.01": ["completed an acquisition or sale", "Deal / contract / M&A"],
  "2.02": ["quarterly results", "Earnings / guidance"],
  "2.03": ["took on new debt", "Capital / buyback / dividend"],
  "2.04": ["debt repayment sped up", "Warning sign"],
  "2.05": ["restructuring or layoffs", "Warning sign"],
  "2.06": ["wrote down an asset", "Warning sign"],
  "3.01": ["delisting notice or exchange move", "Warning sign"],
  "3.02": ["sold new shares privately", "Capital / buyback / dividend"],
  "3.03": ["changed shareholder rights", "Capital / buyback / dividend"],
  "4.01": ["changed auditor", "Warning sign"],
  "4.02": ["past results can't be relied on", "Warning sign"],
  "5.01": ["change in control", "Deal / contract / M&A"],
  "5.02": ["executive or board change", "Leadership"],
  "5.03": ["amended bylaws or fiscal year", null],
  "5.04": ["paused employee-plan trading", null],
  "5.05": ["changed code of ethics", null],
  "5.06": ["changed shell company status", null],
  "5.07": ["shareholder vote results", null],
  "5.08": ["shareholder nomination dates", null],
  "7.01": ["shared information with investors", PRESS],
  "8.01": ["other events", PRESS],
  "9.01": ["exhibits attached", null],
};

const itemType = (item: string) => (Object.hasOwn(ITEMS, item) ? ITEMS[item][1] : null);

/** The 8-K items that are news by their number alone (not routine, not 7.01 / 8.01). */
export const newsworthy = (items: string[]) => items.filter((i) => ![null, PRESS].includes(itemType(i)));

/** Does an 8-K carry 7.01 or 8.01, so its press release headline decides? */
export const hasPressItem = (items: string[]) => items.some((i) => itemType(i) === PRESS);

/** Returns [event_type, why_dropped] for one filing ("" event = not shown). */
export function label(
  form: string,
  items: string[],
  headline: string,
  ticker: string,
  ownPatterns: RegExp[],
): [string, string] {
  if (form.startsWith("8-K")) {
    const newsItems = newsworthy(items);
    if (newsItems.length) return [ITEMS[newsItems[0]][1] as string, ""];
    if (!hasPressItem(items)) return ["", "routine items only"];
  }
  // A 6-K, or an 8-K with only 7.01 / 8.01: only the press release can say what happened.
  if (!headline) return ["", "no press release headline found"];
  const [verdict, why, event] = classify(headline, "SEC filing", [ticker], ticker, ownPatterns);
  return verdict === "show" ? [event, ""] : ["", "headline dropped: " + why];
}

// ---------------------------------------------------------------------------------------
// Reading a filing: its list of documents and the press release headline
// ---------------------------------------------------------------------------------------
const INLINE_TAGS = String.raw`</?(span|font|b|i|u|a|strong|em|sup|sub|small|big)\b[^>]*>`;
const NOT_A_HEADLINE = rx(
  // exhibit labels, contact blocks, addresses, datelines and bullets above or around the headline
  String.raw`^ex(hibit)?\.?\s*\d`, String.raw`\bexhibit 99`, String.raw`^(press|news|media) release\b`, String.raw`for immediate release`,
  String.raw`^(contacts?|for|from|investors?|media|source)\s*:`, String.raw`\b(investor|media|public) relations\b`,
  String.raw`@`, String.raw`\(\d{3}\)\s*\d{3}`, String.raw`\b\d{3}[-.]\d{3}[-.]\d{4}\b`, String.raw`\b[A-Z]{2} \d{5}\b`, String.raw`filed by`,
  String.raw`^\d+ [\w .]*\b(blvd|boulevard|street|avenue|road|freeway|parkway|drive|plaza)\b`, String.raw`\bsuite \d`,
  String.raw`^[\w.'-]+( [\w.'-]+){1,2},\s*(cfa,?\s*)?(chief|vice|senior|executive|director|head|president`
  + String.raw`|treasurer|corporate|general|managing|manager|svp|evp|vp)\b`, // "Jane Doe, Chief Financial Officer"
  String.raw`^(\w+,\s*)?\w+\.?\s+\d{1,2},?\s+\d{4}$`, String.raw`\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.? \d{1,2},$`,
  String.raw`\b(officer|counsel|relations|communications)$`, String.raw`^\(`, String.raw`^[•▪●◦·*–-]`, String.raw`^[“\"]`, String.raw`(\b\w ){5,}`,
  String.raw`^dear\b`,
  String.raw`^(\S+ ){0,4}(inc|incorporated|corp|corporation|ltd|limited|plc|n\.?v|s\.?a|ag|llc|holdings?|group)\.?$`,
  String.raw`\band subsidiaries$`,
  // the cover page and signature block of a 6-K
  String.raw`securities and exchange commission`, String.raw`washington,? d\.?\s?c\.?`, String.raw`\bform (6-k|8-k|20-f|40-f)\b`,
  String.raw`foreign private issuer`, String.raw`commission file`, String.raw`check mark`, String.raw`^pursuant to`, String.raw`duly (caused|authorized)`,
  String.raw`for the month of`, String.raw`(name|address) of (registrant|principal)`, String.raw`^(by|name|title|date)\s*:`,
  String.raw`^page \d`, String.raw`table of contents`);
const DATELINE = new RegExp( // "SANTA CLARA, Calif., Oct. 28, 2026 (GLOBE NEWSWIRE) -- Acme today..."
  String.raw`^[A-Z0-9][\w .,'&()/–—-]{0,100}?\d{4}\)?\s*(\([^)]*\))?\s*(/[^/]{0,60}/)?\s*(--|—|–|-)\s*(.{20,})`);
const SPLIT_DATELINE = new RegExp(String.raw`^[A-Z][A-Z .'-]+,.{0,40}\b\d{4}\s*[–—-]?$`); // "BEVERLY, Mass., October 27, 2026"
const WRAPPED = new RegExp(String.raw`^(a|an|and|as|at|by|for|from|in|into|of|on|or|the|to|with)\b`); // case-sensitive
const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "its", "of", "on", "or", "the",
  "to", "with"]);
const DANGLING = new Set([...SMALL_WORDS, "provide", "provides", "providing", "announce", "announces"]);
const ABBREVIATIONS = new Set(["inc", "corp", "co", "ltd", "llc", "plc", "mr", "ms", "mrs", "dr", "jr", "sr", "st", "no", "vs",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "calif",
  "mass", "fla", "ariz", "wash", "ore", "colo", "conn", "minn", "approx"]);

// Python's str.split() and str.splitlines(), so word counts and lines come out the same.
const words = (text: string) => normalizeTitle(text).split(" ").filter(Boolean);
const PY_LINE_BREAKS = /\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/;
const count = (text: string, char: string) => text.split(char).length - 1;
const isLower = (c: string) => c !== c.toUpperCase() && c === c.toLowerCase();
const isUpper = (c: string) => c !== c.toLowerCase() && c === c.toUpperCase();
// Python's p.match(): the pattern must match at the very start.
const matchesAtStart = (pattern: RegExp, text: string) => new RegExp(pattern.source, pattern.flags + "y").test(text);

// Python's html.unescape for the character references SEC documents use: numeric ones, and
// the named ones found in a scan of the spike's cached filings plus their usual neighbours.
const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", ldquo: "“", rdquo: "”", lsquo: "‘",
  rsquo: "’", sbquo: "‚", bdquo: "„", ndash: "–", mdash: "—", middot: "·", bull: "•", hellip: "…",
  reg: "®", copy: "©", trade: "™", deg: "°", divide: "÷", times: "×", plusmn: "±", sect: "§", para: "¶",
  cent: "¢", pound: "£", euro: "€", yen: "¥", frac12: "½", frac14: "¼", frac34: "¾", shy: "\u00ad",
  ensp: "\u2002", emsp: "\u2003", thinsp: "\u2009", eacute: "é", egrave: "è", aacute: "á", agrave: "à",
  iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", ccedil: "ç", auml: "ä", ouml: "ö", uuml: "ü",
  Eacute: "É", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
};
// Names html.unescape also accepts without the closing semicolon (HTML's legacy list).
const LEGACY = new Set(["amp", "lt", "gt", "quot", "nbsp", "reg", "copy", "deg", "divide", "times", "plusmn",
  "sect", "para", "cent", "pound", "yen", "frac12", "frac14", "frac34", "shy", "middot", "eacute", "egrave",
  "aacute", "agrave", "iacute", "oacute", "uacute", "ntilde", "ccedil", "auml", "ouml", "uuml", "Eacute",
  "Auml", "Ouml", "Uuml", "szlig"]);
// html.unescape maps these invalid code points the way browsers do (Windows-1252).
const WINDOWS_1252: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021,
  0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018,
  0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc,
  0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

export function unescapeHtml(text: string) {
  return text.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*)(;?)/g, (whole, ref: string, semi: string) => {
    if (ref.startsWith("#")) {
      const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      if (Object.hasOwn(WINDOWS_1252, code)) return String.fromCodePoint(WINDOWS_1252[code]);
      if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "\ufffd";
      return String.fromCodePoint(code);
    }
    return Object.hasOwn(NAMED, ref) && (semi || LEGACY.has(ref)) ? NAMED[ref] : whole;
  });
}

/** The visible text of an HTML document, one line per paragraph or table row. */
export function toLines(markup: string) {
  markup = markup.replace(/^\s*<DOCUMENT>.*?<TEXT>/gis, ""); // the SEC's own header: type, filename...
  markup = markup.replace(/<(script|style|title|ix:header)\b.*?<\/\1>/gis, " ");
  markup = markup.replace(new RegExp(INLINE_TAGS, "gi"), "");
  markup = markup.replace(/<\/(p|div|h[1-6]|tr|li|table|title)>|<br\s*\/?>/gi, "\n");
  const text = unescapeHtml(markup.replace(/<[^>]+>/g, " "));
  return text.split(PY_LINE_BREAKS).map(normalizeTitle).filter(Boolean);
}

export type FilingDocument = { type: string; description: string; url: string };

/** The rows of a filing's index page: [{type, description, url}]. */
export function documents(indexMarkup: string | null): FilingDocument[] {
  const docs: FilingDocument[] = [];
  for (const [, row] of (indexMarkup ?? "").matchAll(/<tr[^>]*>(.*?)<\/tr>/gis)) {
    const cells = [...row.matchAll(/<td[^>]*>(.*?)<\/td>/gis)]
      .map(([, cell]) => normalizeTitle(unescapeHtml(cell.replace(/<[^>]+>/g, " "))));
    const link = row.match(/href="([^"]+)"/);
    if (cells.length >= 4 && link) {
      const url = new URL(link[1].replace("/ix?doc=", ""), "https://www.sec.gov").toString();
      docs.push({ type: cells[3], description: cells[1], url });
    }
  }
  return docs;
}

function firstSentence(text: string, limit = 300) {
  for (const match of text.matchAll(/[.!]\s+(?=[A-Z"“(])/g)) {
    const word = text.slice(0, match.index).split(/[\s(]/).at(-1)!.toLowerCase();
    if (word.length > 1 && !ABBREVIATIONS.has(word) && !word.includes(".")) { // not "Inc.", "A.", "L.P."
      text = text.slice(0, match.index! + 1);
      break;
    }
  }
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  return (cut.includes(" ") ? cut.slice(0, cut.lastIndexOf(" ")) : cut) + "...";
}

/** Title Case or ALL CAPS: nearly every word that isn't a small word starts with a capital. */
function isTitle(text: string) {
  const found = [...text.matchAll(/[A-Za-z][\w'’.-]*/g)].map(([w]) => w).filter((w) => !SMALL_WORDS.has(w.toLowerCase()));
  return found.length >= 3 && found.filter((w) => isUpper(w[0])).length >= 0.8 * found.length;
}

/** Is this line the rest of a headline that wrapped onto the next line? */
function wrapsOnto(text: string, line: string) {
  if (DATELINE.test(line) || SPLIT_DATELINE.test(line) || words(text + " " + line).length > 45) return false;
  if (DANGLING.has(words(text).at(-1)!.toLowerCase()) || ",;:&(–-".includes(text.at(-1)!)
      || count(text, "(") > count(text, ")")) {
    return true; // it stopped mid-phrase: "...Names Jeroen Delsman as"
  }
  if (NOT_A_HEADLINE.test(line) || line.endsWith(",") || /(highlights|summary|overview)$/i.test(line)) return false;
  return (isLower(line[0]) || SMALL_WORDS.has(words(line)[0].toLowerCase()) // "AND ANNOUNCES DIVIDEND INCREASE"
    || (words(text).length >= 9 && isTitle(text) && isTitle(line)));
}

/** Guess a press release's headline from the lines above its opening paragraph (the one
 *  starting "CITY, Date --"): the first that reads like a headline, preferring one that names
 *  the company, plus any lines it wrapped onto. With none, the opening's first sentence. */
export function headline(lines: string[], names: RegExp[]) {
  let top = lines.slice(0, 80);
  let opening = "";
  for (const [i, line] of top.entries()) {
    const dateline = line.match(DATELINE);
    if (dateline) {
      opening = dateline[4];
    } else if (SPLIT_DATELINE.test(line)) { // the dateline's text carries on on the next line
      opening = top.slice(i + 1, i + 3).join(" ").replace(/^[–—\- ]+/, "");
    } else if (words(line).length > 40) { // a body paragraph with no dateline
      opening = line;
    } else {
      continue;
    }
    top = top.slice(0, i);
    break;
  }

  const named = (text: string) => names.some((p) => p.test(text));

  const picks = [...top.keys()].filter((i) => {
    const line = top[i];
    return words(line).length >= 4 && !NOT_A_HEADLINE.test(line) && !WRAPPED.test(line)
      && !(isLower(line[0]) && !names.some((p) => matchesAtStart(p, line))); // "onsemi", not "of the"
  });
  if (!picks.length) return opening ? firstSentence(opening) : "";
  const i = (picks.filter((n) => named(top[n])).length ? picks.filter((n) => named(top[n])) : picks)[0];
  let text = top[i];
  const before = i ? top[i - 1] : "";
  if (!named(text) && words(before).length >= 1 && words(before).length <= 3 && !NOT_A_HEADLINE.test(before)
      && named(before + " " + text)) { // "Lattice Semiconductor Appoints" / "John McCool and..."
    text = before + " " + text;
  }
  for (const line of top.slice(i + 1, i + 4)) {
    if (!wrapsOnto(text, line)) break;
    text += " " + line;
  }
  return text;
}

/** A 6-K with no exhibit has the press release in its own body, after the cover page. */
export function afterCover(lines: string[]) {
  const ends = lines.slice(0, 80).flatMap((line, i) => (/form 40-f|rule 101\(b\)/i.test(line) ? [i] : []));
  return ends.length ? lines.slice(ends.at(-1)! + 1) : lines;
}

/** A 6-K's own body headline, minus STMicro's "Enclosure: A press release dated ..., announcing". */
export const sixKHeadline = (lines: string[], names: RegExp[]) =>
  headline(afterCover(lines), names)
    .replace(/^enclosure:\s*(an?\s+)?press release dated [^,]+,\s*(announcing\s+)?/i, "");

/** news_spike.py's clean_name: "ADVANCED MICRO DEVICES INC" -> "ADVANCED MICRO DEVICES". */
export const cleanName = (name: string) =>
  name.replace(new RegExp(String.raw`[,.]?\s+(inc|corp|corporation|co|company|ltd|limited|plc|holdings?|group|n\.?v\.?`
    + String.raw`|s\.?a\.?|ag|se|llc|lp|class [a-z]|common stock|ordinary shares|ads|american depositary)\b.*$`, "i"), "").trim();
