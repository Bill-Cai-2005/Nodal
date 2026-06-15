import { useEffect, useRef, useState } from "react";
import {
  fetchStockData,
  validateTicker,
  type StockData,
} from "../../utils/polygonApi";
import {
  normalizeTickerInputLocal,
  parseNumberInput,
} from "../../utils/watchlistUtils";
import {
  loadCustomWatchlistsFromDb,
  saveCustomWatchlistToDb,
  AI_BUILDOUT_DESCRIPTION,
  AI_BUILDOUT_WATCHLIST_NAME,
  RESOURCE_TAB_AI_BUILDOUT,
} from "../../utils/watchlistCacheApi";
import { runWithConcurrency } from "../../utils/concurrency";
import {
  mergeUniqueTags,
  normalizeTagKey,
  setTagDescription,
  stockMatchesTags,
  toggleKeyTag,
} from "../../utils/tagUtils";
import TagFilterBar from "./TagFilterBar";
import AiBuildoutTable from "./AiBuildoutTable";
import RefreshWatchlistsButton from "./RefreshWatchlistsButton";
import {
  primaryActionButtonStyle,
  refreshWatchlistsToolbarStyle,
} from "./watchlistButtonStyles";

const primaryButtonStyle = {
  padding: "0.75rem 1rem",
  backgroundColor: "#000000",
  color: "#ffffff",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 600,
};

type Props = {
  isAdmin?: boolean;
};

