import express, { Request, Response } from "express";
import connectDB from "../utils/connectDB.js";
import StartPriceCache from "../models/StartPriceCache.js";
import MarketCapSnapshot from "../models/MarketCapSnapshot.js";
import CustomWatchlist from "../models/CustomWatchlist.js";
import CustomWatchlistCategory from "../models/CustomWatchlistCategory.js";

const router = express.Router();
const UNCATEGORIZED = "Uncategorized";
const AI_BUILDOUT_NAME = "AI Buildout";
const DEFAULT_RESOURCE_TAB = "ai-buildout";

function normalizeResourceTab(value: unknown): string {
  const tab = String(value || "").trim();
  return tab || DEFAULT_RESOURCE_TAB;
}

async function migrateLegacyResourceTabs() {
  await CustomWatchlist.updateMany(
    { $or: [{ resourceTab: { $exists: false } }, { resourceTab: "" }] },
    { $set: { resourceTab: DEFAULT_RESOURCE_TAB } },
  );
  await CustomWatchlistCategory.updateMany(
    { $or: [{ resourceTab: { $exists: false } }, { resourceTab: "" }] },
    { $set: { resourceTab: DEFAULT_RESOURCE_TAB } },
  );
}

function normalizeStockTags(input: unknown): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  if (!input || typeof input !== "object") return result;
  for (const [ticker, tags] of Object.entries(input as Record<string, unknown>)) {
    const normalizedTicker = String(ticker || "").trim().toUpperCase();
    if (!normalizedTicker) continue;
    const tagList = Array.isArray(tags)
      ? tags.map((t) => String(t || "").trim()).filter(Boolean)
      : typeof tags === "string" && tags.trim()
        ? [tags.trim()]
        : [];
    const unique = Array.from(new Set(tagList));
    if (unique.length > 0) result[normalizedTicker] = unique;
  }
  return result;
}

function normalizeTagDescriptions(input: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!input || typeof input !== "object") return result;
  for (const [tag, desc] of Object.entries(input as Record<string, unknown>)) {
    const label = String(tag || "").trim();
    if (!label) continue;
    result[label] = String(desc || "").trim();
  }
  return result;
}

function mergeTagDescriptions(
  target: Record<string, string>,
  source: Record<string, string>,
) {
  for (const [tag, desc] of Object.entries(source)) {
    const label = String(tag || "").trim();
    if (!label) continue;
    const value = String(desc || "").trim();
    if (value) target[label] = value;
  }
}

function mergeTagsInto(
  target: Record<string, string[]>,
  source: Record<string, string[]>,
) {
  for (const [ticker, tags] of Object.entries(source)) {
    const existing = target[ticker] || [];
    target[ticker] = Array.from(new Set([...existing, ...tags]));
  }
}

function normalizeKeyTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of input) {
    const label = String(tag || "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result;
}

function mergeKeyTags(target: string[], source: string[]) {
  const seen = new Set(target.map((t) => t.toLowerCase()));
  for (const tag of source) {
    const label = String(tag || "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(label);
  }
}

async function ensureAiBuildoutConsolidated() {
  const docs = await CustomWatchlist.find({ resourceTab: DEFAULT_RESOURCE_TAB }).sort({
    order: 1,
    name: 1,
  });
  if (docs.length === 0) return;

  const primary =
    docs.find((d) => d.name === AI_BUILDOUT_NAME) || docs[0];

  if (docs.length === 1 && primary.name === AI_BUILDOUT_NAME) {
    return;
  }

  const mergedTickers = new Set<string>();
  const mergedDescriptions: Record<string, string> = {};
  const mergedTags: Record<string, string[]> = {};
  const mergedTagDescriptions: Record<string, string> = {};
  const mergedKeyTags: string[] = [];
  const mergedDataByTicker: Record<string, any> = {};
  let mergedDescription = "";
  let latestRefreshed: Date | null = null;

  for (const doc of docs) {
    for (const ticker of doc.tickers || []) {
      mergedTickers.add(String(ticker).trim().toUpperCase());
    }
    Object.assign(mergedDescriptions, doc.stockDescriptions || {});
    mergeTagsInto(mergedTags, normalizeStockTags(doc.stockTags || {}));
    mergeTagDescriptions(
      mergedTagDescriptions,
      normalizeTagDescriptions(doc.tagDescriptions || {}),
    );
    mergeKeyTags(mergedKeyTags, normalizeKeyTags(doc.keyTags || []));
    for (const [ticker, sub] of Object.entries(doc.stockSubcategories || {})) {
      const normalizedTicker = String(ticker || "").trim().toUpperCase();
      const subValue = String(sub || "").trim();
      if (!normalizedTicker || !subValue) continue;
      const existing = mergedTags[normalizedTicker] || [];
      if (!existing.includes(subValue)) {
        mergedTags[normalizedTicker] = [...existing, subValue];
      }
    }
    for (const row of doc.data || []) {
      const ticker = String(row?.Ticker || "").trim().toUpperCase();
      if (ticker) mergedDataByTicker[ticker] = row;
    }
    if (!mergedDescription && doc.description) {
      mergedDescription = doc.description;
    }
    if (doc.lastRefreshed) {
      if (!latestRefreshed || doc.lastRefreshed > latestRefreshed) {
        latestRefreshed = doc.lastRefreshed;
      }
    }
  }

  const mergedData = Object.values(mergedDataByTicker);
  const namesToDelete = docs
    .map((d) => d.name)
    .filter((name) => name !== AI_BUILDOUT_NAME);

  await CustomWatchlist.findOneAndUpdate(
    { name: AI_BUILDOUT_NAME },
    {
      name: AI_BUILDOUT_NAME,
      description: mergedDescription,
      order: 0,
      category: UNCATEGORIZED,
      resourceTab: DEFAULT_RESOURCE_TAB,
      tickers: Array.from(mergedTickers),
      stockDescriptions: mergedDescriptions,
      stockSubcategories: {},
      stockTags: mergedTags,
      tagDescriptions: mergedTagDescriptions,
      keyTags: mergedKeyTags,
      data: mergedData,
      lastRefreshed: latestRefreshed,
    },
    { upsert: true, new: true },
  );

  if (namesToDelete.length > 0) {
    await CustomWatchlist.deleteMany({ name: { $in: namesToDelete } });
  }
}

// GET /api/watchlist-cache/custom-watchlist-categories
router.get("/custom-watchlist-categories", async (req: Request, res: Response) => {
  try {
    await connectDB();
    await migrateLegacyResourceTabs();
    const resourceTab = normalizeResourceTab(req.query.resourceTab);
    const docs = await CustomWatchlistCategory.find({ resourceTab }).sort({
      order: 1,
      name: 1,
    });
    return res.json({
      categories: docs.map((d: any) => ({
        name: d.name,
        order: Number.isFinite(d.order) ? d.order : 0,
        resource_tab: d.resourceTab || DEFAULT_RESOURCE_TAB,
      })),
    });
  } catch (error: any) {
    console.error("Error loading custom watchlist categories:", error);
    return res.status(500).json({ error: error.message || "Failed to load custom watchlist categories" });
  }
});

// PUT /api/watchlist-cache/custom-watchlist-categories/:name
// Body: { order?: number }
router.put("/custom-watchlist-categories/:name", async (req: Request, res: Response) => {
  try {
    await connectDB();
    const name = String(req.params.name || "").trim();
    const { order, resource_tab } = req.body || {};
    if (!name) {
      return res.status(400).json({ error: "Category name is required" });
    }
    const normalizedOrder = Number.isFinite(Number(order)) ? Number(order) : 0;
    const resourceTab = normalizeResourceTab(resource_tab);
    const doc = await CustomWatchlistCategory.findOneAndUpdate(
      { name, resourceTab },
      { name, order: normalizedOrder, resourceTab },
      { upsert: true, new: true }
    );
    return res.json({
      name: doc.name,
      order: Number.isFinite(doc.order) ? doc.order : 0,
      resource_tab: doc.resourceTab || DEFAULT_RESOURCE_TAB,
    });
  } catch (error: any) {
    console.error("Error saving custom watchlist category:", error);
    return res.status(500).json({ error: error.message || "Failed to save custom watchlist category" });
  }
});

// DELETE /api/watchlist-cache/custom-watchlist-categories/:name
router.delete("/custom-watchlist-categories/:name", async (req: Request, res: Response) => {
  try {
    await connectDB();
    const name = String(req.params.name || "").trim();
    const resourceTab = normalizeResourceTab(req.query.resourceTab);
    if (!name) {
      return res.status(400).json({ error: "Category name is required" });
    }
    await CustomWatchlistCategory.deleteOne({ name, resourceTab });
    await CustomWatchlist.deleteMany({ category: name, resourceTab });
    return res.json({ ok: true });
  } catch (error: any) {
    console.error("Error deleting custom watchlist category:", error);
    return res.status(500).json({ error: error.message || "Failed to delete custom watchlist category" });
  }
});

// GET /api/watchlist-cache/custom-watchlists
router.get("/custom-watchlists", async (req: Request, res: Response) => {
  try {
    await connectDB();
    await migrateLegacyResourceTabs();
    if (normalizeResourceTab(req.query.resourceTab) === DEFAULT_RESOURCE_TAB) {
      await ensureAiBuildoutConsolidated();
    }
    const resourceTab = normalizeResourceTab(req.query.resourceTab);
    const docs = await CustomWatchlist.find({ resourceTab }).sort({ order: 1, name: 1 });
    return res.json({
      watchlists: docs.map((d: any) => ({
        name: d.name,
        description: d.description || "",
        order: Number.isFinite(d.order) ? d.order : 0,
        category: d.category || "",
        resource_tab: d.resourceTab || DEFAULT_RESOURCE_TAB,
        tickers: d.tickers || [],
        stock_descriptions: d.stockDescriptions || {},
        stock_subcategories: d.stockSubcategories || {},
        stock_tags: d.stockTags || {},
        tag_descriptions: d.tagDescriptions || {},
        key_tags: d.keyTags || [],
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
// Body: { tickers: string[], data?: any[], stock_descriptions?: object, stock_subcategories?: object, description?: string, order?: number, category?: string, last_refreshed?: ISO|null }
router.put("/custom-watchlists/:name", async (req: Request, res: Response) => {
  try {
    await connectDB();
    const name = String(req.params.name || "").trim();
    const { tickers, data, stock_descriptions, stock_subcategories, stock_tags, tag_descriptions, key_tags, description, order, category, last_refreshed, resource_tab } = req.body || {};

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
    const normalizedStockDescriptions: Record<string, string> = {};
    if (stock_descriptions && typeof stock_descriptions === "object") {
      for (const [ticker, desc] of Object.entries(stock_descriptions)) {
        const normalizedTicker = String(ticker || "").trim().toUpperCase();
        if (!normalizedTicker) continue;
        normalizedStockDescriptions[normalizedTicker] = String(desc || "").trim();
      }
    }

    const normalizedStockSubcategories: Record<string, string> = {};
    if (stock_subcategories && typeof stock_subcategories === "object") {
      for (const [ticker, sub] of Object.entries(stock_subcategories)) {
        const normalizedTicker = String(ticker || "").trim().toUpperCase();
        if (!normalizedTicker) continue;
        normalizedStockSubcategories[normalizedTicker] = String(sub || "").trim();
      }
    }
    const normalizedStockTags =
      stock_tags !== undefined ? normalizeStockTags(stock_tags) : undefined;
    const normalizedTagDescriptions =
      tag_descriptions !== undefined
        ? normalizeTagDescriptions(tag_descriptions)
        : undefined;
    const normalizedKeyTags =
      key_tags !== undefined ? normalizeKeyTags(key_tags) : undefined;
    const normalizedDescription = typeof description === "string" ? description : "";
    const normalizedOrder = Number.isFinite(Number(order)) ? Number(order) : 0;
    // Back-compat: older clients/watchlists may not include a category.
    // Defaulting avoids silently failing saves (e.g. stock_subcategories updates).
    const normalizedCategory =
      typeof category === "string" && category.trim()
        ? category.trim()
        : "Uncategorized";
    const resourceTab = normalizeResourceTab(resource_tab);
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
        description: normalizedDescription,
        order: normalizedOrder,
        category: normalizedCategory,
        resourceTab,
        tickers: normalizedTickers,
        stockDescriptions: normalizedStockDescriptions,
        stockSubcategories: normalizedStockSubcategories,
        ...(normalizedStockTags !== undefined
          ? { stockTags: normalizedStockTags }
          : {}),
        ...(normalizedTagDescriptions !== undefined
          ? { tagDescriptions: normalizedTagDescriptions }
          : {}),
        ...(normalizedKeyTags !== undefined ? { keyTags: normalizedKeyTags } : {}),
        data: normalizedData,
        lastRefreshed,
      },
      { upsert: true, new: true }
    );

    return res.json({
      name: doc.name,
      description: doc.description || "",
      order: Number.isFinite(doc.order) ? doc.order : 0,
      category: doc.category || "",
      resource_tab: doc.resourceTab || DEFAULT_RESOURCE_TAB,
      tickers: doc.tickers || [],
      stock_descriptions: doc.stockDescriptions || {},
      stock_subcategories: doc.stockSubcategories || {},
      stock_tags: doc.stockTags || {},
      tag_descriptions: doc.tagDescriptions || {},
      key_tags: doc.keyTags || [],
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

