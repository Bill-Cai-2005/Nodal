import { useEffect, useState, type CSSProperties, type DragEvent } from "react";
import {
  fetchStockData,
  validateTicker,
  type StockData,
} from "../../utils/polygonApi";
import {
  loadWatchlists,
  saveWatchlists,
  type WatchlistCache,
} from "../../utils/watchlistCache";
import {
  deleteCustomWatchlistCategoryFromDb,
  deleteCustomWatchlistFromDb,
  loadCustomWatchlistCategoriesFromDb,
  loadCustomWatchlistsFromDb,
  saveCustomWatchlistCategoryToDb,
  saveCustomWatchlistToDb,
} from "../../utils/watchlistCacheApi";
import { runWithConcurrency } from "../../utils/concurrency";
import CustomWatchlistsTable from "./CustomWatchlistsTable";

const UNCATEGORIZED = "Uncategorized";

const removeKeys = <T extends Record<string, any>>(source: T, keys: string[]): T => {
  if (keys.length === 0) return source;
  const keySet = new Set(keys);
  return Object.fromEntries(Object.entries(source).filter(([key]) => !keySet.has(key))) as T;
};

const iconButtonBaseStyle: CSSProperties = {
  width: "28px",
  height: "28px",
  backgroundColor: "transparent",
  borderRadius: "9999px",
  cursor: "pointer",
  fontWeight: 600,
  lineHeight: 1,
};

const primaryButtonStyle: CSSProperties = {
  padding: "0.75rem 1rem",
  backgroundColor: "#000000",
  color: "#ffffff",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 600,
};

const cancelButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  backgroundColor: "#6b7280",
};

