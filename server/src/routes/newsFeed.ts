import express, { Request, Response } from "express";
import fetch from "node-fetch";
import { ALIASES, NAMES, classify, compileNames, dedupe, normalizeTitle } from "../utils/newsRules.js";

const router = express.Router();

const POLYGON_BASE_URL = "https://api.polygon.io";
// How far back the feed reaches. 3 days means a Monday visit still shows Friday's news,
// while keeping the fetch to a few pages of the whole market's news.
const DAYS = 3;
const CACHE_MS = 10 * 60 * 1000;
const PAGE_LIMIT = 1000; // Massive's maximum, same as news.ts
const MAX_PAGES = 10; // safety stop; 3 days of the whole market's news was 2 pages (1,446 articles) on Nov 3

type MassiveArticle = {
  title?: string;
  article_url?: string;
  published_utc?: string;
  tickers?: string[];
  publisher?: { name?: string };
};

type FeedItem = {
  title: string;
  url: string;
  publisher: string;
  published_utc: string;
  tickers: { ticker: string; event: string }[];
};

type FeedResult = {
  fetched_at: string;
  days: number;
  checked: number;
  items: FeedItem[];
};

// One feed for everyone, so one cache entry. `pending` lets visitors who arrive while a
// fetch is running share it instead of each starting their own.
let cache: { expiresAt: number; result: FeedResult } | null = null;
let pending: Promise<FeedResult> | null = null;

class UpstreamError extends Error {
  constructor(public status: number, public body: string) {
    super("Polygon API error");
  }
}

// Same helpers as news.ts (kept separate so news.ts stays untouched).
const namePatterns: Record<string, RegExp[]> = Object.fromEntries(
  Object.entries(NAMES).map(([ticker, names]) => [ticker, compileNames(names, ticker)]),
);
const isOurTicker = (ticker: string) => Object.hasOwn(NAMES, ticker);
const alias = (ticker: string) => (Object.hasOwn(ALIASES, ticker) ? ALIASES[ticker] : ticker);

// Massive's next_url leaves out the key. Only add it to links back to Massive itself.
const withKey = (link: string, apiKey: string) => {
  const url = new URL(link);
  if (url.origin !== POLYGON_BASE_URL) return null;
  url.searchParams.set("apiKey", apiKey);
  return url.toString();
};

async function buildFeed(apiKey: string): Promise<FeedResult> {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const url = new URL(`${POLYGON_BASE_URL}/v2/reference/news`);
  url.searchParams.set("published_utc.gte", since);
  url.searchParams.set("order", "desc");
  url.searchParams.set("sort", "published_utc");
  url.searchParams.set("limit", String(PAGE_LIMIT));
  url.searchParams.set("apiKey", apiKey);

  // No ticker filter: this is every article Massive has for the last DAYS days.
  const articles: MassiveArticle[] = [];
  let next: string | null = url.toString();
  for (let page = 0; next && page < MAX_PAGES; page += 1) {
    const upstream = await fetch(next, { method: "GET" });
    if (!upstream.ok) {
      throw new UpstreamError(upstream.status, await upstream.text());
    }
    const data = (await upstream.json()) as { results?: MassiveArticle[]; next_url?: string };
    articles.push(...(data.results ?? []));
    next = data.next_url ? withKey(data.next_url, apiKey) : null;
  }

  const result: FeedResult = { fetched_at: new Date().toISOString(), days: DAYS, checked: 0, items: [] };

  // The per-ticker check from news.ts, run for every one of our tickers an article is
  // tagged with. Results arrive newest first, so the feed comes out newest first too.
  for (const article of articles) {
    const tagged = dedupe((article.tickers ?? []).map(alias));
    const ours = tagged.filter(isOurTicker);
    if (ours.length === 0) continue;
    result.checked += 1;

    const title = normalizeTitle(article.title ?? "");
    const publisher = article.publisher?.name ?? "";
    const namedCount = ours.filter((t) => namePatterns[t].some((p) => p.test(title))).length;
    const shown: FeedItem["tickers"] = [];
    for (const ticker of ours) {
      const [verdict, , event] = classify(title, publisher, tagged, ticker, namePatterns[ticker], namedCount);
      if (verdict === "show") shown.push({ ticker, event });
    }
    if (shown.length > 0) {
      result.items.push({
        title,
        url: article.article_url ?? "",
        publisher,
        published_utc: article.published_utc ?? "",
        tickers: shown,
      });
    }
  }

  return result;
}

// GET /api/news-feed -> material news from the last DAYS days across all of our tickers.
router.get("/", async (_req: Request, res: Response) => {
  try {
    if (cache && cache.expiresAt > Date.now()) {
      return res.json(cache.result);
    }

    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "POLYGON_API_KEY is not configured on the server" });
    }

    if (!pending) {
      pending = buildFeed(apiKey)
        .then((result) => {
          cache = { expiresAt: Date.now() + CACHE_MS, result };
          return result;
        })
        .finally(() => {
          pending = null;
        });
    }
    return res.json(await pending);
  } catch (error: any) {
    if (error instanceof UpstreamError) {
      console.error("Massive news feed error:", error.status, error.body);
      return res.status(error.status).json({
        error: "Polygon API error",
        status: error.status,
        body: error.body,
      });
    }
    console.error("Error in news feed route:", error);
    return res.status(500).json({ error: error.message || "News feed lookup failed" });
  }
});

export default router;
