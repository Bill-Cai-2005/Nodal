import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import {
  fetchStockData,
  validateTicker,
  type StockData,
} from "../../utils/polygonApi";
import {
  normalizeTickerInputLocal,
  parseNumberInput,
  renameKey,
} from "../../utils/watchlistUtils";
import {
  deleteCustomWatchlistFromDb,
  loadCustomWatchlistsFromDb,
  saveCustomWatchlistToDb,
  saveResourceTabDescription,
  getManagedThemeWatchlistLabel,
  getManagedThemeWatchlistTab,
  isManagedThemeWatchlistName,
  isResourceTabMetaWatchlistName,
  RESOURCE_TAB_WATCHLIST,
  AREAS_OF_INTEREST_DESCRIPTION,
  type CustomWatchlistDbEntry,
} from "../../utils/watchlistCacheApi";
import { runWithConcurrency } from "../../utils/concurrency";
import WatchlistSection from "./WatchlistSection";
import EditableTabDescription from "./EditableTabDescription";
import RefreshWatchlistsButton from "./RefreshWatchlistsButton";
import {
  primaryActionButtonStyle,
  refreshWatchlistsToolbarStyle,
} from "./watchlistButtonStyles";

const UNCATEGORIZED = "Uncategorized";

type WatchlistsMap = Record<string, string[]>;

