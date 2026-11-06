// The scheduled news job: reads the newest Massive news and SEC filings for all of our tickers,
// judges each new article once, and saves the results in MongoDB. GET /api/news and
// GET /api/news-feed then answer from the database, so the site never waits on Massive or the SEC.
//
// Run by .github/workflows/refresh-news.yml. By hand, from server/:  npm run ingest-news
// Needs MONGO_URI, POLYGON_API_KEY and SEC_USER_AGENT in the environment. It reads no .env file,
// so it only ever writes to the database it is explicitly given.
import mongoose from "mongoose";
import fetch from "node-fetch";
import { pathToFileURL } from "url";
import NewsRun, { type INewsRun } from "../models/NewsRun.js";
import type { INewsArticle } from "../models/NewsArticle.js";
import type { Judgement } from "../models/NewsVerdict.js";
import connectDB from "../utils/connectDB.js";
import { listFilings, newestFiling, type Listed } from "../utils/edgar.js";
import { hasPressItem, newsworthy } from "../utils/filingRules.js";
import {
  KEEP_DAYS, OUR_TICKERS, PICK_DAYS, daysBefore, judgeByRules, pruneBefore, saveJudged, storedArticleIds,
  storedFilingIds, type Judged, type MassiveArticle, type PairVerdict,
} from "../utils/newsStore.js";

const POLYGON_BASE_URL = "https://api.polygon.io";
const PAGE_LIMIT = 1000; // Massive's maximum
const MAX_PAGES = 40; // safety stop; the first run reads 14 days of the whole market's news, about 8 pages
// Massive adds articles in batches (its docs say "updated hourly"), so an article can turn up after
// the run that should have seen it, carrying an earlier publish time. Each run therefore re-reads
// from 6 hours before the previous run started. That is usually still one page, and articles
// already stored are skipped.
const NEWS_OVERLAP_MS = 6 * 60 * 60 * 1000;

// SEC filings. Reading all 194 companies' filing lists takes 194 requests, so the job does that
// only once a day (or when it can't tell what changed). Every other run reads the SEC's
// latest-filings list, which shows the newest 8-Ks and 6-Ks from every company, 100 per request,
// and re-reads only our companies that appear in it. At the busiest time of earnings season one
// page covered about an hour of 8-Ks; a 10-minute run usually needs 2 requests plus a few for
// the companies that filed. All requests stay under the SEC's limit of 10 a second.
const SEC_LATEST = "https://www.sec.gov/cgi-bin/browse-edgar";
const SEC_LATEST_FORMS = ["8-K", "6-K"]; // also lists amendments (8-K/A, 6-K/A)
const SEC_LATEST_PAGE = 100; // the most the list returns per request
const SEC_LATEST_MAX_PAGES = 5; // further back than this, read every company instead
const SEC_OVERLAP_MS = 60 * 60 * 1000; // re-read the hour before the previous successful run
const FULL_SWEEP_MS = 24 * 60 * 60 * 1000;
const SEC_GAP_MS = 150; // same spacing as edgar.ts: about 7 requests a second

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const isoSeconds = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// =====================================================================================================
// AI CHECK: NOT ENABLED. The AI relevance check (a small Claude model, about $1-5 a month) is waiting
// on budget approval. When it is approved, it goes in this one function:
//   - The job calls it once for each NEW article or filing (stored ones are never judged again),
//     with the rules' verdict for each of our tickers the article is tagged with.
//   - Return a verdict for a ticker to make the call (saved with judge "ai"; the rules' verdict is
//     kept next to it for comparison), or null to keep the rules' verdicts (saved with judge "rules").
//   - Read the API key from an environment variable and add it to refresh-news.yml as a secret.
// Until then it must not call any AI API.
// =====================================================================================================
export async function judgeWithAi(article: INewsArticle, rules: PairVerdict[]): Promise<Map<string, Judgement> | null> {
  return null;
}

/** Asks the AI check (judgeWithAi) about one new article and merges its answer with the rules'. */
async function judge(article: INewsArticle, rules: PairVerdict[]): Promise<Judged> {
  const ai = await judgeWithAi(article, rules);
  return {
    article,
    verdicts: rules.map(({ ticker, verdict, event, reason }) => {
      const byRules: Judgement = { verdict, event, reason };
      const byAi = ai?.get(ticker);
      return byAi ? { ticker, ...byAi, judge: "ai", rules: byRules } : { ticker, ...byRules, judge: "rules", rules: byRules };
    }),
  };
}