const AiBuildoutWatchlist = ({ isAdmin = false }: Props) => {
  const [tickers, setTickers] = useState<string[]>([]);
  const [watchlistData, setWatchlistData] = useState<StockData[]>([]);
  const [stockDescriptions, setStockDescriptions] = useState<
    Record<string, string>
  >({});
  const [stockTags, setStockTags] = useState<Record<string, string[]>>({});
  const [tagDescriptions, setTagDescriptions] = useState<Record<string, string>>(
    {},
  );
  const [keyTags, setKeyTags] = useState<string[]>([]);
  const stockDescriptionsRef = useRef(stockDescriptions);
  const stockTagsRef = useRef(stockTags);
  const tagDescriptionsRef = useRef(tagDescriptions);
  const keyTagsRef = useRef(keyTags);

  const [loadingAll, setLoadingAll] = useState(false);
  const [validating, setValidating] = useState(false);
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    message: "",
  });
  const [popupMessage, setPopupMessage] = useState<string | null>(null);

  const [newTicker, setNewTicker] = useState("");
  const [newManualTicker, setNewManualTicker] = useState("");
  const [newManualMarketCap, setNewManualMarketCap] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);

  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customStart, setCustomStart] = useState<Date>(new Date());
  const [customEnd, setCustomEnd] = useState<Date>(new Date());

  const [sortColumn, setSortColumn] = useState("");
  const [sortAscending, setSortAscending] = useState(true);

  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagSearchQuery, setTagSearchQuery] = useState("");

  const [expandedByTicker, setExpandedByTicker] = useState<
    Record<string, boolean>
  >({});
  const [editingByTicker, setEditingByTicker] = useState<
    Record<string, boolean>
  >({});
  const [draftDescriptionByTicker, setDraftDescriptionByTicker] = useState<
    Record<string, string>
  >({});
  const [editingTagsByTicker, setEditingTagsByTicker] = useState<
    Record<string, boolean>
  >({});
  const [draftTagsByTicker, setDraftTagsByTicker] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    stockDescriptionsRef.current = stockDescriptions;
  }, [stockDescriptions]);
  useEffect(() => {
    stockTagsRef.current = stockTags;
  }, [stockTags]);
  useEffect(() => {
    tagDescriptionsRef.current = tagDescriptions;
  }, [tagDescriptions]);
  useEffect(() => {
    keyTagsRef.current = keyTags;
  }, [keyTags]);

  const showPopup = (message: string) => setPopupMessage(message);

  const saveToDb = async (
    nextTickers: string[],
    nextData: StockData[],
    lastRefreshed: string | null = null,
    overrides?: {
      stockDescriptions?: Record<string, string>;
      stockTags?: Record<string, string[]>;
      tagDescriptions?: Record<string, string>;
      keyTags?: string[];
    },
  ) => {
    await saveCustomWatchlistToDb(
      AI_BUILDOUT_WATCHLIST_NAME,
      nextTickers,
      nextData,
      lastRefreshed,
      {
        description: "",
        order: 0,
        category: "Uncategorized",
        resourceTab: RESOURCE_TAB_AI_BUILDOUT,
        stockDescriptions:
          overrides?.stockDescriptions ?? stockDescriptionsRef.current,
        stockTags: overrides?.stockTags ?? stockTagsRef.current,
        tagDescriptions:
          overrides?.tagDescriptions ?? tagDescriptionsRef.current,
        keyTags: overrides?.keyTags ?? keyTagsRef.current,
      },
    );
  };

  useEffect(() => {
    (async () => {
      try {
        const resp = await loadCustomWatchlistsFromDb(RESOURCE_TAB_AI_BUILDOUT);
        const wl =
          resp.watchlists?.find((w) => w.name === AI_BUILDOUT_WATCHLIST_NAME) ||
          resp.watchlists?.[0];
        if (!wl) return;

        const loadedTags: Record<string, string[]> = {};
        for (const [ticker, tags] of Object.entries(wl.stock_tags || {})) {
          loadedTags[ticker] = Array.isArray(tags) ? tags : [];
        }

        setTickers(wl.tickers || []);
        setWatchlistData((wl.data || []) as StockData[]);
        setStockDescriptions(wl.stock_descriptions || {});
        setStockTags(loadedTags);
        setTagDescriptions(wl.tag_descriptions || {});
        setKeyTags(wl.key_tags || []);
        stockDescriptionsRef.current = wl.stock_descriptions || {};
        stockTagsRef.current = loadedTags;
        tagDescriptionsRef.current = wl.tag_descriptions || {};
        keyTagsRef.current = wl.key_tags || [];
      } catch (e) {
        console.warn("Failed to load AI Buildout watchlist:", e);
      }
    })();
  }, []);

  const formatValue = (value: number | null): string => {
    if (value === null) return "N/A";
    if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    if (typeof value === "number") return value.toFixed(2);
    return String(value);
  };

  const manualRows = watchlistData.filter((row) => !tickers.includes(row.Ticker));
  const marketRows = watchlistData.filter((row) => tickers.includes(row.Ticker));

  const tableRows = [
    ...marketRows.map((row) => ({
      ...row,
      Description: stockDescriptions[row.Ticker] || "",
      Tags: stockTags[row.Ticker] || [],
      isManual: false,
    })),
    ...manualRows.map((row) => ({
      ...row,
      Description: stockDescriptions[row.Ticker] || "",
      Tags: stockTags[row.Ticker] || [],
      isManual: true,
    })),
  ].filter((row) => stockMatchesTags(row.Tags || [], selectedTags));

  const handleToggleFilterTag = (tag: string) => {
    setSelectedTags((prev) => {
      const exists = prev.some(
        (selected) => normalizeTagKey(selected) === normalizeTagKey(tag),
      );
      if (exists) {
        return prev.filter(
          (selected) => normalizeTagKey(selected) !== normalizeTagKey(tag),
        );
      }
      return [...prev, tag];
    });
  };

  const handleSaveTagDescription = async (tag: string, description: string) => {
    const nextDescriptions = setTagDescription(tagDescriptions, tag, description);
    setTagDescriptions(nextDescriptions);
    tagDescriptionsRef.current = nextDescriptions;
    try {
      await saveToDb(tickers, watchlistData, null, {
        tagDescriptions: nextDescriptions,
      });
    } catch (e: any) {
      showPopup(`Saved locally but failed to sync tag description: ${e.message}`);
    }
  };

  const handleToggleKeyTag = async (tag: string) => {
    const nextKeyTags = toggleKeyTag(keyTags, tag);
    setKeyTags(nextKeyTags);
    keyTagsRef.current = nextKeyTags;
    try {
      await saveToDb(tickers, watchlistData, null, { keyTags: nextKeyTags });
    } catch (e: any) {
      showPopup(`Saved locally but failed to sync key theme: ${e.message}`);
    }
  };

  const handleAddTicker = async () => {
    const inputTicker = newTicker.trim();
    if (!inputTicker) {
      showPopup("Please enter a ticker");
      return;
    }
    const ticker = normalizeTickerInputLocal(inputTicker);
    if (!ticker) {
      showPopup("Please enter a ticker");
      return;
    }
    if (
      tickers.includes(ticker) ||
      watchlistData.some((row) => row.Ticker === ticker)
    ) {
      showPopup(`${ticker} already exists in this watchlist`);
      return;
    }

    try {
      setValidating(true);
      const validation = await validateTicker(ticker);
      if (!validation.valid) {
        showPopup(validation.reason || "Invalid ticker");
        return;
      }
      const nextTickers = [...tickers, ticker];
      const nextDescriptions = {
        ...stockDescriptions,
        [ticker]: stockDescriptions[ticker] || "",
      };
      setTickers(nextTickers);
      setStockDescriptions(nextDescriptions);
      stockDescriptionsRef.current = nextDescriptions;
      setNewTicker("");
      await saveToDb(nextTickers, watchlistData, null, {
        stockDescriptions: nextDescriptions,
      });
    } catch (err: any) {
      showPopup(`Error: ${err.message}`);
    } finally {
      setValidating(false);
    }
  };

  const handleAddManualStock = async () => {
    const ticker = normalizeTickerInputLocal(newManualTicker || "");
    if (!ticker) {
      showPopup("Please enter a ticker for the manual stock.");
      return;
    }
    const marketCap = parseNumberInput(newManualMarketCap);
    if (marketCap === null) {
      showPopup("Please enter a valid Market Cap (e.g. 350B or 1230000000).");
      return;
    }
    if (
      tickers.includes(ticker) ||
      watchlistData.some((row) => row.Ticker === ticker)
    ) {
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
    const nextData = [...watchlistData, manualRow];
    const nextDescriptions = {
      ...stockDescriptions,
      [ticker]: stockDescriptions[ticker] || "",
    };
    setWatchlistData(nextData);
    setStockDescriptions(nextDescriptions);
    stockDescriptionsRef.current = nextDescriptions;
    setNewManualTicker("");
    setNewManualMarketCap("");
    try {
      await saveToDb(tickers, nextData, null, {
        stockDescriptions: nextDescriptions,
      });
    } catch (e: any) {
      showPopup(`Added locally but failed to sync DB: ${e.message}`);
    }
  };

  const handleRemoveTicker = async (ticker: string) => {
    const nextTickers = tickers.filter((t) => t !== ticker);
    const nextData = watchlistData.filter((row) => row.Ticker !== ticker);
    const nextDescriptions = { ...stockDescriptions };
    const nextTags = { ...stockTags };
    delete nextDescriptions[ticker];
    delete nextTags[ticker];
    setTickers(nextTickers);
    setWatchlistData(nextData);
    setStockDescriptions(nextDescriptions);
    setStockTags(nextTags);
    stockDescriptionsRef.current = nextDescriptions;
    stockTagsRef.current = nextTags;
    try {
      await saveToDb(nextTickers, nextData, null, {
        stockDescriptions: nextDescriptions,
        stockTags: nextTags,
      });
    } catch (e: any) {
      showPopup(`Removed locally but failed to sync DB: ${e.message}`);
    }
  };

  const handleRefresh = async () => {
    if (tickers.length === 0) {
      showPopup("No tickers available to refresh.");
      return;
    }
    try {
      setLoadingAll(true);
      setProgress({
        current: 0,
        total: tickers.length,
        message: "Fetching full data...",
      });
      let completed = 0;
      const existingByTicker = Object.fromEntries(
        watchlistData.map((row) => [row.Ticker, row]),
      );
      const rowsByTicker: Record<string, StockData> = {};
      await runWithConcurrency(tickers, 24, async (ticker) => {
        const fetched = await fetchStockData(ticker, undefined, undefined);
        const existing = existingByTicker[ticker];
        rowsByTicker[ticker] = {
          ...fetched,
          "Custom Dates Change %": existing?.["Custom Dates Change %"] ?? null,
        };
        completed += 1;
        if (completed % 10 === 0 || completed === tickers.length) {
          setProgress({
            current: completed,
            total: tickers.length,
            message: `Refreshing (${completed}/${tickers.length})...`,
          });
        }
      });
      const results = tickers
        .map((ticker) => rowsByTicker[ticker])
        .filter(Boolean) as StockData[];
      const nextData = [...results, ...manualRows];
      setWatchlistData(nextData);
      await saveToDb(tickers, nextData, new Date().toISOString());
      setProgress({ current: 0, total: 0, message: "Refresh complete." });
    } catch (err: any) {
      showPopup(`Error: ${err.message}`);
    } finally {
      setLoadingAll(false);
    }
  };

  const handleLoadHistoricalData = async () => {
    if (!useCustomRange) {
      showPopup("Enable 'Use Custom Time Range' first.");
      return;
    }
    if (marketRows.length === 0) {
      showPopup("Refresh watchlists first to load market data.");
      return;
    }
    const tasks = tickers.filter((ticker) =>
      Boolean(marketRows.find((row) => row.Ticker === ticker)),
    );
    if (tasks.length === 0) return;

    try {
      setLoadingAll(true);
      setProgress({
        current: 0,
        total: tasks.length,
        message: "Loading historical data...",
      });
      let completed = 0;
      const customByTicker: Record<string, number | null> = {};
      await runWithConcurrency(tasks, 24, async (ticker) => {
        const row = await fetchStockData(
          ticker,
          customStart,
          customEnd,
          undefined,
          { includeReference: false },
        );
        customByTicker[ticker] = row["Custom Dates Change %"];
        completed += 1;
        if (completed % 10 === 0 || completed === tasks.length) {
          setProgress({
            current: completed,
            total: tasks.length,
            message: "Loading historical data...",
          });
        }
      });
      setWatchlistData((prev) =>
        prev.map((row) => {
          const value = customByTicker[row.Ticker];
          if (value === undefined) return row;
          return { ...row, "Custom Dates Change %": value };
        }),
      );
      setProgress({ current: 0, total: 0, message: "Historical data loaded." });
    } catch (err: any) {
      showPopup(`Error loading historical data: ${err.message}`);
    } finally {
      setLoadingAll(false);
    }
  };

  const handleSaveDescription = async (ticker: string, description: string) => {
    const nextDescriptions = { ...stockDescriptions, [ticker]: description };
    stockDescriptionsRef.current = nextDescriptions;
    setStockDescriptions(nextDescriptions);
    setEditingByTicker((prev) => ({ ...prev, [ticker]: false }));
    try {
      await saveToDb(tickers, watchlistData, null, {
        stockDescriptions: nextDescriptions,
      });
    } catch (e: any) {
      showPopup(`Saved locally but failed to sync description: ${e.message}`);
    }
  };

  const handleSaveTags = async (ticker: string, tags: string[]) => {
    const uniqueTags = mergeUniqueTags([], tags);
    const nextTags = { ...stockTags, [ticker]: uniqueTags };
    if (uniqueTags.length === 0) delete nextTags[ticker];
    stockTagsRef.current = nextTags;
    setStockTags(nextTags);
    setEditingTagsByTicker((prev) => ({ ...prev, [ticker]: false }));
    try {
      await saveToDb(tickers, watchlistData, null, { stockTags: nextTags });
    } catch (e: any) {
      showPopup(`Saved locally but failed to sync tags: ${e.message}`);
    }
  };

  const isBusy = loadingAll || validating;

  useEffect(() => {
    if (!isAdmin) setIsEditMode(false);
  }, [isAdmin]);

  return (
    <div style={{ width: "100%" }}>
      <p
        style={{
          maxWidth: "720px",
          margin: "0 auto 1.5rem",
          textAlign: "center",
          color: "#4b5563",
          fontSize: "1rem",
          lineHeight: 1.6,
        }}
      >
        {AI_BUILDOUT_DESCRIPTION}
      </p>

      <div style={{ marginBottom: "1rem" }}>
        <div style={refreshWatchlistsToolbarStyle}>
          <RefreshWatchlistsButton
            onClick={handleRefresh}
            disabled={isBusy}
            loading={loadingAll}
          />
          {isAdmin && (
            <button
              type="button"
              onClick={() => setIsEditMode((prev) => !prev)}
              style={{
                padding: "0.75rem 1.5rem",
                minHeight: "44px",
                backgroundColor: isEditMode ? "#111827" : "#ffffff",
                color: isEditMode ? "#ffffff" : "#111827",
                border: "1px solid #111827",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.875rem",
                fontFamily: "Montserrat, sans-serif",
                boxSizing: "border-box",
              }}
            >
              {isEditMode ? "Done Editing" : "Edit Watchlist"}
            </button>
          )}
        </div>

        {isAdmin && (
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
                  style={{
                    padding: "0.5rem",
                    borderRadius: "4px",
                    border: "1px solid #ccc",
                  }}
                />
                <input
                  type="date"
                  value={customEnd.toISOString().split("T")[0]}
                  onChange={(e) => setCustomEnd(new Date(e.target.value))}
                  style={{
                    padding: "0.5rem",
                    borderRadius: "4px",
                    border: "1px solid #ccc",
                  }}
                />
                <button
                  type="button"
                  onClick={handleLoadHistoricalData}
                  disabled={isBusy}
                  style={{
                    ...primaryActionButtonStyle,
                    opacity: isBusy ? 0.6 : 1,
                    cursor: isBusy ? "not-allowed" : "pointer",
                  }}
                >
                  Load Historical Data
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <TagFilterBar
        tagsByTicker={stockTags}
        tagDescriptions={tagDescriptions}
        keyTags={keyTags}
        selectedTags={selectedTags}
        searchQuery={tagSearchQuery}
        isAdmin={isAdmin}
        onSearchQueryChange={setTagSearchQuery}
        onToggleTag={handleToggleFilterTag}
        onToggleKeyTag={(tag) => void handleToggleKeyTag(tag)}
        onClearTags={() => setSelectedTags([])}
        onSaveTagDescription={(tag, description) =>
          void handleSaveTagDescription(tag, description)
        }
      />

      {isEditMode && (
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            marginBottom: "1rem",
            alignItems: "center",
          }}
        >
          <input
            type="text"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value)}
            placeholder="Add ticker (e.g. NVDA)"
            style={{
              padding: "0.75rem",
              borderRadius: "4px",
              border: "1px solid #ccc",
              minWidth: "180px",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAddTicker();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void handleAddTicker()}
            disabled={isBusy}
            style={primaryButtonStyle}
          >
            Add Ticker
          </button>
          <input
            type="text"
            value={newManualTicker}
            onChange={(e) => setNewManualTicker(e.target.value)}
            placeholder="International ticker"
            style={{
              padding: "0.75rem",
              borderRadius: "4px",
              border: "1px solid #ccc",
              minWidth: "160px",
            }}
          />
          <input
            type="text"
            value={newManualMarketCap}
            onChange={(e) => setNewManualMarketCap(e.target.value)}
            placeholder="Market cap"
            style={{
              padding: "0.75rem",
              borderRadius: "4px",
              border: "1px solid #ccc",
              minWidth: "120px",
            }}
          />
          <button
            type="button"
            onClick={() => void handleAddManualStock()}
            style={primaryButtonStyle}
          >
            Add International Stock
          </button>
        </div>
      )}

      {progress.message && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.75rem",
            background: "#f0f0f0",
            borderRadius: "4px",
          }}
        >
          {progress.message}
          {progress.total > 0 && ` (${progress.current}/${progress.total})`}
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
          }}
        >
          <div style={{ whiteSpace: "pre-wrap", fontSize: "0.9rem" }}>
            {popupMessage}
          </div>
          <button
            type="button"
            onClick={() => setPopupMessage(null)}
            style={{
              marginTop: "0.5rem",
              padding: "0.35rem 0.75rem",
              borderRadius: "4px",
              border: "1px solid #4b5563",
              background: "transparent",
              color: "#d1d5db",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      )}

      <AiBuildoutTable
        data={tableRows}
        keyTags={keyTags}
        formatValue={formatValue}
        isAdmin={isAdmin}
        showCustomDatesChange={useCustomRange}
        sortColumn={sortColumn}
        setSortColumn={setSortColumn}
        sortAscending={sortAscending}
        setSortAscending={setSortAscending}
        expandedByTicker={expandedByTicker}
        editingByTicker={editingByTicker}
        draftDescriptionByTicker={draftDescriptionByTicker}
        editingTagsByTicker={editingTagsByTicker}
        draftTagsByTicker={draftTagsByTicker}
        isEditMode={isEditMode}
        onToggleTickerExpand={(ticker) =>
          setExpandedByTicker((prev) => ({
            ...prev,
            [ticker]: !(prev[ticker] ?? false),
          }))
        }
        onStartEditDescription={(ticker) => {
          setDraftDescriptionByTicker((prev) => ({
            ...prev,
            [ticker]: stockDescriptions[ticker] || "",
          }));
          setEditingByTicker((prev) => ({ ...prev, [ticker]: true }));
        }}
        onCancelEditDescription={(ticker) =>
          setEditingByTicker((prev) => ({ ...prev, [ticker]: false }))
        }
        onDraftDescriptionChange={(ticker, value) =>
          setDraftDescriptionByTicker((prev) => ({ ...prev, [ticker]: value }))
        }
        onSaveDescription={(ticker, value) => void handleSaveDescription(ticker, value)}
        onStartEditTags={(ticker) => {
          setDraftTagsByTicker((prev) => ({
            ...prev,
            [ticker]: (stockTags[ticker] || []).join(", "),
          }));
          setEditingTagsByTicker((prev) => ({ ...prev, [ticker]: true }));
        }}
        onCancelEditTags={(ticker) =>
          setEditingTagsByTicker((prev) => ({ ...prev, [ticker]: false }))
        }
        onDraftTagsChange={(ticker, value) =>
          setDraftTagsByTicker((prev) => ({ ...prev, [ticker]: value }))
        }
        onSaveTags={(ticker, tags) => void handleSaveTags(ticker, tags)}
        onRemoveTicker={(ticker) => void handleRemoveTicker(ticker)}
      />
    </div>
  );
};

export default AiBuildoutWatchlist;
