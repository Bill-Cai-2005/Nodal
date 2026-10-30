import express, { Request, Response } from "express";
import fetch from "node-fetch";
import { ALIASES, NAMES, classify, compileNames, dedupe, normalizeTitle } from "../utils/newsRules.js";

const router = express.Router();

const POLYGON_BASE_URL = "https://api.polygon.io";
const DAYS = 14; // how far back "latest news" may reach
const CACHE_MS = 10 * 60 * 1000;

type MassiveArticle = {
  title?: string;
  article_url?: string;
  published_utc?: string;
  tickers?: string[];
  publisher?: { name?: string };
};

type NewsResult = {
  ticker: string;
  pick: { title: string; url: string; publisher: string; published_utc: string; event: string } | null;
  checked: number;
};

const cache = new Map<string, { expiresAt: number; result: NewsResult }>();

// Name patterns for every ticker in NAMES ("our tickers"), compiled once.
const namePatterns: Record<string, RegExp[]> = Object.fromEntries(
  Object.entries(NAMES).map(([ticker, names]) => [ticker, compileNames(names, ticker)]),
);
const isOurTicker = (ticker: string) => Object.hasOwn(NAMES, ticker);
const alias = (ticker: string) => (Object.hasOwn(ALIASES, ticker) ? ALIASES[ticker] : ticker);

// GET /api/news/:ticker -> the newest article from the last 14 days that passes the rules.
router.get("/:ticker", async (req: Request, res: Response) => {
  try {
    const ticker = alias(String(req.params.ticker || "").trim().toUpperCase());
    if (!/^[A-Z0-9.:-]{1,20}$/.test(ticker)) {
      return res.status(400).json({ error: "Invalid ticker" });
    }

    const cached = cache.get(ticker);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.result);
    }

    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "POLYGON_API_KEY is not configured on the server" });
    }

    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
    const url = new URL(`${POLYGON_BASE_URL}/v2/reference/news`);
    url.searchParams.set("ticker", ticker);
    url.searchParams.set("published_utc.gte", since);
    url.searchParams.set("order", "desc");
    url.searchParams.set("sort", "published_utc");
    url.searchParams.set("limit", "100");
    url.searchParams.set("apiKey", apiKey);

    const upstream = await fetch(url.toString(), { method: "GET" });
    if (!upstream.ok) {
      const text = await upstream.text();
      console.error("Massive news error:", upstream.status, text);
      return res.status(upstream.status).json({
        error: "Polygon API error",
        status: upstream.status,
        body: text,
      });
    }

    const data = (await upstream.json()) as { results?: MassiveArticle[] };
    const ownPatterns = namePatterns[ticker] ?? compileNames([], ticker);
    const result: NewsResult = { ticker, pick: null, checked: 0 };

    // Same steps as news_spike.py's analyze(), for this one ticker. Results arrive newest
    // first, so the first article that passes is the pick.
    for (const article of data.results ?? []) {
      const tagged = dedupe((article.tickers ?? []).map(alias));
      if (!tagged.includes(ticker)) continue;
      result.checked += 1;
      if (result.pick) continue;

      const title = normalizeTitle(article.title ?? "");
      const publisher = article.publisher?.name ?? "";
      const ours = tagged.filter(isOurTicker);
      const namedCount = ours.filter((t) => namePatterns[t].some((p) => p.test(title))).length;
      const [verdict, , event] = classify(title, publisher, tagged, ticker, ownPatterns, namedCount);
      if (verdict === "show") {
        result.pick = {
          title,
          url: article.article_url ?? "",
          publisher,
          published_utc: article.published_utc ?? "",
          event,
        };
      }
    }

    cache.set(ticker, { expiresAt: Date.now() + CACHE_MS, result });
    return res.json(result);
  } catch (error: any) {
    console.error("Error in news route:", error);
    return res.status(500).json({ error: error.message || "News lookup failed" });
  }
});

export default router;