// -----------------------------------------------------------------------------------------------------
// Massive news
// -----------------------------------------------------------------------------------------------------

// Massive's next_url leaves out the key. Only add it to links back to Massive itself.
const withKey = (link: string, apiKey: string) => {
  const url = new URL(link);
  if (url.origin !== POLYGON_BASE_URL) return null;
  url.searchParams.set("apiKey", apiKey);
  return url.toString();
};

/** Every article Massive has published since `since`, for all tickers (no ticker filter). */
async function fetchMassive(since: Date, apiKey: string) {
  const url = new URL(`${POLYGON_BASE_URL}/v2/reference/news`);
  url.searchParams.set("published_utc.gte", isoSeconds(since));
  url.searchParams.set("order", "desc");
  url.searchParams.set("sort", "published_utc");
  url.searchParams.set("limit", String(PAGE_LIMIT));
  url.searchParams.set("apiKey", apiKey);

  const articles: MassiveArticle[] = [];
  let next: string | null = url.toString();
  let pages = 0;
  for (; next && pages < MAX_PAGES; pages += 1) {
    const upstream = await fetch(next, { method: "GET", signal: AbortSignal.timeout(30_000) });
    if (!upstream.ok) throw new Error(`Massive returned ${upstream.status}: ${(await upstream.text()).slice(0, 300)}`);
    const data = (await upstream.json()) as { results?: MassiveArticle[]; next_url?: string };
    articles.push(...(data.results ?? []));
    next = data.next_url ? withKey(data.next_url, apiKey) : null;
  }
  if (next) console.warn(`Massive: stopped after ${MAX_PAGES} pages; older articles were not read`);
  return { articles, pages };
}

/** Judges and saves the articles that aren't stored yet. Exported for the tests. */
export async function storeNewArticles(articles: MassiveArticle[], now: Date) {
  const ours = new Map<string, NonNullable<ReturnType<typeof judgeByRules>>>();
  for (const article of articles) {
    const judged = judgeByRules(article, now);
    if (judged && !ours.has(judged.article._id)) ours.set(judged.article._id, judged);
  }
  const stored = await storedArticleIds([...ours.keys()]);
  const items: Judged[] = [];
  for (const { article, verdicts } of ours.values()) {
    if (!stored.has(article._id)) items.push(await judge(article, verdicts));
  }
  await saveJudged(items, now);
  const pairs = items.flatMap((item) => item.verdicts);
  return {
    ours: ours.size,
    new_articles: items.length,
    skipped: ours.size - items.length,
    pairs: pairs.length,
    shown: pairs.filter((v) => v.verdict === "show").length,
  };
}

async function runNews(now: Date): Promise<INewsRun["news"]> {
  const news: INewsRun["news"] = {
    ok: false, since: null, pages: 0, fetched: 0, ours: 0, new_articles: 0, skipped: 0, pairs: 0, shown: 0, error: "",
  };
  try {
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) throw new Error("POLYGON_API_KEY is not set");
    // First run (or after a long pause): the whole 14 days. Otherwise: since the previous run, with overlap.
    const previous = await NewsRun.findOne({ "news.ok": true }, { started_at: 1 }).sort({ started_at: -1 }).lean();
    const backfill = daysBefore(now, PICK_DAYS);
    const since = previous && previous.started_at.getTime() - NEWS_OVERLAP_MS > backfill.getTime()
      ? new Date(previous.started_at.getTime() - NEWS_OVERLAP_MS)
      : backfill;
    news.since = since;
    const { articles, pages } = await fetchMassive(since, apiKey);
    Object.assign(news, { pages, fetched: articles.length }, await storeNewArticles(articles, now));
    news.ok = true;
  } catch (error) {
    news.error = message(error);
  }
  return news;
}

// -----------------------------------------------------------------------------------------------------
// SEC filings
// -----------------------------------------------------------------------------------------------------
type Filing = Listed["filings"][number];

