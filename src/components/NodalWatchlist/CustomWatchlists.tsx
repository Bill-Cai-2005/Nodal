import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type CSSProperties,
  type DragEvent,
} from "react";
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
  normalizeTickerInputLocal,
  parseNumberInput,
  removeKeys,
  renameKey,
} from "../../utils/watchlistUtils";
import {
  deleteCustomWatchlistCategoryFromDb,
  deleteCustomWatchlistFromDb,
  loadCustomWatchlistCategoriesFromDb,
  loadCustomWatchlistsFromDb,
  saveCustomWatchlistCategoryToDb,
  saveCustomWatchlistToDb,
} from "../../utils/watchlistCacheApi";
import { runWithConcurrency } from "../../utils/concurrency";
import CategorySection from "./CategorySection";
import WatchlistSection from "./WatchlistSection";

const UNCATEGORIZED = "Uncategorized";
type Props = {
  isAdmin?: boolean;
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

const CustomWatchlists = ({ isAdmin = false }: Props) => {
  const [watchlists, setWatchlists] = useState<WatchlistCache>({});
  const [watchlistOrder, setWatchlistOrder] = useState<string[]>([]);
  const [watchlistDescriptionByName, setWatchlistDescriptionByName] = useState<
    Record<string, string>
  >({});
  const [watchlistCategoryByName, setWatchlistCategoryByName] = useState<
    Record<string, string>
  >({});
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [expandedByCategory, setExpandedByCategory] = useState<
    Record<string, boolean>
  >({});
  const [stockDescriptionsByWatchlist, setStockDescriptionsByWatchlist] =
    useState<Record<string, Record<string, string>>>({});
  const [stockSubcategoriesByWatchlist, setStockSubcategoriesByWatchlist] =
    useState<Record<string, Record<string, string>>>({});

  // Avoid stale-closure overwrites during async refresh/save flows.
  const stockDescriptionsByWatchlistRef = useRef<
    Record<string, Record<string, string>>
  >({});
  const stockSubcategoriesByWatchlistRef = useRef<
    Record<string, Record<string, string>>
  >({});
  useEffect(() => {
    stockDescriptionsByWatchlistRef.current = stockDescriptionsByWatchlist;
  }, [stockDescriptionsByWatchlist]);
  useEffect(() => {
    stockSubcategoriesByWatchlistRef.current = stockSubcategoriesByWatchlist;
  }, [stockSubcategoriesByWatchlist]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showCreateCategoryControls, setShowCreateCategoryControls] =
    useState(false);
  const [newWatchlistNameByCategory, setNewWatchlistNameByCategory] = useState<
    Record<string, string>
  >({});
  const [showCreateWatchlistByCategory, setShowCreateWatchlistByCategory] =
    useState<Record<string, boolean>>({});
  const [newTickerByWatchlist, setNewTickerByWatchlist] = useState<
    Record<string, string>
  >({});
  const [newManualByWatchlist, setNewManualByWatchlist] = useState<
    Record<string, { ticker: string; marketCap: string }>
  >({});
  const [watchlistData, setWatchlistData] = useState<
    Record<string, StockData[]>
  >({});
  const [loadingAll, setLoadingAll] = useState(false);
  const [validatingWatchlist, setValidatingWatchlist] = useState<string | null>(
    null,
  );
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    message: "",
  });
  const [expandedByWatchlist, setExpandedByWatchlist] = useState<
    Record<string, boolean>
  >({});
  const [editModeByWatchlist, setEditModeByWatchlist] = useState<
    Record<string, boolean>
  >({});
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customStart, setCustomStart] = useState<Date>(new Date());
  const [customEnd, setCustomEnd] = useState<Date>(new Date());
  const [sortColumnByWatchlist, setSortColumnByWatchlist] = useState<
    Record<string, string>
  >({});
  const [sortAscendingByWatchlist, setSortAscendingByWatchlist] = useState<
    Record<string, boolean>
  >({});
  const [draggedWatchlistName, setDraggedWatchlistName] = useState<
    string | null
  >(null);
  const [dragOverWatchlistName, setDragOverWatchlistName] = useState<
    string | null
  >(null);
  const [draggedCategoryName, setDraggedCategoryName] = useState<string | null>(
    null,
  );
  const [dragOverCategoryName, setDragOverCategoryName] = useState<
    string | null
  >(null);
  const [popupMessage, setPopupMessage] = useState<string | null>(null);
  const [categoryRenameByName, setCategoryRenameByName] = useState<
    Record<string, string>
  >({});
  const [editingCategoryByName, setEditingCategoryByName] = useState<
    Record<string, boolean>
  >({});
  const [watchlistNameDraftByName, setWatchlistNameDraftByName] = useState<
    Record<string, string>
  >({});
  const [editingWatchlistNameByName, setEditingWatchlistNameByName] = useState<
    Record<string, boolean>
  >({});
  const [watchlistDescriptionDraftByName, setWatchlistDescriptionDraftByName] =
    useState<Record<string, string>>({});
  const [
    editingWatchlistDescriptionByName,
    setEditingWatchlistDescriptionByName,
  ] = useState<Record<string, boolean>>({});
  const [expandedStockByWatchlist, setExpandedStockByWatchlist] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [editingStockByWatchlist, setEditingStockByWatchlist] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [
    stockDescriptionDraftByWatchlist,
    setStockDescriptionDraftByWatchlist,
  ] = useState<Record<string, Record<string, string>>>({});
  const [
    editingStockSubcategoryByWatchlist,
    setEditingStockSubcategoryByWatchlist,
  ] = useState<Record<string, Record<string, boolean>>>({});
  const [
    stockSubcategoryDraftByWatchlist,
    setStockSubcategoryDraftByWatchlist,
  ] = useState<Record<string, Record<string, string>>>({});

  const showPopup = (message: string) => setPopupMessage(message);
  const requireAdmin = (message = "Admin password required.") => {
    if (isAdmin) return true;
    showPopup(message);
    return false;
  };

  // (Removed) international split: we now split by "manual" vs "watchlist" rows.

  const setBoolByWatchlistTicker = (
    setter: Dispatch<SetStateAction<Record<string, Record<string, boolean>>>>,
    watchlistName: string,
    ticker: string,
    value: boolean,
  ) => {
    setter((prev) => ({
      ...prev,
      [watchlistName]: {
        ...(prev[watchlistName] || {}),
        [ticker]: value,
      },
    }));
  };

  const setStringByWatchlistTicker = (
    setter: Dispatch<SetStateAction<Record<string, Record<string, string>>>>,
    watchlistName: string,
    ticker: string,
    value: string,
  ) => {
    setter((prev) => ({
      ...prev,
      [watchlistName]: {
        ...(prev[watchlistName] || {}),
        [ticker]: value,
      },
    }));
  };

  const handleAddManualStock = async (watchlistName: string) => {
    if (!requireAdmin()) return;
    const draft = newManualByWatchlist[watchlistName] || {
      ticker: "",
      marketCap: "",
    };
    const ticker = normalizeTickerInputLocal(draft.ticker || "");
    if (!ticker) {
      showPopup("Please enter a ticker for the manual stock.");
      return;
    }
    const marketCap = parseNumberInput(draft.marketCap);
    if (marketCap === null) {
      showPopup("Please enter a valid Market Cap (e.g. 350B or 1230000000).");
      return;
    }

    const alreadyInTickers = (watchlists[watchlistName] || []).includes(ticker);
    const alreadyInData = (watchlistData[watchlistName] || []).some(
      (row) => row.Ticker === ticker,
    );
    if (alreadyInTickers || alreadyInData) {
      showPopup(`${ticker} already exists in this watchlist.`);
      return;
    }

    const manualRow: StockData = {
      Ticker: ticker,
      "Starting Price": null,
      "Current Price": null,
      "Market Cap": marketCap,
      "Daily Stock Change %": null,
      "Custom Dates Change %": null,
      Volume: null,
      Industry: null,
      Error: null,
    };

    const nextData = [...(watchlistData[watchlistName] || []), manualRow];
    const nextStockDescriptions = {
      ...(stockDescriptionsByWatchlist[watchlistName] || {}),
      [ticker]: stockDescriptionsByWatchlist[watchlistName]?.[ticker] || "",
    };

    setWatchlistData((prev) => ({ ...prev, [watchlistName]: nextData }));
    setStockDescriptionsByWatchlist((prev) => ({
      ...prev,
      [watchlistName]: nextStockDescriptions,
    }));
    setNewManualByWatchlist((prev) => ({
      ...prev,
      [watchlistName]: { ticker: "", marketCap: "" },
    }));

    try {
      await saveWatchlist(
        watchlistName,
        watchlists[watchlistName] || [],
        nextData,
        null,
        {
          stockDescriptions: nextStockDescriptions,
        },
      );
    } catch (e: any) {
      showPopup(`Added manually locally but failed to sync DB: ${e.message}`);
    }
  };

  const handleRemoveManualStock = async (
    watchlistName: string,
    ticker: string,
  ) => {
    if (!requireAdmin()) return;
    const nextData = (watchlistData[watchlistName] || []).filter(
      (row) => row.Ticker !== ticker,
    );
    const nextStockDescriptions = {
      ...(stockDescriptionsByWatchlist[watchlistName] || {}),
    };
    delete nextStockDescriptions[ticker];
    setWatchlistData((prev) => ({ ...prev, [watchlistName]: nextData }));
    setStockDescriptionsByWatchlist((prev) => ({
      ...prev,
      [watchlistName]: nextStockDescriptions,
    }));
    try {
      await saveWatchlist(
        watchlistName,
        watchlists[watchlistName] || [],
        nextData,
        null,
        {
          stockDescriptions: nextStockDescriptions,
        },
      );
    } catch (e: any) {
      showPopup(`Removed locally but failed to sync DB: ${e.message}`);
    }
  };

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
          const stockSubcategories: Record<string, Record<string, string>> = {};
          const orderedNames = [...dbWatchlists]
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((w) => w.name);
          for (const w of dbWatchlists) {
            watchlistsMap[w.name] = w.tickers || [];
            watchlistDataMap[w.name] = (w.data || []) as StockData[];
            watchlistDescriptions[w.name] = w.description || "";
            watchlistCategories[w.name] = (w.category || "").trim();
            stockDescriptions[w.name] = w.stock_descriptions || {};
            stockSubcategories[w.name] = (w as any).stock_subcategories || {};
          }
          const categoriesFromWatchlists = Array.from(
            new Set(Object.values(watchlistCategories)),
          ).filter(Boolean);
          const orderedCategories = [
            ...dbCategories
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .map((c) => c.name),
            ...categoriesFromWatchlists.filter(
              (c) => !dbCategories.some((x) => x.name === c),
            ),
          ];
          setWatchlists(watchlistsMap);
          setWatchlistOrder(orderedNames);
          setWatchlistDescriptionByName(watchlistDescriptions);
          setWatchlistNameDraftByName(
            Object.fromEntries(
              Object.keys(watchlistsMap).map((name) => [name, name]),
            ),
          );
          setWatchlistDescriptionDraftByName(watchlistDescriptions);
          setWatchlistCategoryByName(watchlistCategories);
          setCategoryOrder(orderedCategories);
          setExpandedByCategory(
            Object.fromEntries(
              orderedCategories.map((category) => [category, true]),
            ),
          );
          setStockDescriptionsByWatchlist(stockDescriptions);
          setStockSubcategoriesByWatchlist(stockSubcategories);
          setWatchlistData(watchlistDataMap);
          saveWatchlists(watchlistsMap);
          return;
        }
      } catch (e) {
        console.warn(
          "Failed to load custom watchlists from DB, falling back to local cache:",
          e,
        );
      }

      const loaded = loadWatchlists();
      setWatchlists(loaded);
      setWatchlistOrder(Object.keys(loaded));
      setWatchlistNameDraftByName(
        Object.fromEntries(Object.keys(loaded).map((name) => [name, name])),
      );
      setWatchlistDescriptionDraftByName(
        Object.fromEntries(Object.keys(loaded).map((name) => [name, ""])),
      );
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

  useEffect(() => {
    if (isAdmin) return;
    setUseCustomRange(false);
  }, [isAdmin]);

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
      stockSubcategories?: Record<string, string>;
    },
  ) => {
    const nextDescription =
      overrides?.description ?? watchlistDescriptionByName[watchlistName] ?? "";
    const nextOrder =
      overrides?.order ?? Math.max(0, watchlistOrder.indexOf(watchlistName));
    const nextCategory =
      (
        overrides?.category ??
        watchlistCategoryByName[watchlistName] ??
        ""
      ).trim() || UNCATEGORIZED;
    const nextStockDescriptions =
      overrides?.stockDescriptions ??
      stockDescriptionsByWatchlistRef.current[watchlistName] ??
      {};
    const nextStockSubcategories =
      overrides?.stockSubcategories ??
      stockSubcategoriesByWatchlistRef.current[watchlistName] ??
      {};
    await saveCustomWatchlistToDb(
      watchlistName,
      nextTickers,
      nextData,
      nextLastRefreshed,
      {
        description: nextDescription,
        order: nextOrder,
        category: nextCategory,
        stockDescriptions: nextStockDescriptions,
        stockSubcategories: nextStockSubcategories,
      },
    );
  };

  const handleCreateWatchlist = async (categoryName: string) => {
    if (!requireAdmin()) return;
    const name = (newWatchlistNameByCategory[categoryName] || "").trim();
    if (!name) {
      showPopup("Please enter a watchlist name");
      return;
    }
    if (watchlists[name]) {
      showPopup("Watchlist already exists");
      return;
    }
    const updated = { ...watchlists, [name]: [] };
    const nextOrder = [...watchlistOrder, name];
    setWatchlists(updated);
    setWatchlistOrder(nextOrder);
    setWatchlistDescriptionByName((prev) => ({ ...prev, [name]: "" }));
    setWatchlistNameDraftByName((prev) => ({ ...prev, [name]: name }));
    setEditingWatchlistNameByName((prev) => ({ ...prev, [name]: false }));
    setWatchlistDescriptionDraftByName((prev) => ({ ...prev, [name]: "" }));
    setWatchlistCategoryByName((prev) => ({ ...prev, [name]: categoryName }));
    setStockDescriptionsByWatchlist((prev) => ({ ...prev, [name]: {} }));
    setStockSubcategoriesByWatchlist((prev) => ({ ...prev, [name]: {} }));
    saveWatchlists(updated);
    setExpandedByWatchlist((prev) => ({ ...prev, [name]: true }));
    setEditModeByWatchlist((prev) => ({ ...prev, [name]: true }));
    setSortAscendingByWatchlist((prev) => ({ ...prev, [name]: true }));
    setNewWatchlistNameByCategory((prev) => ({ ...prev, [categoryName]: "" }));
    setShowCreateWatchlistByCategory((prev) => ({
      ...prev,
      [categoryName]: false,
    }));
    try {
      await saveWatchlist(name, [], [], null, {
        description: "",
        order: nextOrder.length - 1,
        category: categoryName,
        stockDescriptions: {},
        stockSubcategories: {},
      });
    } catch (e: any) {
      showPopup(
        `Created locally but failed to save watchlist to DB: ${e.message}`,
      );
    }
  };

  const handleCreateCategory = async () => {
    if (!requireAdmin()) return;
    const name = newCategoryName.trim();
    if (!name) {
      showPopup("Please enter a category name");
      return;
    }
    if (name === UNCATEGORIZED || categoryOrder.includes(name)) {
      showPopup("Category already exists");
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
      showPopup(`Created category locally but failed to sync DB: ${e.message}`);
    }
  };

  const handleDeleteCategory = async (category: string) => {
    if (!requireAdmin()) return;
    if (
      !confirm(
        `Delete category "${category}"? This will also delete all watchlists in it.`,
      )
    )
      return;
    const affectedWatchlists = Object.keys(watchlists).filter(
      (watchlistName) =>
        (watchlistCategoryByName[watchlistName] || "") === category,
    );
    const nextWatchlists = removeKeys({ ...watchlists }, affectedWatchlists);
    const nextWatchlistData = removeKeys(
      { ...watchlistData },
      affectedWatchlists,
    );
    const nextDescriptions = removeKeys(
      { ...watchlistDescriptionByName },
      affectedWatchlists,
    );
    const nextNameDrafts = removeKeys(
      { ...watchlistNameDraftByName },
      affectedWatchlists,
    );
    const nextNameEditing = removeKeys(
      { ...editingWatchlistNameByName },
      affectedWatchlists,
    );
    const nextDescriptionDrafts = removeKeys(
      { ...watchlistDescriptionDraftByName },
      affectedWatchlists,
    );
    const nextDescriptionEditing = removeKeys(
      { ...editingWatchlistDescriptionByName },
      affectedWatchlists,
    );
    const nextStockDescriptions = removeKeys(
      { ...stockDescriptionsByWatchlist },
      affectedWatchlists,
    );
    const nextStockSubcategories = removeKeys(
      { ...stockSubcategoriesByWatchlist },
      affectedWatchlists,
    );
    const nextExpandedStockByWatchlist = removeKeys(
      { ...expandedStockByWatchlist },
      affectedWatchlists,
    );
    const nextEditingStockByWatchlist = removeKeys(
      { ...editingStockByWatchlist },
      affectedWatchlists,
    );
    const nextStockDescriptionDraftByWatchlist = removeKeys(
      { ...stockDescriptionDraftByWatchlist },
      affectedWatchlists,
    );
    const nextEditingStockSubcategoryByWatchlist = removeKeys(
      { ...editingStockSubcategoryByWatchlist },
      affectedWatchlists,
    );
    const nextStockSubcategoryDraftByWatchlist = removeKeys(
      { ...stockSubcategoryDraftByWatchlist },
      affectedWatchlists,
    );
    const nextExpandedByWatchlist = removeKeys(
      { ...expandedByWatchlist },
      affectedWatchlists,
    );
    const nextEditModeByWatchlist = removeKeys(
      { ...editModeByWatchlist },
      affectedWatchlists,
    );
    const nextSortColumnByWatchlist = removeKeys(
      { ...sortColumnByWatchlist },
      affectedWatchlists,
    );
    const nextSortAscendingByWatchlist = removeKeys(
      { ...sortAscendingByWatchlist },
      affectedWatchlists,
    );
    const nextNewTickerByWatchlist = removeKeys(
      { ...newTickerByWatchlist },
      affectedWatchlists,
    );
    const nextWatchlistCategoryByName = removeKeys(
      { ...watchlistCategoryByName },
      affectedWatchlists,
    );
    const nextWatchlistOrder = watchlistOrder.filter(
      (name) => !affectedWatchlists.includes(name),
    );

    setWatchlists(nextWatchlists);
    saveWatchlists(nextWatchlists);
    setWatchlistData(nextWatchlistData);
    setWatchlistDescriptionByName(nextDescriptions);
    setWatchlistNameDraftByName(nextNameDrafts);
    setEditingWatchlistNameByName(nextNameEditing);
    setWatchlistDescriptionDraftByName(nextDescriptionDrafts);
    setEditingWatchlistDescriptionByName(nextDescriptionEditing);
    setStockDescriptionsByWatchlist(nextStockDescriptions);
    setStockSubcategoriesByWatchlist(nextStockSubcategories);
    setExpandedStockByWatchlist(nextExpandedStockByWatchlist);
    setEditingStockByWatchlist(nextEditingStockByWatchlist);
    setStockDescriptionDraftByWatchlist(nextStockDescriptionDraftByWatchlist);
    setEditingStockSubcategoryByWatchlist(
      nextEditingStockSubcategoryByWatchlist,
    );
    setStockSubcategoryDraftByWatchlist(nextStockSubcategoryDraftByWatchlist);
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
    setShowCreateWatchlistByCategory((prev) => {
      const next = { ...prev };
      delete next[category];
      return next;
    });
    setNewWatchlistNameByCategory((prev) => {
      const next = { ...prev };
      delete next[category];
      return next;
    });
    setEditingCategoryByName((prev) => {
      const next = { ...prev };
      delete next[category];
      return next;
    });
    setCategoryRenameByName((prev) => {
      const next = { ...prev };
      delete next[category];
      return next;
    });
    try {
      await deleteCustomWatchlistCategoryFromDb(category);
    } catch (e: any) {
      showPopup(`Deleted category locally but failed to sync DB: ${e.message}`);
    }
  };

  const handleAddTicker = async (watchlistName: string) => {
    if (!requireAdmin()) return;
    const inputTicker = (newTickerByWatchlist[watchlistName] || "").trim();
    if (!inputTicker) {
      showPopup("Please enter a ticker");
      return;
    }
    const ticker = normalizeTickerInputLocal(inputTicker);
    if (!ticker) {
      showPopup("Please enter a ticker");
      return;
    }
    const alreadyInTickers = (watchlists[watchlistName] || []).includes(ticker);
    const alreadyInManual = (watchlistData[watchlistName] || []).some(
      (row) =>
        row.Ticker === ticker &&
        !(watchlists[watchlistName] || []).includes(ticker),
    );
    if (alreadyInTickers || alreadyInManual) {
      showPopup(`${ticker} already exists in this watchlist`);
      return;
    }

    try {
      setValidatingWatchlist(watchlistName);
      setProgress({ current: 0, total: 0, message: `Validating ${ticker}...` });
      const validation = await validateTicker(ticker);
      if (!validation.valid) {
        showPopup(validation.reason || "Invalid ticker");
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
      setStockDescriptionsByWatchlist((prev) => ({
        ...prev,
        [watchlistName]: nextStockDescriptions,
      }));
      saveWatchlists(updated);
      setNewTickerByWatchlist((prev) => ({ ...prev, [watchlistName]: "" }));
      try {
        await saveWatchlist(
          watchlistName,
          updated[watchlistName] || [],
          watchlistData[watchlistName] || [],
          null,
          {
            stockDescriptions: nextStockDescriptions,
          },
        );
      } catch (e: any) {
        showPopup(`Added locally but failed to sync DB: ${e.message}`);
      }
    } catch (err: any) {
      showPopup(`Error: ${err.message}`);
    } finally {
      setValidatingWatchlist(null);
    }
  };

  const handleRemoveTicker = async (watchlistName: string, ticker: string) => {
    if (!requireAdmin()) return;
    const updated = {
      ...watchlists,
      [watchlistName]: (watchlists[watchlistName] || []).filter(
        (t) => t !== ticker,
      ),
    };
    const filteredData = (watchlistData[watchlistName] || []).filter(
      (row) => row.Ticker !== ticker,
    );
    const nextStockDescriptions = {
      ...(stockDescriptionsByWatchlist[watchlistName] || {}),
    };
    delete nextStockDescriptions[ticker];

    setWatchlists(updated);
    saveWatchlists(updated);
    setWatchlistData((prev) => ({ ...prev, [watchlistName]: filteredData }));
    setStockDescriptionsByWatchlist((prev) => ({
      ...prev,
      [watchlistName]: nextStockDescriptions,
    }));
    try {
      await saveWatchlist(
        watchlistName,
        updated[watchlistName] || [],
        filteredData,
        null,
        {
          stockDescriptions: nextStockDescriptions,
        },
      );
    } catch (e: any) {
      showPopup(`Removed locally but failed to sync DB: ${e.message}`);
    }
  };

  const persistWatchlistOrder = async (nextOrder: string[]) => {
    if (!requireAdmin("Unlock to reorder watchlists.")) return;
    setWatchlistOrder(nextOrder);
    try {
      await Promise.all(
        nextOrder.map((name, index) =>
          saveWatchlist(
            name,
            watchlists[name] || [],
            watchlistData[name] || [],
            null,
            { order: index },
          ),
        ),
      );
    } catch (e: any) {
      showPopup(`Order changed locally but failed to sync DB: ${e.message}`);
    }
  };

  const persistCategoryOrder = async (nextOrder: string[]) => {
    if (!requireAdmin("Unlock to reorder categories.")) return;
    setCategoryOrder(nextOrder);
    try {
      await Promise.all(
        nextOrder.map((name, index) =>
          saveCustomWatchlistCategoryToDb(name, index),
        ),
      );
    } catch (e: any) {
      showPopup(
        `Category order changed locally but failed to sync DB: ${e.message}`,
      );
    }
  };

  const getRenderableWatchlistNames = () => {
    const orderedWatchlistNames = watchlistOrder.filter((name) =>
      Boolean(watchlists[name]),
    );
    const unorderedWatchlistNames = Object.keys(watchlists).filter(
      (name) => !orderedWatchlistNames.includes(name),
    );
    return [...orderedWatchlistNames, ...unorderedWatchlistNames];
  };

  const handleWatchlistDragStart = (
    event: DragEvent<HTMLDivElement>,
    watchlistName: string,
  ) => {
    if (!isAdmin) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", watchlistName);
    setDraggedWatchlistName(watchlistName);
  };

  const handleWatchlistDragOver = (
    event: DragEvent<HTMLDivElement>,
    watchlistName: string,
  ) => {
    if (!isAdmin) return;
    event.preventDefault();
    if (draggedWatchlistName && draggedWatchlistName !== watchlistName) {
      setDragOverWatchlistName(watchlistName);
    }
  };

  const handleWatchlistDrop = async (
    event: DragEvent<HTMLDivElement>,
    targetWatchlistName: string,
  ) => {
    if (!isAdmin) return;
    event.preventDefault();
    const sourceWatchlistName =
      draggedWatchlistName || event.dataTransfer.getData("text/plain");
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
    if (!isAdmin) return;
    setDraggedWatchlistName(null);
    setDragOverWatchlistName(null);
  };

  const handleCategoryDragStart = (
    event: DragEvent<HTMLDivElement>,
    categoryName: string,
  ) => {
    if (!isAdmin) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", categoryName);
    setDraggedCategoryName(categoryName);
  };

  const handleCategoryDragOver = (
    event: DragEvent<HTMLDivElement>,
    categoryName: string,
  ) => {
    if (!isAdmin) return;
    event.preventDefault();
    if (draggedCategoryName && draggedCategoryName !== categoryName) {
      setDragOverCategoryName(categoryName);
    }
  };

  const handleCategoryDrop = async (
    event: DragEvent<HTMLDivElement>,
    targetCategoryName: string,
  ) => {
    if (!isAdmin) return;
    event.preventDefault();
    const sourceCategoryName =
      draggedCategoryName || event.dataTransfer.getData("text/plain");
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
    if (!isAdmin) return;
    setDraggedCategoryName(null);
    setDragOverCategoryName(null);
  };

  const handleStartEditCategoryName = (category: string) => {
    if (!requireAdmin()) return;
    setCategoryRenameByName((prev) => ({ ...prev, [category]: category }));
    setEditingCategoryByName((prev) => ({ ...prev, [category]: true }));
  };

  const handleSaveCategoryName = async (oldCategory: string) => {
    if (!requireAdmin()) return;
    const renamed = (categoryRenameByName[oldCategory] || "").trim();
    if (!renamed) {
      showPopup("Category name cannot be empty.");
      return;
    }
    if (renamed === oldCategory) {
      setEditingCategoryByName((prev) => ({ ...prev, [oldCategory]: false }));
      return;
    }
    if (categoryOrder.includes(renamed)) {
      showPopup("Category already exists.");
      return;
    }

    const nextCategoryOrder = categoryOrder.map((name) =>
      name === oldCategory ? renamed : name,
    );
    const nextWatchlistCategoryByName = Object.fromEntries(
      Object.entries(watchlistCategoryByName).map(
        ([watchlistName, category]) => [
          watchlistName,
          category === oldCategory ? renamed : category,
        ],
      ),
    );

    setCategoryOrder(nextCategoryOrder);
    setWatchlistCategoryByName(nextWatchlistCategoryByName);
    setExpandedByCategory((prev) => renameKey(prev, oldCategory, renamed));
    setShowCreateWatchlistByCategory((prev) =>
      renameKey(prev, oldCategory, renamed),
    );
    setNewWatchlistNameByCategory((prev) =>
      renameKey(prev, oldCategory, renamed),
    );
    setEditingCategoryByName((prev) => {
      const next = renameKey(prev, oldCategory, renamed);
      next[renamed] = false;
      return next;
    });
    setCategoryRenameByName((prev) => {
      const next = renameKey(prev, oldCategory, renamed);
      next[renamed] = renamed;
      return next;
    });

    try {
      const targetIndex = nextCategoryOrder.indexOf(renamed);
      await saveCustomWatchlistCategoryToDb(renamed, targetIndex);
      const watchlistsToMove = Object.keys(watchlists).filter(
        (watchlistName) =>
          watchlistCategoryByName[watchlistName] === oldCategory,
      );
      await Promise.all(
        watchlistsToMove.map((watchlistName) =>
          saveWatchlist(
            watchlistName,
            watchlists[watchlistName] || [],
            watchlistData[watchlistName] || [],
            null,
            {
              category: renamed,
            },
          ),
        ),
      );
      await deleteCustomWatchlistCategoryFromDb(oldCategory);
    } catch (e: any) {
      showPopup(
        `Renamed locally but failed to sync category rename: ${e.message}`,
      );
    }
  };

  const handleSaveWatchlistDescription = async (watchlistName: string) => {
    if (!requireAdmin()) return;
    try {
      await saveWatchlist(
        watchlistName,
        watchlists[watchlistName] || [],
        watchlistData[watchlistName] || [],
        null,
        { description: watchlistDescriptionDraftByName[watchlistName] || "" },
      );
      setWatchlistDescriptionByName((prev) => ({
        ...prev,
        [watchlistName]: watchlistDescriptionDraftByName[watchlistName] || "",
      }));
      setEditingWatchlistDescriptionByName((prev) => ({
        ...prev,
        [watchlistName]: false,
      }));
    } catch (e: any) {
      showPopup(
        `Saved locally but failed to sync watchlist description: ${e.message}`,
      );
    }
  };

  const handleSaveWatchlistName = async (watchlistName: string) => {
    if (!requireAdmin()) return;
    const nextName = (
      watchlistNameDraftByName[watchlistName] ?? watchlistName
    ).trim();
    const currentDescription = watchlistDescriptionByName[watchlistName] || "";

    if (!nextName) {
      showPopup("Watchlist name cannot be empty.");
      return;
    }
    if (nextName !== watchlistName && watchlists[nextName]) {
      showPopup("A watchlist with that name already exists.");
      return;
    }

    if (nextName !== watchlistName) {
      const tickers = watchlists[watchlistName] || [];
      const data = watchlistData[watchlistName] || [];
      const category = watchlistCategoryByName[watchlistName] || "";
      const order = Math.max(0, watchlistOrder.indexOf(watchlistName));
      const stockDescriptions =
        stockDescriptionsByWatchlist[watchlistName] || {};

      setWatchlists((prev) => {
        const next = { ...prev };
        delete next[watchlistName];
        next[nextName] = tickers;
        saveWatchlists(next);
        return next;
      });
      setWatchlistData((prev) => renameKey(prev, watchlistName, nextName));
      setWatchlistDescriptionByName((prev) =>
        renameKey(prev, watchlistName, nextName),
      );
      setWatchlistNameDraftByName((prev) => ({
        ...renameKey(prev, watchlistName, nextName),
        [nextName]: nextName,
      }));
      setWatchlistDescriptionDraftByName((prev) =>
        renameKey(prev, watchlistName, nextName),
      );
      setWatchlistCategoryByName((prev) =>
        renameKey(prev, watchlistName, nextName),
      );
      setStockDescriptionsByWatchlist((prev) =>
        renameKey(prev, watchlistName, nextName),
      );
      setStockSubcategoriesByWatchlist((prev) =>
        renameKey(prev, watchlistName, nextName),
      );
      setExpandedByWatchlist((prev) =>
        renameKey(prev, watchlistName, nextName),
      );
      setEditModeByWatchlist((prev) => {
        const next = renameKey(prev, watchlistName, nextName);
        next[nextName] = false;
        return next;
      });
      setEditingWatchlistNameByName((prev) =>
        renameKey(prev, watchlistName, nextName),
      );
      setEditingWatchlistDescriptionByName((prev) =>
        renameKey(prev, watchlistName, nextName),
      );
      setSortColumnByWatchlist((prev) =>
        renameKey(prev, watchlistName, nextName),
      );
      setSortAscendingByWatchlist((prev) =>
        renameKey(prev, watchlistName, nextName),
      );
      setNewTickerByWatchlist((prev) =>
        renameKey(prev, watchlistName, nextName),
      );
      setExpandedStockByWatchlist((prev) =>
        renameKey(prev, watchlistName, nextName),
      );
      setEditingStockByWatchlist((prev) =>
        renameKey(prev, watchlistName, nextName),
      );
      setStockDescriptionDraftByWatchlist((prev) =>
        renameKey(prev, watchlistName, nextName),
      );
      setEditingStockSubcategoryByWatchlist((prev) =>
        renameKey(prev, watchlistName, nextName),
      );
      setStockSubcategoryDraftByWatchlist((prev) =>
        renameKey(prev, watchlistName, nextName),
      );
      setWatchlistOrder((prev) =>
        prev.map((name) => (name === watchlistName ? nextName : name)),
      );

      try {
        const stockSubcategories =
          stockSubcategoriesByWatchlist[watchlistName] || {};
        await saveCustomWatchlistToDb(nextName, tickers, data, null, {
          description: currentDescription,
          order,
          category,
          stockDescriptions,
          stockSubcategories,
        });
        await deleteCustomWatchlistFromDb(watchlistName);
      } catch (e: any) {
        showPopup(
          `Saved locally but failed to sync watchlist rename: ${e.message}`,
        );
      }
      return;
    }

    setEditingWatchlistNameByName((prev) => ({
      ...prev,
      [watchlistName]: false,
    }));
  };

  const handleSaveStockDescription = async (
    watchlistName: string,
    ticker: string,
    description: string,
  ) => {
    if (!requireAdmin()) return;
    const nextStockDescriptions = {
      ...(stockDescriptionsByWatchlist[watchlistName] || {}),
      [ticker]: description,
    };
    stockDescriptionsByWatchlistRef.current = {
      ...stockDescriptionsByWatchlistRef.current,
      [watchlistName]: nextStockDescriptions,
    };
    setStockDescriptionsByWatchlist((prev) => ({
      ...prev,
      [watchlistName]: nextStockDescriptions,
    }));
    try {
      await saveWatchlist(
        watchlistName,
        watchlists[watchlistName] || [],
        watchlistData[watchlistName] || [],
        null,
        {
          stockDescriptions: nextStockDescriptions,
        },
      );
      setEditingStockByWatchlist((prev) => ({
        ...prev,
        [watchlistName]: {
          ...(prev[watchlistName] || {}),
          [ticker]: false,
        },
      }));
    } catch (e: any) {
      showPopup(
        `Saved locally but failed to sync stock description: ${e.message}`,
      );
    }
  };

  const handleStartEditStockSubcategory = (
    watchlistName: string,
    ticker: string,
  ) => {
    if (!requireAdmin()) return;
    const live = stockSubcategoriesByWatchlist[watchlistName]?.[ticker] || "";
    setStringByWatchlistTicker(
      setStockSubcategoryDraftByWatchlist,
      watchlistName,
      ticker,
      live,
    );
    setBoolByWatchlistTicker(
      setEditingStockSubcategoryByWatchlist,
      watchlistName,
      ticker,
      true,
    );
  };

  const handleCancelEditStockSubcategory = (
    watchlistName: string,
    ticker: string,
  ) => {
    setBoolByWatchlistTicker(
      setEditingStockSubcategoryByWatchlist,
      watchlistName,
      ticker,
      false,
    );
  };

  const handleDraftStockSubcategoryChange = (
    watchlistName: string,
    ticker: string,
    value: string,
  ) => {
    setStringByWatchlistTicker(
      setStockSubcategoryDraftByWatchlist,
      watchlistName,
      ticker,
      value,
    );
  };

  const handleSaveStockSubcategory = async (
    watchlistName: string,
    ticker: string,
    subcategory: string,
  ) => {
    if (!requireAdmin()) return;
    const nextStockSubcategories = {
      ...(stockSubcategoriesByWatchlist[watchlistName] || {}),
      [ticker]: subcategory,
    };
    stockSubcategoriesByWatchlistRef.current = {
      ...stockSubcategoriesByWatchlistRef.current,
      [watchlistName]: nextStockSubcategories,
    };
    setStockSubcategoriesByWatchlist((prev) => ({
      ...prev,
      [watchlistName]: nextStockSubcategories,
    }));
    try {
      await saveWatchlist(
        watchlistName,
        watchlists[watchlistName] || [],
        watchlistData[watchlistName] || [],
        null,
        {
          stockSubcategories: nextStockSubcategories,
        },
      );
      setBoolByWatchlistTicker(
        setEditingStockSubcategoryByWatchlist,
        watchlistName,
        ticker,
        false,
      );
    } catch (e: any) {
      showPopup(
        `Saved locally but failed to sync stock subcategory: ${e.message}`,
      );
    }
  };

  const handleToggleStockRowExpand = (
    watchlistName: string,
    ticker: string,
  ) => {
    setExpandedStockByWatchlist((prev) => ({
      ...prev,
      [watchlistName]: {
        ...(prev[watchlistName] || {}),
        [ticker]: !(prev[watchlistName]?.[ticker] ?? false),
      },
    }));
  };

  const handleStartEditStockDescription = (
    watchlistName: string,
    ticker: string,
  ) => {
    if (!requireAdmin()) return;
    const liveDescription =
      stockDescriptionsByWatchlist[watchlistName]?.[ticker] || "";
    setStockDescriptionDraftByWatchlist((prev) => ({
      ...prev,
      [watchlistName]: {
        ...(prev[watchlistName] || {}),
        [ticker]: liveDescription,
      },
    }));
    setEditingStockByWatchlist((prev) => ({
      ...prev,
      [watchlistName]: {
        ...(prev[watchlistName] || {}),
        [ticker]: true,
      },
    }));
  };

  const handleCancelEditStockDescription = (
    watchlistName: string,
    ticker: string,
  ) => {
    setEditingStockByWatchlist((prev) => ({
      ...prev,
      [watchlistName]: {
        ...(prev[watchlistName] || {}),
        [ticker]: false,
      },
    }));
  };

  const handleDraftStockDescriptionChange = (
    watchlistName: string,
    ticker: string,
    value: string,
  ) => {
    setStockDescriptionDraftByWatchlist((prev) => ({
      ...prev,
      [watchlistName]: {
        ...(prev[watchlistName] || {}),
        [ticker]: value,
      },
    }));
  };

  const handleDeleteWatchlist = async (watchlistName: string) => {
    if (!requireAdmin()) return;
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
    setWatchlistNameDraftByName((prev) => {
      const next = { ...prev };
      delete next[watchlistName];
      return next;
    });
    setEditingWatchlistNameByName((prev) => {
      const next = { ...prev };
      delete next[watchlistName];
      return next;
    });
    setWatchlistDescriptionDraftByName((prev) => {
      const next = { ...prev };
      delete next[watchlistName];
      return next;
    });
    setEditingWatchlistDescriptionByName((prev) => {
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
    setStockSubcategoriesByWatchlist((prev) => {
      const next = { ...prev };
      delete next[watchlistName];
      return next;
    });
    setExpandedStockByWatchlist((prev) => {
      const next = { ...prev };
      delete next[watchlistName];
      return next;
    });
    setEditingStockByWatchlist((prev) => {
      const next = { ...prev };
      delete next[watchlistName];
      return next;
    });
    setStockDescriptionDraftByWatchlist((prev) => {
      const next = { ...prev };
      delete next[watchlistName];
      return next;
    });
    setEditingStockSubcategoryByWatchlist((prev) => {
      const next = { ...prev };
      delete next[watchlistName];
      return next;
    });
    setStockSubcategoryDraftByWatchlist((prev) => {
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
      showPopup(`Deleted locally but failed to delete in DB: ${e.message}`);
    }
  };

  const handleRefreshAllWatchlists = async () => {
    const watchlistNames = Object.keys(watchlists);
    const totalTickers = watchlistNames.reduce(
      (acc, name) => acc + (watchlists[name]?.length || 0),
      0,
    );
    if (totalTickers === 0) {
      showPopup("No tickers available to refresh.");
      return;
    }

    try {
      setLoadingAll(true);
      setProgress({
        current: 0,
        total: totalTickers,
        message: "Fetching full data...",
      });

      let completed = 0;
      const nextData: Record<string, StockData[]> = { ...watchlistData };
      const existingByWatchlistAndTicker: Record<
        string,
        Record<string, StockData>
      > = {};
      for (const watchlistName of watchlistNames) {
        existingByWatchlistAndTicker[watchlistName] = Object.fromEntries(
          (watchlistData[watchlistName] || []).map((row) => [row.Ticker, row]),
        );
      }
      const tasks = watchlistNames.flatMap((watchlistName) =>
        (watchlists[watchlistName] || []).map((ticker) => ({
          watchlistName,
          ticker,
        })),
      );
      const rowsByWatchlistAndTicker: Record<
        string,
        Record<string, StockData>
      > = {};
      await runWithConcurrency(tasks, 24, async ({ watchlistName, ticker }) => {
        const fetched = await fetchStockData(ticker, undefined, undefined);
        const existing = existingByWatchlistAndTicker[watchlistName]?.[ticker];
        const row: StockData = {
          ...fetched,
          // Refresh should never compute or overwrite custom-range data.
          "Custom Dates Change %": existing?.["Custom Dates Change %"] ?? null,
        };
        if (!rowsByWatchlistAndTicker[watchlistName])
          rowsByWatchlistAndTicker[watchlistName] = {};
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
        // Keep manually-entered (global) rows; they are not part of the refresh ticker list.
        const manualRows = (watchlistData[watchlistName] || []).filter(
          (row) => !tickers.includes(row.Ticker),
        );
        nextData[watchlistName] = [...results, ...manualRows];
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
                category:
                  watchlistCategoryByName[watchlistName] ||
                  categoryOrder[0] ||
                  "",
                stockDescriptions:
                  stockDescriptionsByWatchlistRef.current[watchlistName] || {},
                stockSubcategories:
                  stockSubcategoriesByWatchlistRef.current[watchlistName] || {},
              },
            );
          } catch (e: any) {
            showPopup(
              `Refreshed locally for "${watchlistName}" but failed to save refreshed data to DB: ${e.message}`,
            );
          }
        }),
      );

      setWatchlistData(nextData);
      setProgress({ current: 0, total: 0, message: "Refresh complete." });
    } catch (err: any) {
      showPopup(`Error: ${err.message}`);
    } finally {
      setLoadingAll(false);
    }
  };

  const handleLoadHistoricalData = async () => {
    if (!requireAdmin("Unlock to refresh custom time ranges.")) return;
    if (!useCustomRange) {
      showPopup("Enable 'Use Custom Time Range' first.");
      return;
    }
    const watchlistNames = Object.keys(watchlists);
    const hasMarketData = watchlistNames.some(
      (name) => (watchlistData[name] || []).length > 0,
    );
    if (!hasMarketData) {
      showPopup("Refresh watchlists first to load market data.");
      return;
    }

    const existingByWatchlistAndTicker: Record<
      string,
      Record<string, StockData>
    > = {};
    for (const watchlistName of watchlistNames) {
      existingByWatchlistAndTicker[watchlistName] = Object.fromEntries(
        (watchlistData[watchlistName] || []).map((row) => [row.Ticker, row]),
      );
    }

    const tasks = watchlistNames.flatMap((watchlistName) =>
      (watchlists[watchlistName] || [])
        .filter((ticker) =>
          Boolean(existingByWatchlistAndTicker[watchlistName]?.[ticker]),
        )
        .map((ticker) => ({ watchlistName, ticker })),
    );

    if (tasks.length === 0) {
      setProgress({
        current: 0,
        total: 0,
        message: "No market rows available to load historical data.",
      });
      return;
    }

    try {
      setLoadingAll(true);
      setProgress({
        current: 0,
        total: tasks.length,
        message: "Loading historical data for missing tickers...",
      });
      let completed = 0;
      const customByWatchlistAndTicker: Record<
        string,
        Record<string, number | null>
      > = {};

      await runWithConcurrency(tasks, 24, async ({ watchlistName, ticker }) => {
        const row = await fetchStockData(
          ticker,
          customStart,
          customEnd,
          undefined,
          { includeReference: false },
        );
        if (!customByWatchlistAndTicker[watchlistName])
          customByWatchlistAndTicker[watchlistName] = {};
        customByWatchlistAndTicker[watchlistName][ticker] =
          row["Custom Dates Change %"];
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
            const value =
              customByWatchlistAndTicker[watchlistName]?.[row.Ticker];
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
      showPopup(`Error loading historical data: ${err.message}`);
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
  const hasMarketData = watchlistNames.some(
    (name) => (watchlistData[name] || []).length > 0,
  );
  const renderedCategories = [
    ...categoryOrder,
    ...(
      Object.values(watchlistCategoryByName).filter(
        (category, idx, arr) =>
          Boolean(category) && arr.indexOf(category) === idx,
      ) || []
    ).filter((category) => !categoryOrder.includes(category)),
  ];

  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: "1rem" }}>
        <div
          style={{
            display: "flex",
            gap: "1rem",
            justifyContent: "center",
            flexWrap: "wrap",
            marginBottom: "1rem",
          }}
        >
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
              cursor:
                loadingAll || validatingWatchlist ? "not-allowed" : "pointer",
              fontSize: "0.875rem",
              fontWeight: 600,
              opacity: loadingAll || validatingWatchlist ? 0.6 : 1,
            }}
          >
            {loadingAll ? "Refreshing..." : "Refresh All Watchlists"}
          </button>
        </div>

        {isAdmin && hasMarketData && (
          <div
            style={{
              display: "flex",
              gap: "1rem",
              alignItems: "center",
              justifyContent: "center",
              flexWrap: "wrap",
              marginBottom: "1rem",
            }}
          >
            <label
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <input
                type="checkbox"
                checked={useCustomRange}
                disabled={!isAdmin}
                onChange={(e) => {
                  if (!requireAdmin("Unlock to use custom time ranges."))
                    return;
                  setUseCustomRange(e.target.checked);
                }}
              />
              Use Custom Time Range
            </label>
            {useCustomRange && (
              <>
                <input
                  type="date"
                  value={customStart.toISOString().split("T")[0]}
                  disabled={!isAdmin}
                  onChange={(e) => {
                    if (!requireAdmin("Unlock to use custom time ranges."))
                      return;
                    setCustomStart(new Date(e.target.value));
                  }}
                  style={{
                    padding: "0.5rem",
                    borderRadius: "4px",
                    border: "1px solid #ccc",
                  }}
                />
                <input
                  type="date"
                  value={customEnd.toISOString().split("T")[0]}
                  disabled={!isAdmin}
                  onChange={(e) => {
                    if (!requireAdmin("Unlock to use custom time ranges."))
                      return;
                    setCustomEnd(new Date(e.target.value));
                  }}
                  style={{
                    padding: "0.5rem",
                    borderRadius: "4px",
                    border: "1px solid #ccc",
                  }}
                />
                <button
                  type="button"
                  onClick={handleLoadHistoricalData}
                  disabled={
                    !isAdmin || loadingAll || Boolean(validatingWatchlist)
                  }
                  style={{
                    padding: "0.65rem 1rem",
                    backgroundColor: "#000000",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    cursor:
                      loadingAll || validatingWatchlist
                        ? "not-allowed"
                        : "pointer",
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
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.75rem",
            background: "#f0f0f0",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <span>
            {progress.message}
            {progress.total > 0 && ` (${progress.current}/${progress.total})`}
          </span>
          <button
            type="button"
            onClick={() => setProgress({ current: 0, total: 0, message: "" })}
            style={{
              ...iconButtonBaseStyle,
              color: "#6b7280",
              border: "1px solid #d1d5db",
              fontSize: "1rem",
            }}
            aria-label="Dismiss status"
            title="Dismiss status"
          >
            ×
          </button>
        </div>
      )}

      {popupMessage && (
        <div
          style={{
            position: "fixed",
            top: "1rem",
            right: "1rem",
            zIndex: 1000,
            maxWidth: "360px",
            backgroundColor: "#111827",
            color: "#ffffff",
            borderRadius: "8px",
            padding: "0.9rem",
            boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <div
            style={{
              whiteSpace: "pre-wrap",
              fontSize: "0.9rem",
              lineHeight: 1.35,
            }}
          >
            {popupMessage}
          </div>
          <button
            type="button"
            onClick={() => setPopupMessage(null)}
            style={{
              ...iconButtonBaseStyle,
              color: "#d1d5db",
              border: "1px solid #4b5563",
              fontSize: "1rem",
              flexShrink: 0,
            }}
            aria-label="Close message"
            title="Close"
          >
            ×
          </button>
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
          (watchlistName) =>
            (watchlistCategoryByName[watchlistName] || "") === category,
        );
        const isCategoryExpanded = expandedByCategory[category] ?? true;

        return (
          <CategorySection
            key={`category-${category}`}
            category={category}
            isAdmin={isAdmin}
            isExpanded={isCategoryExpanded}
            isDragged={draggedCategoryName === category}
            isDragOver={dragOverCategoryName === category}
            isEditingName={Boolean(editingCategoryByName[category])}
            renameDraft={categoryRenameByName[category] || ""}
            showCreateWatchlist={Boolean(showCreateWatchlistByCategory[category])}
            newWatchlistName={newWatchlistNameByCategory[category] || ""}
            watchlistsInCategoryCount={watchlistsInCategory.length}
            onToggleExpanded={() =>
              setExpandedByCategory((prev) => ({
                ...prev,
                [category]: !isCategoryExpanded,
              }))
            }
            onStartEditName={() => handleStartEditCategoryName(category)}
            onRenameDraftChange={(value) =>
              setCategoryRenameByName((prev) => ({ ...prev, [category]: value }))
            }
            onSaveName={() => void handleSaveCategoryName(category)}
            onDelete={() => handleDeleteCategory(category)}
            onShowCreateWatchlist={() =>
              setShowCreateWatchlistByCategory((prev) => ({
                ...prev,
                [category]: true,
              }))
            }
            onNewWatchlistNameChange={(value) =>
              setNewWatchlistNameByCategory((prev) => ({
                ...prev,
                [category]: value,
              }))
            }
            onCreateWatchlist={() => void handleCreateWatchlist(category)}
            onCancelCreateWatchlist={() => {
              setShowCreateWatchlistByCategory((prev) => ({
                ...prev,
                [category]: false,
              }));
              setNewWatchlistNameByCategory((prev) => ({
                ...prev,
                [category]: "",
              }));
            }}
            onDragStart={(event) => handleCategoryDragStart(event, category)}
            onDragOver={(event) => handleCategoryDragOver(event, category)}
            onDrop={(event) => void handleCategoryDrop(event, category)}
            onDragEnd={handleCategoryDragEnd}
          >
            {watchlistsInCategory.map((watchlistName) => {
              const isExpanded = expandedByWatchlist[watchlistName] ?? true;
              const isEditing = editModeByWatchlist[watchlistName] ?? false;
              const isBusy = loadingAll || validatingWatchlist === watchlistName;
              const tickers = watchlists[watchlistName] || [];
              const currentData = watchlistData[watchlistName] || [];
              const manualRows = currentData.filter(
                (row) => !tickers.includes(row.Ticker),
              );

              return (
                <WatchlistSection
                  watchlistName={watchlistName}
                  isAdmin={isAdmin}
                  isExpanded={isExpanded}
                  isEditing={isEditing}
                  isBusy={isBusy}
                  isDragOver={dragOverWatchlistName === watchlistName}
                  isDragged={draggedWatchlistName === watchlistName}
                  tickers={tickers}
                  currentData={currentData}
                  manualRows={manualRows}
                  watchlistNameDraft={
                    watchlistNameDraftByName[watchlistName] ?? watchlistName
                  }
                  editingWatchlistName={Boolean(
                    editingWatchlistNameByName[watchlistName],
                  )}
                  watchlistDescription={
                    watchlistDescriptionByName[watchlistName] || ""
                  }
                  watchlistDescriptionDraft={
                    watchlistDescriptionDraftByName[watchlistName] || ""
                  }
                  editingWatchlistDescription={Boolean(
                    editingWatchlistDescriptionByName[watchlistName],
                  )}
                  newTicker={newTickerByWatchlist[watchlistName] || ""}
                  newManualTicker={
                    newManualByWatchlist[watchlistName]?.ticker || ""
                  }
                  newManualMarketCap={
                    newManualByWatchlist[watchlistName]?.marketCap || ""
                  }
                  sortColumn={sortColumnByWatchlist[watchlistName] || ""}
                  sortAscending={sortAscendingByWatchlist[watchlistName] ?? true}
                  useCustomRange={useCustomRange}
                  formatValue={formatValue}
                  stockDescriptionsByWatchlist={stockDescriptionsByWatchlist}
                  stockSubcategoriesByWatchlist={stockSubcategoriesByWatchlist}
                  expandedStockByWatchlist={expandedStockByWatchlist}
                  editingStockByWatchlist={editingStockByWatchlist}
                  stockDescriptionDraftByWatchlist={stockDescriptionDraftByWatchlist}
                  editingStockSubcategoryByWatchlist={
                    editingStockSubcategoryByWatchlist
                  }
                  stockSubcategoryDraftByWatchlist={stockSubcategoryDraftByWatchlist}
                  onDragStart={(event) =>
                    handleWatchlistDragStart(event, watchlistName)
                  }
                  onDragOver={(event) =>
                    handleWatchlistDragOver(event, watchlistName)
                  }
                  onDrop={(event) => void handleWatchlistDrop(event, watchlistName)}
                  onDragEnd={handleWatchlistDragEnd}
                  onToggleExpanded={() =>
                    setExpandedByWatchlist((prev) => ({
                      ...prev,
                      [watchlistName]: !isExpanded,
                    }))
                  }
                  onStartEditWatchlistName={() => {
                    setWatchlistNameDraftByName((prev) => ({
                      ...prev,
                      [watchlistName]: watchlistName,
                    }));
                    setEditingWatchlistNameByName((prev) => ({
                      ...prev,
                      [watchlistName]: true,
                    }));
                  }}
                  onWatchlistNameDraftChange={(value) =>
                    setWatchlistNameDraftByName((prev) => ({
                      ...prev,
                      [watchlistName]: value,
                    }))
                  }
                  onSaveWatchlistName={() => void handleSaveWatchlistName(watchlistName)}
                  onToggleEditMode={() => {
                    const nextIsEditing = !isEditing;
                    setEditModeByWatchlist((prev) => ({
                      ...prev,
                      [watchlistName]: nextIsEditing,
                    }));

                    // When entering edit mode, open description editing automatically.
                    // When leaving edit mode, close it (and keep draft in sync with saved).
                    setWatchlistDescriptionDraftByName((prev) => ({
                      ...prev,
                      [watchlistName]:
                        nextIsEditing
                          ? watchlistDescriptionByName[watchlistName] || ""
                          : prev[watchlistName] || "",
                    }));
                    setEditingWatchlistDescriptionByName((prev) => ({
                      ...prev,
                      [watchlistName]: nextIsEditing,
                    }));
                  }}
                  onDeleteWatchlist={() => handleDeleteWatchlist(watchlistName)}
                  onCancelEditWatchlistDescription={() => {
                    setWatchlistDescriptionDraftByName((prev) => ({
                      ...prev,
                      [watchlistName]:
                        watchlistDescriptionByName[watchlistName] || "",
                    }));
                  }}
                  onWatchlistDescriptionDraftChange={(value) =>
                    setWatchlistDescriptionDraftByName((prev) => ({
                      ...prev,
                      [watchlistName]: value,
                    }))
                  }
                  onSaveWatchlistDescription={() =>
                    void handleSaveWatchlistDescription(watchlistName)
                  }
                  onNewTickerChange={(value) =>
                    setNewTickerByWatchlist((prev) => ({
                      ...prev,
                      [watchlistName]: value,
                    }))
                  }
                  onAddTicker={() => handleAddTicker(watchlistName)}
                  onNewManualTickerChange={(value) =>
                    setNewManualByWatchlist((prev) => ({
                      ...prev,
                      [watchlistName]: {
                        ticker: value,
                        marketCap: prev[watchlistName]?.marketCap || "",
                      },
                    }))
                  }
                  onNewManualMarketCapChange={(value) =>
                    setNewManualByWatchlist((prev) => ({
                      ...prev,
                      [watchlistName]: {
                        ticker: prev[watchlistName]?.ticker || "",
                        marketCap: value,
                      },
                    }))
                  }
                  onAddManualStock={() => void handleAddManualStock(watchlistName)}
                  onRemoveTicker={(ticker) =>
                    handleRemoveTicker(watchlistName, ticker)
                  }
                  onRemoveManualStock={(ticker) =>
                    void handleRemoveManualStock(watchlistName, ticker)
                  }
                  onSetSortColumn={(value) =>
                    setSortColumnByWatchlist((prev) => ({
                      ...prev,
                      [watchlistName]: value,
                    }))
                  }
                  onSetSortAscending={(value) =>
                    setSortAscendingByWatchlist((prev) => ({
                      ...prev,
                      [watchlistName]: value,
                    }))
                  }
                  onToggleTickerExpand={(ticker) =>
                    handleToggleStockRowExpand(watchlistName, ticker)
                  }
                  onStartEditDescription={(ticker) =>
                    handleStartEditStockDescription(watchlistName, ticker)
                  }
                  onCancelEditDescription={(ticker) =>
                    handleCancelEditStockDescription(watchlistName, ticker)
                  }
                  onDraftDescriptionChange={(ticker, value) =>
                    handleDraftStockDescriptionChange(watchlistName, ticker, value)
                  }
                  onSaveDescription={(ticker, value) =>
                    void handleSaveStockDescription(watchlistName, ticker, value)
                  }
                  onStartEditSubcategory={(ticker) =>
                    handleStartEditStockSubcategory(watchlistName, ticker)
                  }
                  onCancelEditSubcategory={(ticker) =>
                    handleCancelEditStockSubcategory(watchlistName, ticker)
                  }
                  onDraftSubcategoryChange={(ticker, value) =>
                    handleDraftStockSubcategoryChange(watchlistName, ticker, value)
                  }
                  onSaveSubcategory={(ticker, value) =>
                    void handleSaveStockSubcategory(watchlistName, ticker, value)
                  }
                />
              );
            })}
          </CategorySection>
        );
      })}

      <div
        style={{
          marginTop: "1rem",
          paddingTop: "1rem",
          borderTop: "1px solid #e5e7eb",
        }}
      >
        {!isAdmin ? null : !showCreateCategoryControls ? (
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
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: "0.75rem",
            }}
          >
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Category Name"
              style={{
                padding: "0.75rem",
                borderRadius: "4px",
                border: "1px solid #ccc",
                minWidth: "220px",
              }}
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
