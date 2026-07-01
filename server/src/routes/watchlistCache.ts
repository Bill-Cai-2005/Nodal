import express, { Request, Response } from "express";
import connectDB from "../utils/connectDB.js";
import CustomWatchlist from "../models/CustomWatchlist.js";

const router = express.Router();
const UNCATEGORIZED = "Uncategorized";
const AI_BUILDOUT_NAME = "AI Buildout";
const AI_APPLICATIONS_NAME = "AI Applications";
const DEFAULT_RESOURCE_TAB = "ai-buildout";
const AREAS_OF_INTEREST_TAB = "watchlist";

const TAB_META_WATCHLIST_NAME = "__tab_description__";

const CONSOLIDATED_TABS: Record<string, string> = {
  "ai-buildout": AI_BUILDOUT_NAME,
  "ai-applications": AI_APPLICATIONS_NAME,
};

function getConsolidatedWatchlistName(resourceTab: string): string | null {
  return CONSOLIDATED_TABS[resourceTab] ?? null;
}

function getResourceTabForWatchlistName(name: string): string | null {
  const normalized = String(name || "").trim().toLowerCase();
  for (const [tab, watchlistName] of Object.entries(CONSOLIDATED_TABS)) {
    if (watchlistName.toLowerCase() === normalized) return tab;
  }
  return null;
}

function normalizeResourceTab(value: unknown): string {
  const tab = String(value || "").trim();
  return tab || DEFAULT_RESOURCE_TAB;
}