type Props = {
  isAdmin?: boolean;
  resourceTab?: string;
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

const CustomWatchlists = ({
  isAdmin = false,
  resourceTab = RESOURCE_TAB_WATCHLIST,
}: Props) => {
  const [watchlists, setWatchlists] = useState<WatchlistsMap>({});
  const [watchlistOrder, setWatchlistOrder] = useState<string[]>([]);
  const [watchlistDescriptionByName, setWatchlistDescriptionByName] = useState<
    Record<string, string>
  >({});
  const [stockDescriptionsByWatchlist, setStockDescriptionsByWatchlist] =
    useState<Record<string, Record<string, string>>>({});

  // Avoid stale-closure overwrites during async refresh/save flows.
  const stockDescriptionsByWatchlistRef = useRef<
    Record<string, Record<string, string>>
  >({});
  useEffect(() => {
    stockDescriptionsByWatchlistRef.current = stockDescriptionsByWatchlist;
  }, [stockDescriptionsByWatchlist]);
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [showCreateWatchlistControls, setShowCreateWatchlistControls] =
    useState(false);
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
  const [popupMessage, setPopupMessage] = useState<string | null>(null);
  const [tabDescription, setTabDescription] = useState(AREAS_OF_INTEREST_DESCRIPTION);
  const [isEditingTabDescription, setIsEditingTabDescription] = useState(false);
  const [draftTabDescription, setDraftTabDescription] = useState("");
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

  const showPopup = (message: string) => setPopupMessage(message);
  const requireAdmin = (message = "Admin password required.") => {
    if (isAdmin) return true;
    showPopup(message);
    return false;
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
      const applyLoadedState = ({
        effectiveWatchlists,
      }: {
        effectiveWatchlists: CustomWatchlistDbEntry[];
      }) => {
        const watchlistsMap: WatchlistsMap = {};
        const watchlistDataMap: Record<string, StockData[]> = {};
        const watchlistDescriptions: Record<string, string> = {};
        const stockDescriptions: Record<string, Record<string, string>> = {};
        const orderedNames = [...effectiveWatchlists]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((w) => w.name);
        for (const w of effectiveWatchlists) {
          watchlistsMap[w.name] = w.tickers || [];
          watchlistDataMap[w.name] = (w.data || []) as StockData[];
          watchlistDescriptions[w.name] = w.description || "";
          stockDescriptions[w.name] = w.stock_descriptions || {};
        }
        setWatchlists(watchlistsMap);
        setWatchlistOrder(orderedNames);
        setWatchlistDescriptionByName(watchlistDescriptions);
        setWatchlistNameDraftByName(
          Object.fromEntries(
            Object.keys(watchlistsMap).map((name) => [name, name]),
          ),
        );
        setWatchlistDescriptionDraftByName(watchlistDescriptions);
        setStockDescriptionsByWatchlist(stockDescriptions);
        stockDescriptionsByWatchlistRef.current = stockDescriptions;
        setWatchlistData(watchlistDataMap);
      };

      try {
        const resp = await loadCustomWatchlistsFromDb(resourceTab);
        const metaWatchlist = (resp.watchlists || []).find((w) =>
          isResourceTabMetaWatchlistName(w.name),
        );
        const loadedTabDescription = metaWatchlist?.description?.trim()
          ? metaWatchlist.description
          : AREAS_OF_INTEREST_DESCRIPTION;
        setTabDescription(loadedTabDescription);
        applyLoadedState({
          effectiveWatchlists: (resp.watchlists || []).filter(
            (w) =>
              !isManagedThemeWatchlistName(w.name) &&
              !isResourceTabMetaWatchlistName(w.name),
          ),
        });
      } catch (e) {
        console.warn(
          "Failed to load custom watchlists from DB:",
          e,
        );
        applyLoadedState({ effectiveWatchlists: [] });
      }
    })();
  }, [resourceTab, isAdmin]);

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
    },
  ) => {
    const nextDescription =
      overrides?.description ?? watchlistDescriptionByName[watchlistName] ?? "";
    const nextOrder =
      overrides?.order ?? Math.max(0, watchlistOrder.indexOf(watchlistName));
    const nextCategory =
      (overrides?.category ?? UNCATEGORIZED).trim() || UNCATEGORIZED;
    const nextStockDescriptions =
      overrides?.stockDescriptions ??
      stockDescriptionsByWatchlistRef.current[watchlistName] ??
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
        resourceTab,
        stockDescriptions: nextStockDescriptions,
      },
    );
  };

  const handleCreateWatchlist = async () => {
    if (!requireAdmin()) return;
    const name = newWatchlistName.trim();
    if (!name) {
      showPopup("Please enter a watchlist name");
      return;
    }
    const managedTab = getManagedThemeWatchlistTab(name);
    if (managedTab) {
      showPopup(
        `"${name}" is managed on the ${getManagedThemeWatchlistLabel(name)} tab.`,
      );
      return;
    }
    if (isResourceTabMetaWatchlistName(name)) {
      showPopup("That watchlist name is reserved.");
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
    setStockDescriptionsByWatchlist((prev) => ({ ...prev, [name]: {} }));
    setExpandedByWatchlist((prev) => ({ ...prev, [name]: true }));
    setEditModeByWatchlist((prev) => ({ ...prev, [name]: true }));
    setSortAscendingByWatchlist((prev) => ({ ...prev, [name]: true }));
    setNewWatchlistName("");
    setShowCreateWatchlistControls(false);
    try {
      await saveWatchlist(name, [], [], null, {
        description: "",
        order: nextOrder.length - 1,
        category: UNCATEGORIZED,
        stockDescriptions: {},
      });
    } catch (e: any) {
      showPopup(
        `Created locally but failed to save watchlist to DB: ${e.message}`,
      );
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

  const getRenderableWatchlistNames = () => {
    const orderedWatchlistNames = watchlistOrder.filter(
      (name) => Boolean(watchlists[name]) && !isManagedThemeWatchlistName(name),
    );
    const unorderedWatchlistNames = Object.keys(watchlists).filter(
      (name) =>
        !orderedWatchlistNames.includes(name) &&
        !isManagedThemeWatchlistName(name),
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

  const handleSaveTabDescription = async () => {
    if (!requireAdmin()) return;
    const nextDescription = draftTabDescription.trim();
    setTabDescription(nextDescription);
    setIsEditingTabDescription(false);
    try {
      await saveResourceTabDescription(resourceTab, nextDescription);
    } catch (e: any) {
      showPopup(`Saved locally but failed to sync tab description: ${e.message}`);
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
      const order = Math.max(0, watchlistOrder.indexOf(watchlistName));
      const stockDescriptions =
        stockDescriptionsByWatchlist[watchlistName] || {};

      setWatchlists((prev) => {
        const next = { ...prev };
        delete next[watchlistName];
        next[nextName] = tickers;
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
      setStockDescriptionsByWatchlist((prev) =>
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
      setWatchlistOrder((prev) =>
        prev.map((name) => (name === watchlistName ? nextName : name)),
      );

      try {
        await saveCustomWatchlistToDb(nextName, tickers, data, null, {
          description: currentDescription,
          order,
          category: UNCATEGORIZED,
          resourceTab,
          stockDescriptions,
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
    setStockDescriptionsByWatchlist((prev) => {
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
                category: UNCATEGORIZED,
                resourceTab,
                stockDescriptions:
                  stockDescriptionsByWatchlistRef.current[watchlistName] || {},
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
        const row = await fetchStockData(ticker, customStart, customEnd, {
          includeReference: false,
        });
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

  const renderWatchlistSection = (sectionWatchlistName: string) => {
    const isExpanded = expandedByWatchlist[sectionWatchlistName] ?? true;
    const isEditing = editModeByWatchlist[sectionWatchlistName] ?? false;
    const isBusy = loadingAll || validatingWatchlist === sectionWatchlistName;
    const tickers = watchlists[sectionWatchlistName] || [];
    const currentData = watchlistData[sectionWatchlistName] || [];
    const manualRows = currentData.filter((row) => !tickers.includes(row.Ticker));

    return (
      <WatchlistSection
        key={`watchlist-${sectionWatchlistName}`}
        watchlistName={sectionWatchlistName}
        isAdmin={isAdmin}
        isExpanded={isExpanded}
        isEditing={isEditing}
        isBusy={isBusy}
        isDragOver={dragOverWatchlistName === sectionWatchlistName}
        isDragged={draggedWatchlistName === sectionWatchlistName}
        tickers={tickers}
        currentData={currentData}
        manualRows={manualRows}
        watchlistNameDraft={
          watchlistNameDraftByName[sectionWatchlistName] ?? sectionWatchlistName
        }
        editingWatchlistName={Boolean(
          editingWatchlistNameByName[sectionWatchlistName],
        )}
        watchlistDescription={
          watchlistDescriptionByName[sectionWatchlistName] || ""
        }
        watchlistDescriptionDraft={
          watchlistDescriptionDraftByName[sectionWatchlistName] || ""
        }
        editingWatchlistDescription={Boolean(
          editingWatchlistDescriptionByName[sectionWatchlistName],
        )}
        newTicker={newTickerByWatchlist[sectionWatchlistName] || ""}
        newManualTicker={newManualByWatchlist[sectionWatchlistName]?.ticker || ""}
        newManualMarketCap={
          newManualByWatchlist[sectionWatchlistName]?.marketCap || ""
        }
        sortColumn={sortColumnByWatchlist[sectionWatchlistName] || ""}
        sortAscending={sortAscendingByWatchlist[sectionWatchlistName] ?? true}
        useCustomRange={useCustomRange}
        formatValue={formatValue}
        stockDescriptionsByWatchlist={stockDescriptionsByWatchlist}
        expandedStockByWatchlist={expandedStockByWatchlist}
        editingStockByWatchlist={editingStockByWatchlist}
        stockDescriptionDraftByWatchlist={stockDescriptionDraftByWatchlist}
        onDragStart={(event) =>
          handleWatchlistDragStart(event, sectionWatchlistName)
        }
        onDragOver={(event) =>
          handleWatchlistDragOver(event, sectionWatchlistName)
        }
        onDrop={(event) =>
          void handleWatchlistDrop(event, sectionWatchlistName)
        }
        onDragEnd={handleWatchlistDragEnd}
        onToggleExpanded={() =>
          setExpandedByWatchlist((prev) => ({
            ...prev,
            [sectionWatchlistName]: !isExpanded,
          }))
        }
        onStartEditWatchlistName={() => {
          setWatchlistNameDraftByName((prev) => ({
            ...prev,
            [sectionWatchlistName]: sectionWatchlistName,
          }));
          setEditingWatchlistNameByName((prev) => ({
            ...prev,
            [sectionWatchlistName]: true,
          }));
        }}
        onWatchlistNameDraftChange={(value) =>
          setWatchlistNameDraftByName((prev) => ({
            ...prev,
            [sectionWatchlistName]: value,
          }))
        }
        onSaveWatchlistName={() =>
          void handleSaveWatchlistName(sectionWatchlistName)
        }
        onToggleEditMode={() => {
          const nextIsEditing = !isEditing;
          setEditModeByWatchlist((prev) => ({
            ...prev,
            [sectionWatchlistName]: nextIsEditing,
          }));
          setWatchlistDescriptionDraftByName((prev) => ({
            ...prev,
            [sectionWatchlistName]: nextIsEditing
              ? watchlistDescriptionByName[sectionWatchlistName] || ""
              : prev[sectionWatchlistName] || "",
          }));
          setEditingWatchlistDescriptionByName((prev) => ({
            ...prev,
            [sectionWatchlistName]: nextIsEditing,
          }));
        }}
        onDeleteWatchlist={() => handleDeleteWatchlist(sectionWatchlistName)}
        onCancelEditWatchlistDescription={() => {
          setWatchlistDescriptionDraftByName((prev) => ({
            ...prev,
            [sectionWatchlistName]:
              watchlistDescriptionByName[sectionWatchlistName] || "",
          }));
        }}
        onWatchlistDescriptionDraftChange={(value) =>
          setWatchlistDescriptionDraftByName((prev) => ({
            ...prev,
            [sectionWatchlistName]: value,
          }))
        }
        onSaveWatchlistDescription={() =>
          void handleSaveWatchlistDescription(sectionWatchlistName)
        }
        onNewTickerChange={(value) =>
          setNewTickerByWatchlist((prev) => ({
            ...prev,
            [sectionWatchlistName]: value,
          }))
        }
        onAddTicker={() => handleAddTicker(sectionWatchlistName)}
        onNewManualTickerChange={(value) =>
          setNewManualByWatchlist((prev) => ({
            ...prev,
            [sectionWatchlistName]: {
              ticker: value,
              marketCap: prev[sectionWatchlistName]?.marketCap || "",
            },
          }))
        }
        onNewManualMarketCapChange={(value) =>
          setNewManualByWatchlist((prev) => ({
            ...prev,
            [sectionWatchlistName]: {
              ticker: prev[sectionWatchlistName]?.ticker || "",
              marketCap: value,
            },
          }))
        }
        onAddManualStock={() => void handleAddManualStock(sectionWatchlistName)}
        onRemoveTicker={(ticker) =>
          handleRemoveTicker(sectionWatchlistName, ticker)
        }
        onRemoveManualStock={(ticker) =>
          void handleRemoveManualStock(sectionWatchlistName, ticker)
        }
        onSetSortColumn={(value) =>
          setSortColumnByWatchlist((prev) => ({
            ...prev,
            [sectionWatchlistName]: value,
          }))
        }
        onSetSortAscending={(value) =>
          setSortAscendingByWatchlist((prev) => ({
            ...prev,
            [sectionWatchlistName]: value,
          }))
        }
        onToggleTickerExpand={(ticker) =>
          handleToggleStockRowExpand(sectionWatchlistName, ticker)
        }
        onStartEditDescription={(ticker) =>
          handleStartEditStockDescription(sectionWatchlistName, ticker)
        }
        onCancelEditDescription={(ticker) =>
          handleCancelEditStockDescription(sectionWatchlistName, ticker)
        }
        onDraftDescriptionChange={(ticker, value) =>
          handleDraftStockDescriptionChange(sectionWatchlistName, ticker, value)
        }
        onSaveDescription={(ticker, value) =>
          void handleSaveStockDescription(sectionWatchlistName, ticker, value)
        }
      />
    );
  };

  return (
    <div style={{ width: "100%" }}>
      <EditableTabDescription
        description={tabDescription}
        isAdmin={isAdmin}
        isEditing={isEditingTabDescription}
        draft={draftTabDescription}
        onStartEdit={() => {
          setDraftTabDescription(tabDescription);
          setIsEditingTabDescription(true);
        }}
        onDraftChange={setDraftTabDescription}
        onSave={() => void handleSaveTabDescription()}
        onCancel={() => setIsEditingTabDescription(false)}
      />

      <div style={{ marginBottom: "1rem" }}>
        <div style={refreshWatchlistsToolbarStyle}>
          <RefreshWatchlistsButton
            onClick={handleRefreshAllWatchlists}
            disabled={loadingAll || Boolean(validatingWatchlist)}
            loading={loadingAll}
          />
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
                    ...primaryActionButtonStyle,
                    cursor:
                      loadingAll || validatingWatchlist
                        ? "not-allowed"
                        : "pointer",
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
          No watchlists yet. Create one to get started.
        </div>
      )}

      {watchlistNames.map((name) => renderWatchlistSection(name))}

      <div
        style={{
          marginTop: "1rem",
          paddingTop: "1rem",
          borderTop: "1px solid #e5e7eb",
        }}
      >
        {!isAdmin ? null : !showCreateWatchlistControls ? (
          <button
            type="button"
            onClick={() => setShowCreateWatchlistControls(true)}
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
            Create Watchlist
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
              value={newWatchlistName}
              onChange={(e) => setNewWatchlistName(e.target.value)}
              placeholder="Watchlist Name"
              style={{
                padding: "0.75rem",
                borderRadius: "4px",
                border: "1px solid #ccc",
                minWidth: "220px",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreateWatchlist();
                }
              }}
            />
            <button
              type="button"
              onClick={() => void handleCreateWatchlist()}
              style={primaryButtonStyle}
            >
              Create Watchlist
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateWatchlistControls(false);
                setNewWatchlistName("");
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
