import express, { Request, Response } from "express";
import connectDB from "../utils/connectDB.js";
import StartPriceCache from "../models/StartPriceCache.js";
import MarketCapSnapshot from "../models/MarketCapSnapshot.js";
import CustomWatchlist from "../models/CustomWatchlist.js";

const router = express.Router();

// GET /api/watchlist-cache/custom-watchlists
router.get("/custom-watchlists", async (_req: Request, res: Response) => {
  try {
    await connectDB();
    const docs = await CustomWatchlist.find({}).sort({ name: 1 });
    return res.json({
      watchlists: docs.map((d: any) => ({
        name: d.name,
        tickers: d.tickers || [],
        data: d.data || [],
        last_refreshed: d.lastRefreshed || null,
      })),
    });
  } catch (error: any) {
    console.error("Error loading custom watchlists:", error);
    return res.status(500).json({ error: error.message || "Failed to load custom watchlists" });
  }
});

// PUT /api/watchlist-cache/custom-watchlists/:name
// Body: { tickers: string[], data?: any[], last_refreshed?: ISO|null }
router.put("/custom-watchlists/:name", async (req: Request, res: Response) => {
  try {
    await connectDB();
    const name = String(req.params.name || "").trim();
    const { tickers, data, last_refreshed } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: "Watchlist name is required" });
    }
    if (!Array.isArray(tickers)) {
      return res.status(400).json({ error: "tickers must be an array" });
    }

    const normalizedTickers = Array.from(
      new Set(
        tickers
          .map((t: any) => String(t || "").trim().toUpperCase())
          .filter(Boolean)
      )
    );
    const normalizedData = Array.isArray(data) ? data : [];
    const parsedLastRefreshed =
      last_refreshed === null || last_refreshed === undefined
        ? null
        : new Date(last_refreshed);
    const lastRefreshed =
      parsedLastRefreshed && !Number.isNaN(parsedLastRefreshed.getTime())
        ? parsedLastRefreshed
        : null;

    // Overwrite existing watchlist payload so refresh replaces previous rows.
    const doc = await CustomWatchlist.findOneAndUpdate(
      { name },
      {
        name,
        tickers: normalizedTickers,
        data: normalizedData,
        lastRefreshed,
      },
      { upsert: true, new: true }
    );

    return res.json({
      name: doc.name,
      tickers: doc.tickers || [],
      data: doc.data || [],
      last_refreshed: doc.lastRefreshed || null,
    });
  } catch (error: any) {
    console.error("Error saving custom watchlist:", error);
    return res.status(500).json({ error: error.message || "Failed to save custom watchlist" });
  }
});

// DELETE /api/watchlist-cache/custom-watchlists/:name
router.delete("/custom-watchlists/:name", async (req: Request, res: Response) => {
  try {
    await connectDB();
    const name = String(req.params.name || "").trim();
    if (!name) {
      return res.status(400).json({ error: "Watchlist name is required" });
    }
    await CustomWatchlist.deleteOne({ name });
    return res.json({ ok: true });
  } catch (error: any) {
    console.error("Error deleting custom watchlist:", error);
    return res.status(500).json({ error: error.message || "Failed to delete custom watchlist" });
  }
});

// GET /api/watchlist-cache/start-prices?dateKey=YYYY-MM-DD
// If dateKey omitted, returns list of available dateKeys.
router.get("/start-prices", async (req: Request, res: Response) => {
  try {
    await connectDB();
    const dateKey = String(req.query.dateKey || "").trim();

    if (!dateKey) {
      const docs = await StartPriceCache.find({}, { dateKey: 1, cachedAt: 1 }).sort({ dateKey: 1 });
      return res.json({
        dates: docs.map((d: any) => ({ dateKey: d.dateKey, cachedAt: d.cachedAt })),
      });
    }

    const doc = await StartPriceCache.findOne({ dateKey });
    if (!doc) {
      return res.status(404).json({ error: "Start price cache not found" });
    }

    return res.json({
      dateKey: doc.dateKey,
      cached_at: doc.cachedAt,
      prices: doc.prices || {},
    });
  } catch (error: any) {
    console.error("Error fetching start price cache:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch start price cache" });
  }
});

// POST /api/watchlist-cache/start-prices
// Body: { dateKey: "YYYY-MM-DD", prices: { "AAPL": 123.45, ... }, cached_at?: ISO }
router.post("/start-prices", async (req: Request, res: Response) => {
  try {
    await connectDB();
    const { dateKey, prices, cached_at } = req.body || {};

    if (!dateKey || typeof dateKey !== "string") {
      return res.status(400).json({ error: "dateKey is required" });
    }
    if (!prices || typeof prices !== "object") {
      return res.status(400).json({ error: "prices must be an object" });
    }

    const cachedAt = cached_at ? new Date(cached_at) : new Date();
    const normalizedPrices: Record<string, number> = {};
    for (const [k, v] of Object.entries(prices)) {
      const ticker = String(k).trim().toUpperCase();
      const num = Number(v);
      if (ticker && Number.isFinite(num)) {
        normalizedPrices[ticker] = num;
      }
    }

    const doc = await StartPriceCache.findOneAndUpdate(
      { dateKey },
      { dateKey, cachedAt, prices: normalizedPrices },
      { upsert: true, new: true }
    );

    return res.json({
      dateKey: doc.dateKey,
      cached_at: doc.cachedAt,
      count: Object.keys(doc.prices || {}).length,
    });
  } catch (error: any) {
    console.error("Error saving start price cache:", error);
    return res.status(500).json({ error: error.message || "Failed to save start price cache" });
  }
});

// GET /api/watchlist-cache/market-caps/latest
router.get("/market-caps/latest", async (_req: Request, res: Response) => {
  try {
    await connectDB();
    const doc = await MarketCapSnapshot.findOne().sort({ timestamp: -1 });
    if (!doc) {
      return res.status(404).json({ error: "No market cap snapshots found" });
    }
    return res.json({
      timestamp: doc.timestamp,
      market_caps: doc.marketCaps || {},
      count: Object.keys(doc.marketCaps || {}).length,
    });
  } catch (error: any) {
    console.error("Error fetching latest market cap snapshot:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch market cap snapshot" });
  }
});

// POST /api/watchlist-cache/market-caps
// Body: { timestamp?: ISO, market_caps: { "AAPL": 123, ... } }
router.post("/market-caps", async (req: Request, res: Response) => {
  try {
    await connectDB();
    const { timestamp, market_caps } = req.body || {};

    if (!market_caps || typeof market_caps !== "object") {
      return res.status(400).json({ error: "market_caps must be an object" });
    }

    const ts = timestamp ? new Date(timestamp) : new Date();
    const normalized: Record<string, number> = {};
    for (const [k, v] of Object.entries(market_caps)) {
      const ticker = String(k).trim().toUpperCase();
      const num = Number(v);
      if (ticker && Number.isFinite(num)) {
        normalized[ticker] = num;
      }
    }

    const doc = await MarketCapSnapshot.create({
      timestamp: ts,
      marketCaps: normalized,
    });

    return res.json({
      timestamp: doc.timestamp,
      count: Object.keys(doc.marketCaps || {}).length,
    });
  } catch (error: any) {
    console.error("Error saving market cap snapshot:", error);
    return res.status(500).json({ error: error.message || "Failed to save market cap snapshot" });
  }
});

export default router;

