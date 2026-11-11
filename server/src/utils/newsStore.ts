// The stored news: what the scheduled job (src/jobs/ingestNews.ts) saves, and what
// GET /api/news and GET /api/news-feed read back. The site never calls Massive or the SEC itself.
import NewsArticle, { type INewsArticle } from "../models/NewsArticle.js";
import NewsRun from "../models/NewsRun.js";
import NewsVerdict, { type INewsVerdict, type Judgement } from "../models/NewsVerdict.js";
import { ALIASES, NAMES, classify, compileNames, dedupe, normalizeTitle } from "./newsRules.js";

export const PICK_DAYS = 14; // how far back a ticker's "latest news" may reach
export const FEED_DAYS = 3; // how far back the News tab reaches (a Monday visit still shows Friday)
export const KEEP_DAYS = 30; // older articles, verdicts and runs are deleted
// The job runs every 10 minutes on weekdays and hourly otherwise, and GitHub can start runs late.
// After 3 hours without a successful run, answers say "stale".
export const STALE_MS = 3 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
export const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS);

// ---------------------------------------------------------------------------------------
// Judging an article with the rules. Same steps as the old live routes (news.ts and newsFeed.ts),
// which were ported from tools/news-spike/news_spike.py.
// ---------------------------------------------------------------------------------------
export type MassiveArticle = {
  id?: string;
  title?: string;
  article_url?: string;
  published_utc?: string;
  description?: string;
  tickers?: string[];
  publisher?: { name?: string };
};

// Name patterns for every ticker in NAMES ("our tickers"), compiled once.
export const namePatterns: Record<string, RegExp[]> = Object.fromEntries(
  Object.entries(NAMES).map(([ticker, names]) => [ticker, compileNames(names, ticker)]),
);
export const isOurTicker = (ticker: string) => Object.hasOwn(NAMES, ticker);
export const alias = (ticker: string) => (Object.hasOwn(ALIASES, ticker) ? ALIASES[ticker] : ticker);
export const OUR_TICKERS = Object.keys(NAMES);

export type PairVerdict = Judgement & { ticker: string };

/** The article as we store it, and the rules' verdict for each of our tickers it is tagged with.
 *  null when it is tagged with none of ours or has no usable id or time. */
export function judgeByRules(article: MassiveArticle, now: Date) {
  const tagged = dedupe((article.tickers ?? []).map(alias));
  const ours = tagged.filter(isOurTicker);
  const key = article.id || article.article_url;
  const publishedAt = new Date(article.published_utc ?? "");
  if (ours.length === 0 || !key || Number.isNaN(publishedAt.getTime())) return null;

  const title = normalizeTitle(article.title ?? "");
  const publisher = article.publisher?.name ?? "";
  // A headline naming 3+ of our companies is commentary (classify's "market roundup" rule).
  const namedCount = ours.filter((t) => namePatterns[t].some((p) => p.test(title))).length;
  const verdicts: PairVerdict[] = ours.map((ticker) => {
    const [verdict, reason, event] = classify(title, publisher, tagged, ticker, namePatterns[ticker], namedCount);
    return { ticker, verdict, event, reason };
  });

  const stored: INewsArticle = {
    _id: `news:${key}`,
    source: "news",
    title,
    url: article.article_url ?? "",
    publisher,
    description: article.description ?? "",
    published_utc: article.published_utc ?? "",
    published_at: publishedAt,
    tickers: tagged,
    first_seen_at: now,
  };
  return { article: stored, verdicts };
}

// ---------------------------------------------------------------------------------------
// Writing (used by the job)
// ---------------------------------------------------------------------------------------

/** Which of these article ids are already stored. */
export async function storedArticleIds(ids: string[]) {
  const found = await NewsArticle.find({ _id: { $in: ids } }, { _id: 1 }).lean();
  return new Set(found.map((doc) => doc._id));
}

/** Which of these filings already have a verdict for this ticker. */
export async function storedFilingIds(ticker: string, ids: string[]) {
  const found = await NewsVerdict.find({ ticker, article_id: { $in: ids } }, { article_id: 1 }).lean();
  return new Set(found.map((doc) => doc.article_id));
}

export type Judged = {
  article: INewsArticle;
  verdicts: (PairVerdict & { judge: "rules" | "ai"; rules: Judgement })[];
};

/** Saves articles with their verdicts. Saving the same article twice changes nothing. Verdicts
 *  go first, so an article only counts as stored once all its verdicts are in. */
export async function saveJudged(items: Judged[], now: Date) {
  if (items.length === 0) return;
  const verdicts = items.flatMap(({ article, verdicts }) => verdicts.map((v): INewsVerdict => ({
    article_id: article._id,
    ticker: v.ticker,
    source: article.source,
    published_at: article.published_at,
    verdict: v.verdict,
    event: v.event,
    reason: v.reason,
    judge: v.judge,
    rules: v.rules,
    judged_at: now,
  })));
  await NewsVerdict.bulkWrite(verdicts.map((v) => ({
    updateOne: { filter: { article_id: v.article_id, ticker: v.ticker }, update: { $setOnInsert: v }, upsert: true },
  })), { ordered: false });
  await NewsArticle.bulkWrite(items.map(({ article }) => ({
    updateOne: { filter: { _id: article._id }, update: { $setOnInsert: article }, upsert: true },
  })), { ordered: false });
}

