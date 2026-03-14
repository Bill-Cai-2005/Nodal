import { useEffect, useState } from "react";
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
  deleteCustomWatchlistFromDb,
  loadCustomWatchlistsFromDb,
  saveCustomWatchlistToDb,
} from "../../utils/watchlistCacheApi";
import CustomWatchlistsTable from "./CustomWatchlistsTable";

const CustomWatchlists = () => {
  const [watchlists, setWatchlists] = useState<WatchlistCache>({});
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [showCreateControls, setShowCreateControls] = useState(false);
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

  useEffect(() => {
    (async () => {
      try {
        const resp = await loadCustomWatchlistsFromDb();
        const dbWatchlists = resp.watchlists || [];
        if (dbWatchlists.length > 0) {
          const watchlistsMap: WatchlistCache = {};
          const watchlistDataMap: Record<string, StockData[]> = {};
          for (const w of dbWatchlists) {
            watchlistsMap[w.name] = w.tickers || [];
            watchlistDataMap[w.name] = (w.data || []) as StockData[];
          }
          setWatchlists(watchlistsMap);
          setWatchlistData(watchlistDataMap);
          saveWatchlists(watchlistsMap);
          return;
        }
      } catch (e) {
        console.warn("Failed to load custom watchlists from DB, falling back to local cache:", e);
      }

      const loaded = loadWatchlists();
      setWatchlists(loaded);
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

  const handleCreateWatchlist = async () => {
    const name = newWatchlistName.trim();
    if (!name) {
      alert("Please enter a watchlist name");
      return;
    }
    if (watchlists[name]) {
      alert("Watchlist already exists");
      return;
    }
    const updated = { ...watchlists, [name]: [] };
    setWatchlists(updated);
    saveWatchlists(updated);
    setExpandedByWatchlist((prev) => ({ ...prev, [name]: true }));
    setEditModeByWatchlist((prev) => ({ ...prev, [name]: true }));
    setSortAscendingByWatchlist((prev) => ({ ...prev, [name]: true }));
    setNewWatchlistName("");
    setShowCreateControls(false);
    try {
      await saveCustomWatchlistToDb(name, [], [], null);
    } catch (e: any) {
      alert(`Created locally but failed to save watchlist to DB: ${e.message}`);
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
      setWatchlists(updated);
      saveWatchlists(updated);
      setNewTickerByWatchlist((prev) => ({ ...prev, [watchlistName]: "" }));
      try {
        await saveCustomWatchlistToDb(
          watchlistName,
          updated[watchlistName] || [],
          watchlistData[watchlistName] || [],
          null
        );
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

    setWatchlists(updated);
    saveWatchlists(updated);
    setWatchlistData((prev) => ({ ...prev, [watchlistName]: filteredData }));
    try {
      await saveCustomWatchlistToDb(
        watchlistName,
        updated[watchlistName] || [],
        filteredData,
        null
      );
    } catch (e: any) {
      alert(`Removed locally but failed to sync DB: ${e.message}`);
    }
  };

  const handleDeleteWatchlist = async (watchlistName: string) => {
    if (!confirm(`Delete watchlist "${watchlistName}"?`)) return;
    const updated = { ...watchlists };
    delete updated[watchlistName];
    setWatchlists(updated);
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

      for (const watchlistName of watchlistNames) {
        const tickers = watchlists[watchlistName] || [];
        const results: StockData[] = [];

        for (const ticker of tickers) {
          completed += 1;
          setProgress({
            current: completed,
            total: totalTickers,
            message: `Processing ${watchlistName}: ${ticker}...`,
          });

          results.push(
            await fetchStockData(
              ticker,
              useCustomRange ? customStart : undefined,
              useCustomRange ? customEnd : undefined
            )
          );
        }

        nextData[watchlistName] = results;
        try {
          await saveCustomWatchlistToDb(
            watchlistName,
            watchlists[watchlistName] || [],
            results,
            new Date().toISOString()
          );
        } catch (e: any) {
          alert(`Refreshed locally for "${watchlistName}" but failed to save refreshed data to DB: ${e.message}`);
        }
      }

      setWatchlistData(nextData);
      setProgress({ current: 0, total: 0, message: "Refresh complete." });
    } catch (err: any) {
      alert(`Error: ${err.message}`);
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

  const watchlistNames = Object.keys(watchlists);

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
            </>
          )}
        </div>
      </div>

      {progress.message && (
        <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "#f0f0f0", borderRadius: "4px" }}>
          {progress.message}
          {progress.total > 0 && ` (${progress.current}/${progress.total})`}
        </div>
      )}

      {watchlistNames.length === 0 && (
        <div style={{ padding: "2rem", textAlign: "center", color: "#666666" }}>
          No watchlists created yet.
        </div>
      )}

      {watchlistNames.map((watchlistName) => {
        const isExpanded = expandedByWatchlist[watchlistName] ?? true;
        const isEditing = editModeByWatchlist[watchlistName] ?? false;
        const isBusy = loadingAll || validatingWatchlist === watchlistName;
        const tickers = watchlists[watchlistName] || [];
        const currentData = watchlistData[watchlistName] || [];

        return (
          <div
            key={watchlistName}
            style={{
              marginBottom: "2rem",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "1rem",
              backgroundColor: "#ffffff",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: isExpanded ? "1rem" : 0,
                gap: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: "1.2rem", marginBottom: "0.25rem" }}>
                  {watchlistName}
                </h2>
                <span style={{ fontSize: "0.85rem", color: "#666666" }}>{tickers.length} tickers</span>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedByWatchlist((prev) => ({ ...prev, [watchlistName]: !isExpanded }))
                  }
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#000000",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  {isExpanded ? "Fold" : "Unfold"}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setEditModeByWatchlist((prev) => ({ ...prev, [watchlistName]: !isEditing }))
                  }
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#000000",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  {isEditing ? "Done Editing" : "Edit"}
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteWatchlist(watchlistName)}
                  disabled={isBusy}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#8B0000",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    cursor: isBusy ? "not-allowed" : "pointer",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    opacity: isBusy ? 0.6 : 1,
                  }}
                >
                  Delete Watchlist
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
                  data={currentData}
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

      <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #e5e7eb" }}>
        {!showCreateControls ? (
          <button
            type="button"
            onClick={() => setShowCreateControls(true)}
            style={{
              padding: "0.75rem 1.25rem",
              backgroundColor: "#000000",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: 600,
            }}
          >
            Create New Watchlist
          </button>
        ) : (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="text"
              value={newWatchlistName}
              onChange={(e) => setNewWatchlistName(e.target.value)}
              placeholder="Watchlist Name"
              style={{ padding: "0.75rem", borderRadius: "4px", border: "1px solid #ccc", minWidth: "220px" }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateWatchlist();
                }
              }}
            />
            <button
              type="button"
              onClick={handleCreateWatchlist}
              style={{
                padding: "0.75rem 1rem",
                backgroundColor: "#000000",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateControls(false);
                setNewWatchlistName("");
              }}
              style={{
                padding: "0.75rem 1rem",
                backgroundColor: "#6b7280",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 600,
              }}
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

