import express, { Request, Response } from "express";
import connectDB from "../utils/connectDB.js";
import StartPriceCache from "../models/StartPriceCache.js";
import MarketCapSnapshot from "../models/MarketCapSnapshot.js";

const router = express.Router();

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