// The SEC asks every caller to name itself with a contact email (SEC_USER_AGENT) and to stay under
// 10 requests a second. These requests run one at a time, before any of edgar.ts's.
let nextSlot = 0;
async function latestFilingsPage(form: string, start: number) {
  const agent = process.env.SEC_USER_AGENT ?? "";
  if (!agent.includes("@")) throw new Error("SEC_USER_AGENT (a name and contact email) is not set");
  const wait = nextSlot - Date.now();
  if (wait > 0) await sleep(wait);
  nextSlot = Date.now() + SEC_GAP_MS;

  const url = `${SEC_LATEST}?action=getcurrent&type=${encodeURIComponent(form)}&company=&dateb=&owner=include`
    + `&start=${start}&count=${SEC_LATEST_PAGE}&output=atom`;
  const response = await fetch(url, { headers: { "User-Agent": agent }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`SEC returned ${response.status} for its latest ${form} list`);
  // Each entry: <title>8-K - NVIDIA CORP (0001045810) (Filer)</title> ... <updated>2026-11-05T16:05:12-05:00</updated>
  return (await response.text()).split("<entry>").slice(1).flatMap((entry) => {
    const cik = entry.match(/<title>[^<]*?\((\d{10})\)/)?.[1];
    const accepted = new Date(entry.match(/<updated>([^<]+)<\/updated>/)?.[1] ?? "");
    return cik && !Number.isNaN(accepted.getTime()) ? [{ cik: Number(cik), accepted }] : [];
  });
}

/** Company numbers (CIKs) that filed an 8-K or 6-K since `since`, from the SEC's latest-filings
 *  list. null if the list doesn't reach back that far (then every company is checked instead). */
async function recentFilers(since: Date) {
  const ciks = new Set<number>();
  for (const form of SEC_LATEST_FORMS) {
    let reachedBack = false;
    for (let page = 0; page < SEC_LATEST_MAX_PAGES && !reachedBack; page += 1) {
      const entries = await latestFilingsPage(form, page * SEC_LATEST_PAGE);
      for (const entry of entries) if (entry.accepted >= since) ciks.add(entry.cik);
      reachedBack = entries.some((entry) => entry.accepted < since);
      if (entries.length < SEC_LATEST_PAGE) break; // the list ends here
    }
    if (!reachedBack) return null;
  }
  await sleep(SEC_GAP_MS); // keep the spacing before edgar.ts's first request
  return ciks;
}

// Why the filing rules (filingRules.ts) dropped a filing. edgar.ts doesn't say, but there are only
// two ways: an 8-K with only routine items, or a press release headline that is missing or failed.
const whyDropped = (filing: Filing) =>
  filing.form.startsWith("8-K") && !newsworthy(filing.items).length && !hasPressItem(filing.items)
    ? "routine items only"
    : "no press release headline, or it failed the news rules";

/** Reads each ticker's recent 8-Ks and 6-Ks (edgar.ts) and judges and saves the new ones. */
async function checkCompanies(tickers: string[], now: Date) {
  const since = daysBefore(now, PICK_DAYS);
  const result = { companies: 0, new_filings: 0, skipped: 0, shown: 0, ciks: {} as Record<string, number> };
  for (const ticker of tickers) {
    const listed = await listFilings(ticker);
    if (!listed.company) continue; // not on EDGAR
    result.companies += 1;
    result.ciks[ticker] = listed.company.cik;
    const recent = listed.filings.filter((f) => f.accepted >= since);
    const stored = await storedFilingIds(ticker, recent.map((f) => `sec:${f.accession}`));

    const items: Judged[] = [];
    for (const filing of recent) {
      const id = `sec:${filing.accession}`;
      if (stored.has(id)) {
        result.skipped += 1;
        continue;
      }
      // edgar.ts's newestFiling with just this filing: the same call the live route made on it.
      const pick = await newestFiling({ ...listed, filings: [filing] }, since, null);
      const rules: PairVerdict = pick
        ? { ticker, verdict: "show", event: pick.event, reason: "" }
        : { ticker, verdict: "drop", event: "", reason: whyDropped(filing) };
      const folder = `https://www.sec.gov/Archives/edgar/data/${listed.company.cik}/${filing.accession.replace(/-/g, "")}/`;
      const article: INewsArticle = {
        _id: id,
        source: "sec",
        title: pick?.title ?? `${filing.form} (items ${filing.items.join(", ") || "none"})`,
        url: pick?.url ?? `${folder}${filing.accession}-index.htm`,
        publisher: filing.form,
        description: "",
        published_utc: pick?.accepted_utc ?? isoSeconds(filing.accepted),
        published_at: filing.accepted,
        tickers: [ticker],
        form: filing.form,
        items: filing.items,
        cik: listed.company.cik,
        first_seen_at: now,
      };
      items.push(await judge(article, [rules]));
      result.new_filings += 1;
      if (items.at(-1)!.verdicts[0].verdict === "show") result.shown += 1;
    }
    await saveJudged(items, now);
  }
  return result;
}

async function runSec(now: Date): Promise<INewsRun["sec"]> {
  const sec: INewsRun["sec"] = {
    ok: false, mode: "off", since: null, companies: 0, new_filings: 0, skipped: 0, shown: 0, error: "",
  };
  try {
    const [lastFull, lastOk] = await Promise.all([
      NewsRun.findOne({ "sec.ok": true, "sec.mode": "full" }, { started_at: 1, "sec.ciks": 1 }).sort({ started_at: -1 }).lean(),
      NewsRun.findOne({ "sec.ok": true }, { started_at: 1 }).sort({ started_at: -1 }).lean(),
    ]);
    let tickers = OUR_TICKERS;
    sec.mode = "full";
    if (lastFull?.sec.ciks && lastOk && now.getTime() - lastFull.started_at.getTime() < FULL_SWEEP_MS) {
      const since = new Date(lastOk.started_at.getTime() - SEC_OVERLAP_MS);
      const filers = await recentFilers(since);
      if (filers) {
        const ciks = lastFull.sec.ciks;
        tickers = OUR_TICKERS.filter((t) => Object.hasOwn(ciks, t) && filers.has(ciks[t]));
        sec.mode = "recent";
        sec.since = since;
      }
    }
    const { ciks, ...counts } = await checkCompanies(tickers, now);
    Object.assign(sec, counts);
    if (sec.mode === "full") sec.ciks = ciks;
    sec.ok = true;
  } catch (error) {
    sec.error = message(error);
  }
  return sec;
}

// -----------------------------------------------------------------------------------------------------
// One run
// -----------------------------------------------------------------------------------------------------

/** One run of the job, against whatever database mongoose is connected to. */
export async function runIngest(now = new Date()) {
  const news = await runNews(now);
  const sec = await runSec(now);
  const pruned = await pruneBefore(daysBefore(now, KEEP_DAYS));
  const run: INewsRun = { started_at: now, finished_at: new Date(), news, sec, pruned };
  await NewsRun.create(run);
  return run;
}

async function main() {
  await connectDB(); // MONGO_URI from the environment
  try {
    const run = await runIngest();
    const { news, sec } = run;
    const seconds = ((run.finished_at.getTime() - run.started_at.getTime()) / 1000).toFixed(1);
    console.log(`News job finished in ${seconds}s`);
    console.log(news.ok
      ? `  Massive: ${news.fetched} articles since ${news.since?.toISOString()} (${news.pages} pages), ${news.ours} tagged with our tickers: `
        + `${news.new_articles} new, ${news.skipped} already stored; ${news.pairs} new verdicts, ${news.shown} shown`
      : `  Massive FAILED: ${news.error}`);
    console.log(sec.ok
      ? `  SEC (${sec.mode === "full" ? "every company" : `latest-filings list since ${sec.since?.toISOString()}`}): `
        + `${sec.companies} companies read, ${sec.new_filings} new filings (${sec.shown} shown), ${sec.skipped} already stored`
      : `  SEC FAILED: ${sec.error}`);
    console.log(`  Pruned (older than ${KEEP_DAYS} days): ${run.pruned.articles} articles, ${run.pruned.verdicts} verdicts, ${run.pruned.runs} runs`);
    if (!news.ok || !sec.ok) process.exitCode = 1; // shows as a failed run on GitHub
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("News job failed:", message(error));
    process.exit(1);
  });
}
