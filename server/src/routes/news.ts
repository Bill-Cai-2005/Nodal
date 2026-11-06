import express, { Request, Response } from "express";
import connectDB from "../utils/connectDB.js";
import { OUR_TICKERS, alias, isOurTicker, storeStatus, tickerPicks } from "../utils/newsStore.js";

const router = express.Router();

// News comes from the database, which the scheduled news job (src/jobs/ingestNews.ts) fills.
// These routes never call Massive or the SEC. Besides the pick, each answer says how fresh it is:
//   fetched_at          when the job last read Massive news successfully
//   filings_checked_at  when the job last read SEC filings successfully
//   status              "ok"; "stale" if either is over 3 hours old (the job may be failing, so a
//                       newer story may be missing); "not_tracked" for a ticker outside our list
// If the job has never finished, the answer is a 503 with status "empty", never a silent live fetch.

async function freshness(res: Response) {
  await connectDB();
  const status = await storeStatus();
  if (status.empty) {
    res.status(503).json({ error: "News hasn't been collected yet (the scheduled news job hasn't run)", status: "empty" });
    return null;
  }
  return {
    fetched_at: status.fetched_at,
    filings_checked_at: status.filings_checked_at,
    status: status.newsStale || status.filingsStale ? "stale" : "ok",
  };
}

// GET /api/news -> every tracked ticker's latest pick, so a page can load them all in one request.
router.get("/", async (_req: Request, res: Response) => {
  try {
    const fresh = await freshness(res);
    if (!fresh) return;
    const tickers = Object.fromEntries((await tickerPicks(OUR_TICKERS)).map((news) => [news.ticker, news]));
    return res.json({ ...fresh, tickers });
  } catch (error: any) {
    console.error("Error in news route:", error);
    return res.status(500).json({ error: error.message || "News lookup failed" });
  }
});

// GET /api/news/:ticker -> the newest article or SEC filing from the last 14 days that passes the rules.
router.get("/:ticker", async (req: Request, res: Response) => {
  try {
    const ticker = alias(String(req.params.ticker || "").trim().toUpperCase());
    if (!/^[A-Z0-9.:-]{1,20}$/.test(ticker)) {
      return res.status(400).json({ error: "Invalid ticker" });
    }
    const fresh = await freshness(res);
    if (!fresh) return;
    if (!isOurTicker(ticker)) { // the job only collects news for the tickers in newsRules.ts NAMES
      return res.json({ ticker, pick: null, checked: 0, ...fresh, status: "not_tracked" });
    }
    const [news] = await tickerPicks([ticker]);
    return res.json({ ...news, ...fresh });
  } catch (error: any) {
    console.error("Error in news route:", error);
    return res.status(500).json({ error: error.message || "News lookup failed" });
  }
});

export default router;