const CustomWatchlists = () => {
  const [watchlists, setWatchlists] = useState<WatchlistCache>({});
  const [watchlistOrder, setWatchlistOrder] = useState<string[]>([]);
  const [watchlistDescriptionByName, setWatchlistDescriptionByName] = useState<Record<string, string>>({});
  const [watchlistCategoryByName, setWatchlistCategoryByName] = useState<Record<string, string>>({});
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [expandedByCategory, setExpandedByCategory] = useState<Record<string, boolean>>({});
  const [stockDescriptionsByWatchlist, setStockDescriptionsByWatchlist] = useState<
    Record<string, Record<string, string>>
  >({});
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showCreateCategoryControls, setShowCreateCategoryControls] = useState(false);
  const [newWatchlistNameByCategory, setNewWatchlistNameByCategory] = useState<Record<string, string>>({});
  const [showCreateWatchlistByCategory, setShowCreateWatchlistByCategory] = useState<Record<string, boolean>>({});
  const [newTickerByWatchlist, setNewTickerByWatchlist] = useState<Record<string, string>>({});
  const [watchlistData, setWatchlistData] = useState<Record<string, StockData[]>>({});
  const [loadingAll, setLoadingAll] = useState(false);
  const [validatingWatchlist, setValidatingWatchlist] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: "" });
  const [expandedByWatchlist, setExpandedByWatchlist] = useState<Record<string, boolean>>({});
  const [editModeByWatchlist, setEditModeByWatchlist] = useState<Record<string, boolean>>({});
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customStart, setCustomStart] = useState<Date>(new Date());
  const [customEnd, setCustomEnd] = useState<Date>(new Date());
  const [sortColumnByWatchlist, setSortColumnByWatchlist] = useState<Record<string, string>>({});
  const [sortAscendingByWatchlist, setSortAscendingByWatchlist] = useState<Record<string, boolean>>({});
  const [draggedWatchlistName, setDraggedWatchlistName] = useState<string | null>(null);
  const [dragOverWatchlistName, setDragOverWatchlistName] = useState<string | null>(null);
  const [draggedCategoryName, setDraggedCategoryName] = useState<string | null>(null);
  const [dragOverCategoryName, setDragOverCategoryName] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [categoriesResp, resp] = await Promise.all([
          loadCustomWatchlistCategoriesFromDb(),
          loadCustomWatchlistsFromDb(),
        ]);
        const dbWatchlists = resp.watchlists || [];
        const dbCategories = categoriesResp.categories || [];
        if (dbWatchlists.length > 0) {
          const watchlistsMap: WatchlistCache = {};
          const watchlistDataMap: Record<string, StockData[]> = {};
          const watchlistDescriptions: Record<string, string> = {};
          const watchlistCategories: Record<string, string> = {};
          const stockDescriptions: Record<string, Record<string, string>> = {};
          const orderedNames = [...dbWatchlists]
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((w) => w.name);
          for (const w of dbWatchlists) {
            watchlistsMap[w.name] = w.tickers || [];
            watchlistDataMap[w.name] = (w.data || []) as StockData[];
            watchlistDescriptions[w.name] = w.description || "";
            watchlistCategories[w.name] = (w.category || "").trim();
            stockDescriptions[w.name] = w.stock_descriptions || {};
          }
          const categoriesFromWatchlists = Array.from(new Set(Object.values(watchlistCategories)))
            .filter(Boolean);
          const orderedCategories = [
            ...dbCategories
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .map((c) => c.name),
            ...categoriesFromWatchlists.filter((c) => !dbCategories.some((x) => x.name === c)),
          ];
          setWatchlists(watchlistsMap);
          setWatchlistOrder(orderedNames);
          setWatchlistDescriptionByName(watchlistDescriptions);
          setWatchlistCategoryByName(watchlistCategories);
          setCategoryOrder(orderedCategories);
          setExpandedByCategory(Object.fromEntries(orderedCategories.map((category) => [category, true])));
          setStockDescriptionsByWatchlist(stockDescriptions);
          setWatchlistData(watchlistDataMap);
          saveWatchlists(watchlistsMap);
          return;
        }
      } catch (e) {
        console.warn("Failed to load custom watchlists from DB, falling back to local cache:", e);
      }

      const loaded = loadWatchlists();
      setWatchlists(loaded);
      setWatchlistOrder(Object.keys(loaded));
      setWatchlistCategoryByName({});
      setExpandedByCategory({});
    })();
  }, []);

  useEffect(() => {
    if (useCustomRange) return;
    setSortColumnByWatchlist((prev) => {
      const next: Record<string, string> = {};
      for (const [name, col] of Object.entries(prev)) {
        next[name] = col === "Custom Dates Change %" ? "" : col;
      }
      return next;
    });
  }, [useCustomRange]);

  const saveWatchlist = async (
    watchlistName: string,
    nextTickers: string[],
    nextData: StockData[],
    nextLastRefreshed: string | null = null,
    overrides?: {
      description?: string;
      order?: number;
      category?: string;
      stockDescriptions?: Record<string, string>;
    }
  ) => {
    const nextDescription = overrides?.description ?? watchlistDescriptionByName[watchlistName] ?? "";
    const nextOrder = overrides?.order ?? Math.max(0, watchlistOrder.indexOf(watchlistName));
    const nextCategory = overrides?.category ?? watchlistCategoryByName[watchlistName] ?? "";
    const nextStockDescriptions =
      overrides?.stockDescriptions ?? stockDescriptionsByWatchlist[watchlistName] ?? {};
    await saveCustomWatchlistToDb(watchlistName, nextTickers, nextData, nextLastRefreshed, {
      description: nextDescription,
      order: nextOrder,
      category: nextCategory,
      stockDescriptions: nextStockDescriptions,
    });
  };

  const handleCreateWatchlist = async (categoryName: string) => {
    const name = (newWatchlistNameByCategory[categoryName] || "").trim();
    if (!name) {
      alert("Please enter a watchlist name");
      return;
    }
    if (watchlists[name]) {
      alert("Watchlist already exists");
      return;
    }
    const updated = { ...watchlists, [name]: [] };
    const nextOrder = [...watchlistOrder, name];
    setWatchlists(updated);
    setWatchlistOrder(nextOrder);
    setWatchlistDescriptionByName((prev) => ({ ...prev, [name]: "" }));
    setWatchlistCategoryByName((prev) => ({ ...prev, [name]: categoryName }));
    setStockDescriptionsByWatchlist((prev) => ({ ...prev, [name]: {} }));
    saveWatchlists(updated);
    setExpandedByWatchlist((prev) => ({ ...prev, [name]: true }));
    setEditModeByWatchlist((prev) => ({ ...prev, [name]: true }));
    setSortAscendingByWatchlist((prev) => ({ ...prev, [name]: true }));
    setNewWatchlistNameByCategory((prev) => ({ ...prev, [categoryName]: "" }));
    setShowCreateWatchlistByCategory((prev) => ({ ...prev, [categoryName]: false }));
    try {
      await saveWatchlist(name, [], [], null, {
        description: "",
        order: nextOrder.length - 1,
        category: categoryName,
        stockDescriptions: {},
      });
    } catch (e: any) {
      alert(`Created locally but failed to save watchlist to DB: ${e.message}`);
    }
  };

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      alert("Please enter a category name");
      return;
    }
    if (name === UNCATEGORIZED || categoryOrder.includes(name)) {
      alert("Category already exists");
      return;
    }
    const nextOrder = [...categoryOrder, name];
    setCategoryOrder(nextOrder);
    setExpandedByCategory((prev) => ({ ...prev, [name]: true }));
    setNewCategoryName("");
    setShowCreateCategoryControls(false);
    try {
      await saveCustomWatchlistCategoryToDb(name, nextOrder.length - 1);
    } catch (e: any) {
      alert(`Created category locally but failed to sync DB: ${e.message}`);
    }
  };

  const handleDeleteCategory = async (category: string) => {
    if (!confirm(`Delete category "${category}"? This will also delete all watchlists in it.`)) return;
    const affectedWatchlists = Object.keys(watchlists).filter(
      (watchlistName) => (watchlistCategoryByName[watchlistName] || "") === category
    );
    const nextWatchlists = removeKeys({ ...watchlists }, affectedWatchlists);
    const nextWatchlistData = removeKeys({ ...watchlistData }, affectedWatchlists);
    const nextDescriptions = removeKeys({ ...watchlistDescriptionByName }, affectedWatchlists);
    const nextStockDescriptions = removeKeys({ ...stockDescriptionsByWatchlist }, affectedWatchlists);
    const nextExpandedByWatchlist = removeKeys({ ...expandedByWatchlist }, affectedWatchlists);
    const nextEditModeByWatchlist = removeKeys({ ...editModeByWatchlist }, affectedWatchlists);
    const nextSortColumnByWatchlist = removeKeys({ ...sortColumnByWatchlist }, affectedWatchlists);
    const nextSortAscendingByWatchlist = removeKeys({ ...sortAscendingByWatchlist }, affectedWatchlists);
    const nextNewTickerByWatchlist = removeKeys({ ...newTickerByWatchlist }, affectedWatchlists);
    const nextWatchlistCategoryByName = removeKeys({ ...watchlistCategoryByName }, affectedWatchlists);
    const nextWatchlistOrder = watchlistOrder.filter((name) => !affectedWatchlists.includes(name));

    setWatchlists(nextWatchlists);
    saveWatchlists(nextWatchlists);
    setWatchlistData(nextWatchlistData);
    setWatchlistDescriptionByName(nextDescriptions);
    setStockDescriptionsByWatchlist(nextStockDescriptions);
    setExpandedByWatchlist(nextExpandedByWatchlist);
    setEditModeByWatchlist(nextEditModeByWatchlist);
    setSortColumnByWatchlist(nextSortColumnByWatchlist);
    setSortAscendingByWatchlist(nextSortAscendingByWatchlist);
    setNewTickerByWatchlist(nextNewTickerByWatchlist);
    setWatchlistCategoryByName(nextWatchlistCategoryByName);
    setWatchlistOrder(nextWatchlistOrder);
    setCategoryOrder((prev) => prev.filter((name) => name !== category));
    setExpandedByCategory((prev) => {
      const next = { ...prev };
      delete next[category];
      return next;
    });
    try {
      await deleteCustomWatchlistCategoryFromDb(category);
    } catch (e: any) {
      alert(`Deleted category locally but failed to sync DB: ${e.message}`);
    }
  };

  const handleAddTicker = async (watchlistName: string) => {
    const inputTicker = (newTickerByWatchlist[watchlistName] || "").trim();
    if (!inputTicker) {
      alert("Please enter a ticker");
      return;
    }
    const ticker = inputTicker.toUpperCase();
    if ((watchlists[watchlistName] || []).includes(ticker)) {
      alert(`${ticker} already in watchlist`);
      return;
    }

    try {
      setValidatingWatchlist(watchlistName);
      setProgress({ current: 0, total: 0, message: `Validating ${ticker}...` });
      const validation = await validateTicker(ticker);
      if (!validation.valid) {
        alert(validation.reason || "Invalid ticker");
        return;
      }
      const updated = {
        ...watchlists,
        [watchlistName]: [...(watchlists[watchlistName] || []), ticker],
      };
      const nextStockDescriptions = {
        ...(stockDescriptionsByWatchlist[watchlistName] || {}),
        [ticker]: stockDescriptionsByWatchlist[watchlistName]?.[ticker] || "",
      };
      setWatchlists(updated);
      setStockDescriptionsByWatchlist((prev) => ({ ...prev, [watchlistName]: nextStockDescriptions }));
      saveWatchlists(updated);
      setNewTickerByWatchlist((prev) => ({ ...prev, [watchlistName]: "" }));
      try {
        await saveWatchlist(watchlistName, updated[watchlistName] || [], watchlistData[watchlistName] || [], null, {
          stockDescriptions: nextStockDescriptions,
        });
      } catch (e: any) {
        alert(`Added locally but failed to sync DB: ${e.message}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setValidatingWatchlist(null);
    }
  };

  const handleRemoveTicker = async (watchlistName: string, ticker: string) => {
    const updated = {
      ...watchlists,
      [watchlistName]: (watchlists[watchlistName] || []).filter((t) => t !== ticker),
    };
    const filteredData = (watchlistData[watchlistName] || []).filter((row) => row.Ticker !== ticker);
    const nextStockDescriptions = { ...(stockDescriptionsByWatchlist[watchlistName] || {}) };
    delete nextStockDescriptions[ticker];

    setWatchlists(updated);
    saveWatchlists(updated);
    setWatchlistData((prev) => ({ ...prev, [watchlistName]: filteredData }));
    setStockDescriptionsByWatchlist((prev) => ({ ...prev, [watchlistName]: nextStockDescriptions }));
    try {
      await saveWatchlist(watchlistName, updated[watchlistName] || [], filteredData, null, {
        stockDescriptions: nextStockDescriptions,
      });
    } catch (e: any) {
      alert(`Removed locally but failed to sync DB: ${e.message}`);
    }
  };

  const persistWatchlistOrder = async (nextOrder: string[]) => {
    setWatchlistOrder(nextOrder);
    try {
      await Promise.all(
        nextOrder.map((name, index) =>
          saveWatchlist(name, watchlists[name] || [], watchlistData[name] || [], null, { order: index })
        )
      );
    } catch (e: any) {
      alert(`Order changed locally but failed to sync DB: ${e.message}`);
    }
  };

  const persistCategoryOrder = async (nextOrder: string[]) => {
    setCategoryOrder(nextOrder);
    try {
      await Promise.all(nextOrder.map((name, index) => saveCustomWatchlistCategoryToDb(name, index)));
    } catch (e: any) {
      alert(`Category order changed locally but failed to sync DB: ${e.message}`);
    }
  };

  const getRenderableWatchlistNames = () => {
    const orderedWatchlistNames = watchlistOrder.filter((name) => Boolean(watchlists[name]));
    const unorderedWatchlistNames = Object.keys(watchlists).filter((name) => !orderedWatchlistNames.includes(name));
    return [...orderedWatchlistNames, ...unorderedWatchlistNames];
  };

  const handleWatchlistDragStart = (event: DragEvent<HTMLDivElement>, watchlistName: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", watchlistName);
    setDraggedWatchlistName(watchlistName);
  };

  const handleWatchlistDragOver = (event: DragEvent<HTMLDivElement>, watchlistName: string) => {
    event.preventDefault();
    if (draggedWatchlistName && draggedWatchlistName !== watchlistName) {
      setDragOverWatchlistName(watchlistName);
    }
  };

  const handleWatchlistDrop = async (event: DragEvent<HTMLDivElement>, targetWatchlistName: string) => {
    event.preventDefault();
    const sourceWatchlistName = draggedWatchlistName || event.dataTransfer.getData("text/plain");
    if (!sourceWatchlistName || sourceWatchlistName === targetWatchlistName) {
      setDragOverWatchlistName(null);
      setDraggedWatchlistName(null);
      return;
    }
    const sourceCategory = watchlistCategoryByName[sourceWatchlistName] || "";
    const targetCategory = watchlistCategoryByName[targetWatchlistName] || "";
    if (!sourceCategory || sourceCategory !== targetCategory) {
      setDragOverWatchlistName(null);
      setDraggedWatchlistName(null);
      return;
    }

    const currentOrder = getRenderableWatchlistNames();
    const sourceIndex = currentOrder.indexOf(sourceWatchlistName);
    const targetIndex = currentOrder.indexOf(targetWatchlistName);
    if (sourceIndex < 0 || targetIndex < 0) {
      setDragOverWatchlistName(null);
      setDraggedWatchlistName(null);
      return;
    }

    const nextOrder = [...currentOrder];
    nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, sourceWatchlistName);
    setDragOverWatchlistName(null);
    setDraggedWatchlistName(null);
    await persistWatchlistOrder(nextOrder);
  };

  const handleWatchlistDragEnd = () => {
    setDraggedWatchlistName(null);
    setDragOverWatchlistName(null);
  };

  const handleCategoryDragStart = (event: DragEvent<HTMLDivElement>, categoryName: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", categoryName);
    setDraggedCategoryName(categoryName);
  };

  const handleCategoryDragOver = (event: DragEvent<HTMLDivElement>, categoryName: string) => {
    event.preventDefault();
    if (draggedCategoryName && draggedCategoryName !== categoryName) {
      setDragOverCategoryName(categoryName);
    }
  };

  const handleCategoryDrop = async (event: DragEvent<HTMLDivElement>, targetCategoryName: string) => {
    event.preventDefault();
    const sourceCategoryName = draggedCategoryName || event.dataTransfer.getData("text/plain");
    if (!sourceCategoryName || sourceCategoryName === targetCategoryName) {
      setDraggedCategoryName(null);
      setDragOverCategoryName(null);
      return;
    }
    const sourceIndex = categoryOrder.indexOf(sourceCategoryName);
    const targetIndex = categoryOrder.indexOf(targetCategoryName);
    if (sourceIndex < 0 || targetIndex < 0) {
      setDraggedCategoryName(null);
      setDragOverCategoryName(null);
      return;
    }
    const nextOrder = [...categoryOrder];
    nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, sourceCategoryName);
    setDraggedCategoryName(null);
    setDragOverCategoryName(null);
    await persistCategoryOrder(nextOrder);
  };

  const handleCategoryDragEnd = () => {
    setDraggedCategoryName(null);
    setDragOverCategoryName(null);
  };

  const handleSaveWatchlistDescription = async (watchlistName: string) => {
    try {
      await saveWatchlist(
        watchlistName,
        watchlists[watchlistName] || [],
        watchlistData[watchlistName] || [],
        null,
        { description: watchlistDescriptionByName[watchlistName] || "" }
      );
    } catch (e: any) {
      alert(`Saved locally but failed to sync watchlist description: ${e.message}`);
    }
  };

  const handleSaveStockDescription = async (watchlistName: string, ticker: string, description: string) => {
    const nextStockDescriptions = {
      ...(stockDescriptionsByWatchlist[watchlistName] || {}),
      [ticker]: description,
    };
    setStockDescriptionsByWatchlist((prev) => ({ ...prev, [watchlistName]: nextStockDescriptions }));
    try {
      await saveWatchlist(watchlistName, watchlists[watchlistName] || [], watchlistData[watchlistName] || [], null, {
        stockDescriptions: nextStockDescriptions,
      });
    } catch (e: any) {
      alert(`Saved locally but failed to sync stock description: ${e.message}`);
    }
  };

  const handleDeleteWatchlist = async (watchlistName: string) => {
    if (!confirm(`Delete watchlist "${watchlistName}"?`)) return;
    const updated = { ...watchlists };
    delete updated[watchlistName];
    setWatchlists(updated);
    setWatchlistOrder((prev) => prev.filter((name) => name !== watchlistName));
    saveWatchlists(updated);
    setWatchlistData((prev) => {
      const next = { ...prev };
      delete next[watchlistName];
      return next;
    });
    setExpandedByWatchlist((prev) => {
      const next = { ...prev };
      delete next[watchlistName];
      return next;
    });
    setEditModeByWatchlist((prev) => {
      const next = { ...prev };
      delete next[watchlistName];
      return next;
    });
    setWatchlistDescriptionByName((prev) => {
      const next = { ...prev };
      delete next[watchlistName];
      return next;
    });
    setWatchlistCategoryByName((prev) => {
      const next = { ...prev };
      delete next[watchlistName];
      return next;
    });
    setStockDescriptionsByWatchlist((prev) => {
      const next = { ...prev };
      delete next[watchlistName];
      return next;
    });
    setSortColumnByWatchlist((prev) => {
      const next = { ...prev };
      delete next[watchlistName];
      return next;
    });
    setSortAscendingByWatchlist((prev) => {
      const next = { ...prev };
      delete next[watchlistName];
      return next;
    });
    setNewTickerByWatchlist((prev) => {
      const next = { ...prev };
      delete next[watchlistName];
      return next;
    });
    try {
      await deleteCustomWatchlistFromDb(watchlistName);
    } catch (e: any) {
      alert(`Deleted locally but failed to delete in DB: ${e.message}`);
    }
  };

  const handleRefreshAllWatchlists = async () => {
    const watchlistNames = Object.keys(watchlists);
    const totalTickers = watchlistNames.reduce((acc, name) => acc + (watchlists[name]?.length || 0), 0);
    if (totalTickers === 0) {
      alert("No tickers available to refresh.");
      return;
    }

    try {
      setLoadingAll(true);
      setProgress({ current: 0, total: totalTickers, message: "Fetching full data..." });

      let completed = 0;
      const nextData: Record<string, StockData[]> = { ...watchlistData };
      const existingByWatchlistAndTicker: Record<string, Record<string, StockData>> = {};
      for (const watchlistName of watchlistNames) {
        existingByWatchlistAndTicker[watchlistName] = Object.fromEntries(
          (watchlistData[watchlistName] || []).map((row) => [row.Ticker, row])
        );
      }
      const tasks = watchlistNames.flatMap((watchlistName) =>
        (watchlists[watchlistName] || []).map((ticker) => ({ watchlistName, ticker }))
      );
      const rowsByWatchlistAndTicker: Record<string, Record<string, StockData>> = {};
      await runWithConcurrency(tasks, 24, async ({ watchlistName, ticker }) => {
        const fetched = await fetchStockData(
          ticker,
          undefined,
          undefined
        );
        const existing = existingByWatchlistAndTicker[watchlistName]?.[ticker];
        const row: StockData = {
          ...fetched,
          // Refresh should never compute or overwrite custom-range data.
          "Custom Dates Change %": existing?.["Custom Dates Change %"] ?? null,
        };
        if (!rowsByWatchlistAndTicker[watchlistName]) rowsByWatchlistAndTicker[watchlistName] = {};
        rowsByWatchlistAndTicker[watchlistName][ticker] = row;
        completed += 1;
        if (completed % 10 === 0 || completed === totalTickers) {
          setProgress({
            current: completed,
            total: totalTickers,
            message: `Refreshing watchlists (${completed}/${totalTickers})...`,
          });
        }
      });

      for (const watchlistName of watchlistNames) {
        const tickers = watchlists[watchlistName] || [];
        const results = tickers
          .map((ticker) => rowsByWatchlistAndTicker[watchlistName]?.[ticker])
          .filter(Boolean) as StockData[];
        nextData[watchlistName] = results;
      }

      await Promise.all(
        watchlistNames.map(async (watchlistName) => {
          try {
            await saveCustomWatchlistToDb(
              watchlistName,
              watchlists[watchlistName] || [],
              nextData[watchlistName] || [],
              new Date().toISOString(),
              {
                description: watchlistDescriptionByName[watchlistName] || "",
                order: Math.max(0, watchlistOrder.indexOf(watchlistName)),
                category: watchlistCategoryByName[watchlistName] || categoryOrder[0] || "",
                stockDescriptions: stockDescriptionsByWatchlist[watchlistName] || {},
              }
            );
          } catch (e: any) {
            alert(`Refreshed locally for "${watchlistName}" but failed to save refreshed data to DB: ${e.message}`);
          }
        })
      );

      setWatchlistData(nextData);
      setProgress({ current: 0, total: 0, message: "Refresh complete." });
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoadingAll(false);
    }
  };

  const handleLoadHistoricalData = async () => {
    if (!useCustomRange) {
      alert("Enable 'Use Custom Time Range' first.");
      return;
    }
    const watchlistNames = Object.keys(watchlists);
    const hasMarketData = watchlistNames.some((name) => (watchlistData[name] || []).length > 0);
    if (!hasMarketData) {
      alert("Refresh watchlists first to load market data.");
      return;
    }

    const existingByWatchlistAndTicker: Record<string, Record<string, StockData>> = {};
    for (const watchlistName of watchlistNames) {
      existingByWatchlistAndTicker[watchlistName] = Object.fromEntries(
        (watchlistData[watchlistName] || []).map((row) => [row.Ticker, row])
      );
    }

    const tasks = watchlistNames.flatMap((watchlistName) =>
      (watchlists[watchlistName] || [])
        .filter((ticker) => Boolean(existingByWatchlistAndTicker[watchlistName]?.[ticker]))
        .map((ticker) => ({ watchlistName, ticker }))
    );

    if (tasks.length === 0) {
      setProgress({ current: 0, total: 0, message: "No market rows available to load historical data." });
      return;
    }

    try {
      setLoadingAll(true);
      setProgress({ current: 0, total: tasks.length, message: "Loading historical data for missing tickers..." });
      let completed = 0;
      const customByWatchlistAndTicker: Record<string, Record<string, number | null>> = {};

      await runWithConcurrency(tasks, 24, async ({ watchlistName, ticker }) => {
        const row = await fetchStockData(ticker, customStart, customEnd, undefined, { includeReference: false });
        if (!customByWatchlistAndTicker[watchlistName]) customByWatchlistAndTicker[watchlistName] = {};
        customByWatchlistAndTicker[watchlistName][ticker] = row["Custom Dates Change %"];
        completed += 1;
        if (completed % 10 === 0 || completed === tasks.length) {
          setProgress({
            current: completed,
            total: tasks.length,
            message: "Loading historical data for missing tickers...",
          });
        }
      });

      setWatchlistData((prev) => {
        const next: Record<string, StockData[]> = { ...prev };
        for (const watchlistName of watchlistNames) {
          next[watchlistName] = (prev[watchlistName] || []).map((row) => {
            const value = customByWatchlistAndTicker[watchlistName]?.[row.Ticker];
            if (value === undefined) return row;
            return {
              ...row,
              "Custom Dates Change %": value,
            };
          });
        }
        return next;
      });

      // Intentionally do not persist historical/custom-range data.
      setProgress({ current: 0, total: 0, message: "Historical data loaded." });
    } catch (err: any) {
      alert(`Error loading historical data: ${err.message}`);
    } finally {
      setLoadingAll(false);
    }
  };

  const formatValue = (value: number | null): string => {
    if (value === null) return "N/A";
    if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    if (typeof value === "number") return value.toFixed(2);
    return String(value);
  };

  const watchlistNames = getRenderableWatchlistNames();
  const hasMarketData = watchlistNames.some((name) => (watchlistData[name] || []).length > 0);
  const renderedCategories = [
    ...categoryOrder,
    ...(Object.values(watchlistCategoryByName).filter(
      (category, idx, arr) => Boolean(category) && arr.indexOf(category) === idx
    ) || []).filter((category) => !categoryOrder.includes(category)),
  ];

  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap", marginBottom: "1rem" }}>
          <button
            type="button"
            onClick={handleRefreshAllWatchlists}
            disabled={loadingAll || Boolean(validatingWatchlist)}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: "#000000",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              cursor: loadingAll || validatingWatchlist ? "not-allowed" : "pointer",
              fontSize: "0.875rem",
              fontWeight: 600,
              opacity: loadingAll || validatingWatchlist ? 0.6 : 1,
            }}
          >
            {loadingAll ? "Refreshing..." : "Refresh All Watchlists"}
          </button>
        </div>

        {hasMarketData && (
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", justifyContent: "center", flexWrap: "wrap", marginBottom: "1rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                checked={useCustomRange}
                onChange={(e) => setUseCustomRange(e.target.checked)}
              />
              Use Custom Time Range
            </label>
            {useCustomRange && (
              <>
                <input
                  type="date"
                  value={customStart.toISOString().split("T")[0]}
                  onChange={(e) => setCustomStart(new Date(e.target.value))}
                  style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}
                />
                <input
                  type="date"
                  value={customEnd.toISOString().split("T")[0]}
                  onChange={(e) => setCustomEnd(new Date(e.target.value))}
                  style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}
                />
                <button
                  type="button"
                  onClick={handleLoadHistoricalData}
                  disabled={loadingAll || Boolean(validatingWatchlist)}
                  style={{
                    padding: "0.65rem 1rem",
                    backgroundColor: "#000000",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    cursor: loadingAll || validatingWatchlist ? "not-allowed" : "pointer",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    opacity: loadingAll || validatingWatchlist ? 0.6 : 1,
                  }}
                >
                  Load Historical Data
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {progress.message && (
        <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "#f0f0f0", borderRadius: "4px" }}>
          {progress.message}
          {progress.total > 0 && ` (${progress.current}/${progress.total})`}
        </div>
      )}

      {watchlistNames.length === 0 && (
        <div style={{ padding: "2rem", textAlign: "center", color: "#666666" }}>
          {renderedCategories.length === 0
            ? "Create your first category to get started."
            : "No watchlists created yet. Create one inside a category."}
        </div>
      )}

      {renderedCategories.map((category) => {
        const watchlistsInCategory = watchlistNames.filter(
          (watchlistName) => (watchlistCategoryByName[watchlistName] || "") === category
        );
        const isCategoryExpanded = expandedByCategory[category] ?? true;

        return (
          <div
            key={`category-${category}`}
            draggable
            onDragStart={(event) => handleCategoryDragStart(event, category)}
            onDragOver={(event) => handleCategoryDragOver(event, category)}
            onDrop={(event) => void handleCategoryDrop(event, category)}
            onDragEnd={handleCategoryDragEnd}
            style={{
              marginBottom: "1.25rem",
              border: dragOverCategoryName === category ? "2px dashed #111827" : "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "1rem",
              backgroundColor: "#f8fafc",
              opacity: draggedCategoryName === category ? 0.65 : 1,
            }}
          >
            <div
              onClick={() =>
                setExpandedByCategory((prev) => ({ ...prev, [category]: !isCategoryExpanded }))
              }
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: isCategoryExpanded ? "0.75rem" : 0,
                gap: "0.75rem",
                flexWrap: "wrap",
                cursor: "pointer",
              }}
            >
              <div>
                <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: "1.1rem", marginBottom: "0.25rem" }}>
                  {category}
                </h2>
                <span style={{ fontSize: "0.85rem", color: "#666666" }}>{watchlistsInCategory.length} watchlists</span>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {!showCreateWatchlistByCategory[category] ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCreateWatchlistByCategory((prev) => ({ ...prev, [category]: true }));
                    }}
                    style={{
                      ...iconButtonBaseStyle,
                      color: "#374151",
                      border: "1px solid #d1d5db",
                      fontSize: "1rem",
                    }}
                    title="Create watchlist"
                    aria-label="Create watchlist"
                  >
                    +
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCreateWatchlistByCategory((prev) => ({ ...prev, [category]: false }));
                      setNewWatchlistNameByCategory((prev) => ({ ...prev, [category]: "" }));
                    }}
                    style={{
                      ...iconButtonBaseStyle,
                      color: "#6b7280",
                      border: "1px solid #d1d5db",
                      fontSize: "1rem",
                    }}
                    title="Cancel create"
                    aria-label="Cancel create"
                  >
                    -
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCategory(category);
                  }}
                  style={{
                    ...iconButtonBaseStyle,
                    color: "#b91c1c",
                    border: "1px solid #fecaca",
                    fontSize: "1rem",
                  }}
                  title="Delete category"
                  aria-label="Delete category"
                >
                  ×
                </button>
              </div>
            </div>

            {isCategoryExpanded && (
              <>
                {showCreateWatchlistByCategory[category] && (
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                    <input
                      type="text"
                      value={newWatchlistNameByCategory[category] || ""}
                      onChange={(e) =>
                        setNewWatchlistNameByCategory((prev) => ({ ...prev, [category]: e.target.value }))
                      }
                      placeholder="Watchlist Name"
                      style={{ padding: "0.75rem", borderRadius: "4px", border: "1px solid #ccc", minWidth: "220px" }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleCreateWatchlist(category);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void handleCreateWatchlist(category)}
                      style={primaryButtonStyle}
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateWatchlistByCategory((prev) => ({ ...prev, [category]: false }));
                        setNewWatchlistNameByCategory((prev) => ({ ...prev, [category]: "" }));
                      }}
                      style={cancelButtonStyle}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {watchlistsInCategory.length === 0 && (
                  <div style={{ padding: "0.75rem", color: "#6b7280", fontSize: "0.9rem" }}>
                    No watchlists in this category.
                  </div>
                )}
                {watchlistsInCategory.map((watchlistName) => {
                  const isExpanded = expandedByWatchlist[watchlistName] ?? true;
                  const isEditing = editModeByWatchlist[watchlistName] ?? false;
                  const isBusy = loadingAll || validatingWatchlist === watchlistName;
                  const tickers = watchlists[watchlistName] || [];
                  const currentData = watchlistData[watchlistName] || [];

                  return (
                    <div
                      key={watchlistName}
                      draggable
                      onDragStart={(event) => handleWatchlistDragStart(event, watchlistName)}
                      onDragOver={(event) => handleWatchlistDragOver(event, watchlistName)}
                      onDrop={(event) => void handleWatchlistDrop(event, watchlistName)}
                      onDragEnd={handleWatchlistDragEnd}
                      style={{
                        marginBottom: "1rem",
                        border: dragOverWatchlistName === watchlistName ? "2px dashed #111827" : "1px solid #e2e8f0",
                        borderRadius: "8px",
                        padding: "1rem",
                        backgroundColor: "#ffffff",
                        opacity: draggedWatchlistName === watchlistName ? 0.65 : 1,
                      }}
                    >
                      <div
                        onClick={() =>
                          setExpandedByWatchlist((prev) => ({ ...prev, [watchlistName]: !isExpanded }))
                        }
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: isExpanded ? "1rem" : 0,
                          gap: "0.75rem",
                          flexWrap: "wrap",
                          cursor: "pointer",
                        }}
                      >
                        <div>
                          <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: "1.2rem", marginBottom: "0.25rem" }}>
                            {watchlistName}
                          </h2>
                          <span style={{ fontSize: "0.85rem", color: "#666666" }}>{tickers.length} tickers</span>
                          {(watchlistDescriptionByName[watchlistName] || "").trim() && (
                            <div style={{ fontSize: "0.85rem", color: "#4b5563", marginTop: "0.35rem" }}>
                              {watchlistDescriptionByName[watchlistName]}
                            </div>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditModeByWatchlist((prev) => ({ ...prev, [watchlistName]: !isEditing }));
                            }}
                            style={{
                              ...iconButtonBaseStyle,
                              color: isEditing ? "#047857" : "#374151",
                              border: "1px solid #d1d5db",
                              fontSize: "0.9rem",
                            }}
                            title={isEditing ? "Done editing" : "Edit watchlist"}
                            aria-label={isEditing ? "Done editing" : "Edit watchlist"}
                          >
                            {isEditing ? "✓" : "✎"}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteWatchlist(watchlistName);
                            }}
                            disabled={isBusy}
                            style={{
                              ...iconButtonBaseStyle,
                              color: "#b91c1c",
                              border: "1px solid #fecaca",
                              cursor: isBusy ? "not-allowed" : "pointer",
                              fontSize: "1rem",
                              opacity: isBusy ? 0.6 : 1,
                            }}
                            title="Delete watchlist"
                            aria-label="Delete watchlist"
                          >
                            ×
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <>
                          {isEditing && (
                            <div
                              style={{
                                marginBottom: "1rem",
                                padding: "1rem",
                                border: "1px solid #e5e7eb",
                                borderRadius: "6px",
                                backgroundColor: "#fafafa",
                              }}
                            >
                              <div style={{ marginBottom: "0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                                <input
                                  type="text"
                                  value={watchlistDescriptionByName[watchlistName] || ""}
                                  onChange={(e) =>
                                    setWatchlistDescriptionByName((prev) => ({
                                      ...prev,
                                      [watchlistName]: e.target.value,
                                    }))
                                  }
                                  placeholder="Watchlist Description"
                                  style={{ padding: "0.65rem", borderRadius: "4px", border: "1px solid #ccc", minWidth: "280px" }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveWatchlistDescription(watchlistName)}
                                  disabled={isBusy}
                                  style={{
                                    padding: "0.65rem 1rem",
                                    backgroundColor: "#000000",
                                    color: "#ffffff",
                                    border: "none",
                                    borderRadius: "6px",
                                    cursor: isBusy ? "not-allowed" : "pointer",
                                    fontSize: "0.85rem",
                                    fontWeight: 600,
                                    opacity: isBusy ? 0.6 : 1,
                                  }}
                                >
                                  Save Description
                                </button>
                              </div>

                              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                                <input
                                  type="text"
                                  value={newTickerByWatchlist[watchlistName] || ""}
                                  onChange={(e) =>
                                    setNewTickerByWatchlist((prev) => ({
                                      ...prev,
                                      [watchlistName]: e.target.value.toUpperCase(),
                                    }))
                                  }
                                  placeholder="Add Ticker"
                                  style={{ padding: "0.65rem", borderRadius: "4px", border: "1px solid #ccc", width: "150px" }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleAddTicker(watchlistName);
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleAddTicker(watchlistName)}
                                  disabled={isBusy}
                                  style={{
                                    padding: "0.65rem 1rem",
                                    backgroundColor: "#000000",
                                    color: "#ffffff",
                                    border: "none",
                                    borderRadius: "6px",
                                    cursor: isBusy ? "not-allowed" : "pointer",
                                    fontSize: "0.85rem",
                                    fontWeight: 600,
                                    opacity: isBusy ? 0.6 : 1,
                                  }}
                                >
                                  {validatingWatchlist === watchlistName ? "Validating..." : "Add Ticker"}
                                </button>
                              </div>

                              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                                {tickers.map((ticker) => (
                                  <div
                                    key={`${watchlistName}-${ticker}`}
                                    style={{
                                      padding: "0.4rem 0.75rem",
                                      background: "#f0f0f0",
                                      borderRadius: "4px",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "0.4rem",
                                    }}
                                  >
                                    <span>{ticker}</span>
                                    <input
                                      type="text"
                                      value={stockDescriptionsByWatchlist[watchlistName]?.[ticker] || ""}
                                      onChange={(e) =>
                                        setStockDescriptionsByWatchlist((prev) => ({
                                          ...prev,
                                          [watchlistName]: {
                                            ...(prev[watchlistName] || {}),
                                            [ticker]: e.target.value,
                                          },
                                        }))
                                      }
                                      onBlur={(e) => handleSaveStockDescription(watchlistName, ticker, e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          handleSaveStockDescription(
                                            watchlistName,
                                            ticker,
                                            (e.currentTarget as HTMLInputElement).value
                                          );
                                        }
                                      }}
                                      placeholder="Stock description"
                                      style={{
                                        padding: "0.35rem 0.5rem",
                                        borderRadius: "4px",
                                        border: "1px solid #d1d5db",
                                        minWidth: "180px",
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveTicker(watchlistName, ticker)}
                                      style={{
                                        background: "none",
                                        border: "none",
                                        color: "#dc2626",
                                        cursor: "pointer",
                                        fontSize: "1rem",
                                        lineHeight: 1,
                                      }}
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <CustomWatchlistsTable
                            data={currentData.map((row) => ({
                              ...row,
                              Description: stockDescriptionsByWatchlist[watchlistName]?.[row.Ticker] || "",
                            }))}
                            sortColumn={sortColumnByWatchlist[watchlistName] || ""}
                            setSortColumn={(value) =>
                              setSortColumnByWatchlist((prev) => ({ ...prev, [watchlistName]: value }))
                            }
                            sortAscending={sortAscendingByWatchlist[watchlistName] ?? true}
                            setSortAscending={(value) =>
                              setSortAscendingByWatchlist((prev) => ({ ...prev, [watchlistName]: value }))
                            }
                            formatValue={formatValue}
                            isAdmin={true}
                            showCustomDatesChange={useCustomRange}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #e5e7eb" }}>
        {!showCreateCategoryControls ? (
          <button
            type="button"
            onClick={() => setShowCreateCategoryControls(true)}
            style={{
              padding: "0.75rem 1.25rem",
              backgroundColor: "#111827",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: 600,
              marginRight: "0.75rem",
            }}
          >
            Create Category
          </button>
        ) : (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Category Name"
              style={{ padding: "0.75rem", borderRadius: "4px", border: "1px solid #ccc", minWidth: "220px" }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateCategory();
                }
              }}
            />
            <button
              type="button"
              onClick={handleCreateCategory}
              style={primaryButtonStyle}
            >
              Create Category
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateCategoryControls(false);
                setNewCategoryName("");
              }}
              style={cancelButtonStyle}
            >
              Cancel
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default CustomWatchlists;

