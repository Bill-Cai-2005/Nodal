// SEC EDGAR filings for "latest news per ticker": a company's recent 8-Ks and 6-Ks, opened and
// labelled the way tools/edgar-spike/edgar_spike.py does it (the rules are in filingRules.ts).
import fetch from "node-fetch";
import { ALIASES, NAMES, compileNames } from "./newsRules.js";
import { ITEMS, cleanName, documents, hasPressItem, headline, label, newsworthy, sixKHeadline, toLines } from "./filingRules.js";

const SEC_TICKERS = "https://www.sec.gov/files/company_tickers.json";
const SEC_GAP_MS = 150; // between SEC requests: about 7 a second, under the SEC's limit of 10
const TICKERS_CACHE_MS = 24 * 60 * 60 * 1000;
const SUBMISSIONS_CACHE_MS = 10 * 60 * 1000;
const FORMS = new Set(["8-K", "8-K/A", "6-K", "6-K/A"]);

type Company = { cik: number; name: string };
type Filing = { form: string; accession: string; accepted: Date; items: string[]; primary: string };
type Opened = { headline: string; url: string };
export type Listed = { ticker: string; company: Company | null; filings: Filing[] };
export type FilingPick = { title: string; url: string; form: string; accepted_utc: string; event: string };

// The SEC asks every caller to name itself with a contact email and to stay under 10 requests
// a second (https://www.sec.gov/os/accessing-edgar-data). Requests start at most one per gap.
let nextSlot = 0;
async function secGet(url: string): Promise<string | null> {
  const agent = process.env.SEC_USER_AGENT ?? "";
  if (!agent.includes("@")) throw new Error("SEC_USER_AGENT (a name and contact email) is not configured on the server");
  const now = Date.now();
  const start = Math.max(now, nextSlot);
  nextSlot = start + SEC_GAP_MS;
  if (start > now) await new Promise((resolve) => setTimeout(resolve, start - now));

  const response = await fetch(url, { headers: { "User-Agent": agent }, signal: AbortSignal.timeout(20_000) });
  if (response.status === 404) return null;
  if (!response.ok) {
    const hint = response.status === 403 ? " (check SEC_USER_AGENT; the SEC also pauses callers that go too fast)" : "";
    throw new Error(`SEC returned ${response.status} for ${url}${hint}`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body);
  } catch { // older filings are often Windows-1252
    return new TextDecoder("windows-1252").decode(body);
  }
}

// Caches hold promises, so requests for the same thing at the same time share one download.
type Cached<T> = { expiresAt: number; value: Promise<T> };
function remember<T>(store: Map<string, Cached<T>>, key: string, ms: number, load: () => Promise<T>) {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const entry = { expiresAt: Date.now() + ms, value: load() };
  store.set(key, entry);
  entry.value.catch(() => store.get(key) === entry && store.delete(key)); // try again next time
  return entry.value;
}

const tickerLists = new Map<string, Cached<Map<string, Company>>>();
const filingLists = new Map<string, Cached<Filing[]>>();
const openedFilings = new Map<string, Cached<Opened>>(); // filed documents never change

// The SEC's ticker -> company number (CIK) list, refreshed daily. First listing of a ticker wins.
const secCompanies = () => remember(tickerLists, "all", TICKERS_CACHE_MS, async () => {
  const text = await secGet(SEC_TICKERS);
  if (!text) throw new Error("SEC ticker list not found");
  const byTicker = new Map<string, Company>();
  for (const row of Object.values(JSON.parse(text) as Record<string, { cik_str: number; ticker: string; title: string }>)) {
    const ticker = row.ticker.toUpperCase();
    if (!byTicker.has(ticker)) byTicker.set(ticker, { cik: row.cik_str, name: row.title });
  }
  return byTicker;
});