async function migrateLegacyResourceTabs() {
  const missingTabFilter = {
    $or: [
      { resourceTab: { $exists: false } },
      { resourceTab: "" },
      { resourceTab: null },
    ],
  };
  await CustomWatchlist.updateMany(
    { name: AI_BUILDOUT_NAME, ...missingTabFilter },
    { $set: { resourceTab: DEFAULT_RESOURCE_TAB } },
  );
  await CustomWatchlist.updateMany(
    { name: { $ne: AI_BUILDOUT_NAME }, ...missingTabFilter },
    { $set: { resourceTab: AREAS_OF_INTEREST_TAB } },
  );
  await CustomWatchlist.updateMany(
    { name: AI_BUILDOUT_NAME, resourceTab: AREAS_OF_INTEREST_TAB },
    { $set: { resourceTab: DEFAULT_RESOURCE_TAB } },
  );
  await CustomWatchlist.updateMany(
    { name: AI_APPLICATIONS_NAME, resourceTab: AREAS_OF_INTEREST_TAB },
    { $set: { resourceTab: "ai-applications" } },
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

async function ensureWatchlistTabIsolation() {
  for (const [resourceTab, watchlistName] of Object.entries(CONSOLIDATED_TABS)) {
    const misplaced = await CustomWatchlist.findOne({
      name: watchlistName,
      resourceTab: AREAS_OF_INTEREST_TAB,
    });
    if (!misplaced) continue;

    const canonical = await CustomWatchlist.findOne({
      name: watchlistName,
      resourceTab,
    });

    if (!canonical) {
      await CustomWatchlist.findOneAndUpdate(
        { name: watchlistName, resourceTab: AREAS_OF_INTEREST_TAB },
        { resourceTab },
      );
      continue;
    }

    const mergedTickers = Array.from(
      new Set([
        ...(canonical.tickers || []),
        ...(misplaced.tickers || []),
      ].map((t) => String(t).trim().toUpperCase()).filter(Boolean)),
    );
    const mergedDescriptions = {
      ...(misplaced.stockDescriptions || {}),
      ...(canonical.stockDescriptions || {}),
    };
    const mergedTags = normalizeStockTags(canonical.stockTags || {});
    mergeTagsInto(mergedTags, normalizeStockTags(misplaced.stockTags || {}));
    const mergedTagDescriptions = normalizeTagDescriptions(
      canonical.tagDescriptions || {},
    );
    mergeTagDescriptions(
      mergedTagDescriptions,
      normalizeTagDescriptions(misplaced.tagDescriptions || {}),
    );
    const mergedKeyTags = normalizeKeyTags(canonical.keyTags || []);
    mergeKeyTags(mergedKeyTags, normalizeKeyTags(misplaced.keyTags || []));
    const mergedDataByTicker: Record<string, any> = {};
    for (const row of [...(misplaced.data || []), ...(canonical.data || [])]) {
      const ticker = String(row?.Ticker || "").trim().toUpperCase();
      if (ticker) mergedDataByTicker[ticker] = row;
    }

    await CustomWatchlist.findOneAndUpdate(
      { name: watchlistName, resourceTab },
      {
        tickers: mergedTickers,
        stockDescriptions: mergedDescriptions,
        stockTags: mergedTags,
        tagDescriptions: mergedTagDescriptions,
        keyTags: mergedKeyTags,
        data: Object.values(mergedDataByTicker),
        lastRefreshed:
          canonical.lastRefreshed && misplaced.lastRefreshed
            ? canonical.lastRefreshed > misplaced.lastRefreshed
              ? canonical.lastRefreshed
              : misplaced.lastRefreshed
            : canonical.lastRefreshed || misplaced.lastRefreshed || null,
      },
    );
    await CustomWatchlist.deleteOne({
      name: watchlistName,
      resourceTab: AREAS_OF_INTEREST_TAB,
    });
  }
}

async function ensureConsolidatedWatchlist(
  resourceTab: string,
  canonicalName: string,
) {
  const docs = await CustomWatchlist.find({
    resourceTab,
    name: { $ne: TAB_META_WATCHLIST_NAME },
  }).sort({
    order: 1,
    name: 1,
  });
  if (docs.length === 0) return;

  const primary =
    docs.find((d) => d.name === canonicalName) || docs[0];

  if (docs.length === 1 && primary.name === canonicalName) {
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
    .filter((name) => name !== canonicalName);

  await CustomWatchlist.findOneAndUpdate(
    { name: canonicalName },
    {
      name: canonicalName,
      description: mergedDescription,
      order: 0,
      category: UNCATEGORIZED,
      resourceTab,
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

// GET /api/watchlist-cache/custom-watchlists
router.get("/custom-watchlists", async (req: Request, res: Response) => {
  try {
    await connectDB();
    await migrateLegacyResourceTabs();
    await ensureWatchlistTabIsolation();
    const resourceTab = normalizeResourceTab(req.query.resourceTab);
    const consolidatedName = getConsolidatedWatchlistName(resourceTab);
    if (consolidatedName) {
      await ensureConsolidatedWatchlist(resourceTab, consolidatedName);
    }
    const consolidatedNames = Object.values(CONSOLIDATED_TABS);
    const watchlistFilter =
      resourceTab === AREAS_OF_INTEREST_TAB
        ? {
            resourceTab,
            name: { $nin: [...consolidatedNames, TAB_META_WATCHLIST_NAME] },
          }
        : consolidatedName
          ? {
              $or: [{ resourceTab }, { name: consolidatedName }],
            }
          : { resourceTab };
    const docs = await CustomWatchlist.find(watchlistFilter).sort({ order: 1, name: 1 });
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
    const canonicalTab = getResourceTabForWatchlistName(name);
    const resourceTab = canonicalTab ?? normalizeResourceTab(resource_tab);
    if (canonicalTab && resourceTab === AREAS_OF_INTEREST_TAB) {
      return res.status(400).json({
        error: `"${name}" belongs on the ${name} tab, not Areas of Interest.`,
      });
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
    const parsedLastRefreshed =
      last_refreshed === null || last_refreshed === undefined
        ? null
        : new Date(last_refreshed);
    const lastRefreshed =
      parsedLastRefreshed && !Number.isNaN(parsedLastRefreshed.getTime())
        ? parsedLastRefreshed
        : null;

    // Overwrite existing watchlist payload so refresh replaces previous rows.
    const existing = await CustomWatchlist.findOne({ name });
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
          : existing?.stockTags
            ? { stockTags: existing.stockTags }
            : {}),
        ...(normalizedTagDescriptions !== undefined
          ? { tagDescriptions: normalizedTagDescriptions }
          : existing?.tagDescriptions
            ? { tagDescriptions: existing.tagDescriptions }
            : {}),
        ...(normalizedKeyTags !== undefined
          ? { keyTags: normalizedKeyTags }
          : existing?.keyTags
            ? { keyTags: existing.keyTags }
            : {}),
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

export default router;