/** Deletes articles, verdicts and job runs older than the cutoff. */
export async function pruneBefore(cutoff: Date) {
  const [articles, verdicts, runs] = await Promise.all([
    NewsArticle.deleteMany({ published_at: { $lt: cutoff } }),
    NewsVerdict.deleteMany({ published_at: { $lt: cutoff } }),
    NewsRun.deleteMany({ started_at: { $lt: cutoff } }),
  ]);
  return { articles: articles.deletedCount, verdicts: verdicts.deletedCount, runs: runs.deletedCount };
}

// ---------------------------------------------------------------------------------------
// Reading (used by the routes)
// ---------------------------------------------------------------------------------------
const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

/** When the job last read Massive and the SEC successfully, and whether that is too long ago. */
export async function storeStatus(now = new Date()) {
  const [news, sec] = await Promise.all([
    NewsRun.findOne({ "news.ok": true }, { finished_at: 1 }).sort({ started_at: -1 }).lean(),
    NewsRun.findOne({ "sec.ok": true }, { finished_at: 1 }).sort({ started_at: -1 }).lean(),
  ]);
  const old = (run: { finished_at: Date } | null) => !run || now.getTime() - run.finished_at.getTime() > STALE_MS;
  return {
    empty: !news, // the job has never finished reading Massive
    newsStale: old(news),
    filingsStale: old(sec),
    fetched_at: iso(news?.finished_at),
    filings_checked_at: iso(sec?.finished_at),
  };
}

// source "sec": an 8-K or 6-K. Its publisher is the form and published_utc is when the SEC accepted it.
export type TickerPick = {
  title: string;
  url: string;
  publisher: string;
  published_utc: string;
  event: string;
  source: "news" | "sec";
};
export type TickerNews = { ticker: string; pick: TickerPick | null; checked: number };

/** For each ticker: the newest article or filing from the last 14 days that passed, and how many
 *  Massive articles were checked. An article wins a tie with a filing, as in the old live route. */
export async function tickerPicks(tickers: string[], now = new Date()): Promise<TickerNews[]> {
  const since = daysBefore(now, PICK_DAYS);
  const [latest, counts] = await Promise.all([
    NewsVerdict.aggregate<{ _id: string; article_id: string; event: string; source: "news" | "sec" }>([
      { $match: { ticker: { $in: tickers }, verdict: "show", published_at: { $gte: since } } },
      { $sort: { published_at: -1, source: 1, article_id: 1 } },
      { $group: { _id: "$ticker", article_id: { $first: "$article_id" }, event: { $first: "$event" }, source: { $first: "$source" } } },
    ]),
    NewsVerdict.aggregate<{ _id: string; n: number }>([
      { $match: { ticker: { $in: tickers }, source: "news", published_at: { $gte: since } } },
      { $group: { _id: "$ticker", n: { $sum: 1 } } },
    ]),
  ]);
  const articles = new Map((await NewsArticle.find({ _id: { $in: latest.map((l) => l.article_id) } }).lean())
    .map((a) => [a._id, a]));
  const picks = new Map(latest.map((l) => [l._id, l]));
  const checked = new Map(counts.map((c) => [c._id, c.n]));

  return tickers.map((ticker) => {
    const hit = picks.get(ticker);
    const article = hit && articles.get(hit.article_id);
    return {
      ticker,
      pick: article ? {
        title: article.title,
        url: article.url,
        publisher: article.publisher,
        published_utc: article.published_utc,
        event: hit.event,
        source: hit.source,
      } : null,
      checked: checked.get(ticker) ?? 0,
    };
  });
}

export type FeedItem = {
  title: string;
  url: string;
  publisher: string;
  published_utc: string;
  tickers: { ticker: string; event: string }[];
};

/** Material Massive news from the last 3 days across our tickers, newest first, each listing the
 *  tickers it passed for (in Massive's tag order). `checked`: articles tagged with any of ours. */
export async function newsFeed(now = new Date()) {
  const since = daysBefore(now, FEED_DAYS);
  const [shown, checked] = await Promise.all([
    NewsVerdict.find({ source: "news", verdict: "show", published_at: { $gte: since } },
      { article_id: 1, ticker: 1, event: 1 }).lean(),
    NewsArticle.countDocuments({ source: "news", published_at: { $gte: since } }),
  ]);
  const events = new Map<string, Map<string, string>>(); // article id -> ticker -> event
  for (const v of shown) {
    if (!events.has(v.article_id)) events.set(v.article_id, new Map());
    events.get(v.article_id)!.set(v.ticker, v.event);
  }
  const articles = await NewsArticle.find({ _id: { $in: [...events.keys()] } })
    .sort({ published_at: -1, _id: 1 }).lean();

  const items: FeedItem[] = articles.map((a) => {
    const passed = events.get(a._id)!;
    return {
      title: a.title,
      url: a.url,
      publisher: a.publisher,
      published_utc: a.published_utc,
      tickers: a.tickers.filter((t) => passed.has(t)).map((ticker) => ({ ticker, event: passed.get(ticker)! })),
    };
  });
  return { days: FEED_DAYS, checked, items };
}