// A company's recent 8-Ks and 6-Ks (and their amendments), from its EDGAR submissions file.
const companyFilings = (cik: number) => remember(filingLists, String(cik), SUBMISSIONS_CACHE_MS, async () => {
  const text = await secGet(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`);
  if (!text) return [];
  const recent = JSON.parse(text).filings.recent as Record<string, string[]>;
  return recent.form.flatMap((form, i) => (FORMS.has(form) ? [{
    form,
    accession: recent.accessionNumber[i],
    accepted: new Date(recent.acceptanceDateTime[i].slice(0, 19) + "Z"), // e.g. "2026-11-03T21:16:27.000Z", UTC
    items: recent.items[i].split(",").map((x) => x.trim()).filter(Boolean),
    primary: recent.primaryDocument[i],
  }] : []));
});

/** The ticker's company on EDGAR and its recent 8-Ks and 6-Ks. */
export async function listFilings(ticker: string): Promise<Listed> {
  const byTicker = await secCompanies();
  const spellings = [ticker, ...Object.keys(ALIASES).filter((a) => ALIASES[a] === ticker)];
  const company = spellings.map((s) => byTicker.get(s)).find(Boolean) ?? null;
  return { ticker, company, filings: company ? await companyFilings(company.cik) : [] };
}

// Find the filing's press release (its first EX-99 exhibit) and pull out a headline. A 6-K
// with no exhibit has the release in its own body. Link to the release, else the filing.
const openFiling = (ticker: string, cik: number, filing: Filing, names: RegExp[]) =>
  remember(openedFilings, `${ticker} ${filing.accession}`, Infinity, async () => {
    const folder = `https://www.sec.gov/Archives/edgar/data/${cik}/${filing.accession.replace(/-/g, "")}/`;
    const indexUrl = `${folder}${filing.accession}-index.htm`;
    const exhibit = documents(await secGet(indexUrl)).find((d) => d.type.toUpperCase().startsWith("EX-99"));
    if (exhibit) return { headline: headline(toLines((await secGet(exhibit.url)) ?? ""), names), url: exhibit.url };
    if (filing.form.startsWith("6-K")) {
      const primaryUrl = folder + filing.primary;
      return { headline: sixKHeadline(toLines((await secGet(primaryUrl)) ?? ""), names), url: primaryUrl };
    }
    return { headline: "", url: indexUrl };
  });

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The newest filing since `since` that passes the filing rules. Only filings accepted after
 *  `newerThan` are opened, since an older one can't be the newest item. */
export async function newestFiling({ ticker, company, filings }: Listed, since: Date, newerThan: Date | null) {
  if (!company) return null;
  const names = compileNames([...(Object.hasOwn(NAMES, ticker) ? NAMES[ticker] : []), cleanName(company.name)], ticker);
  const ownPatterns = compileNames(Object.hasOwn(NAMES, ticker) ? NAMES[ticker] : [], ticker);
  const recent = filings
    .filter((f) => f.accepted >= since && !(newerThan && f.accepted <= newerThan))
    .sort((a, b) => b.accepted.getTime() - a.accepted.getTime());

  for (const filing of recent) {
    // An 8-K with only routine items is never shown, so there is nothing to open.
    if (filing.form.startsWith("8-K") && !newsworthy(filing.items).length && !hasPressItem(filing.items)) continue;
    const opened = await openFiling(ticker, company.cik, filing, names);
    const [event] = label(filing.form, filing.items, opened.headline, ticker, ownPatterns);
    if (!event) continue;
    const item = newsworthy(filing.items)[0];
    const pick: FilingPick = {
      // No press release: say what the item number means, e.g. "8-K: Executive or board change (Item 5.02)".
      title: opened.headline || (item ? `${filing.form}: ${capitalize(ITEMS[item][0])} (Item ${item})` : filing.form),
      url: opened.url,
      form: filing.form,
      accepted_utc: filing.accepted.toISOString().replace(/\.\d{3}Z$/, "Z"),
      event,
    };
    return pick;
  }
  return null;
}
