import { useState, useEffect } from "react";
import {
  fetchSnapshotBatch,
  fetchTickerReference,
  validateTicker,
  type StockData,
} from "../../utils/polygonApi";
import {
  loadWatchlists,
  saveWatchlists,
  loadStartPriceCache,
  loadTickerRefCache,
  saveTickerRefCache,
  type WatchlistCache,
} from "../../utils/watchlistCache";

const CustomWatchlists = () => {
  const [watchlists, setWatchlists] = useState<WatchlistCache>({});
  const [selectedWatchlist, setSelectedWatchlist] = useState<string>("");
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [newTicker, setNewTicker] = useState("");
  const [watchlistData, setWatchlistData] = useState<Record<string, StockData[]>>({});
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: "" });
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customStart, setCustomStart] = useState<Date>(new Date());
  const [customEnd, setCustomEnd] = useState<Date>(new Date());
  const [sortColumn, setSortColumn] = useState<string>("");
  const [sortAscending, setSortAscending] = useState(true);

  useEffect(() => {
    const loaded = loadWatchlists();
    setWatchlists(loaded);
    if (Object.keys(loaded).length > 0) {
      setSelectedWatchlist(Object.keys(loaded)[0]);
    }
  }, []);

  const handleCreateWatchlist = () => {
    if (!newWatchlistName.trim()) {
      alert("Please enter a watchlist name");
      return;
    }
    if (watchlists[newWatchlistName]) {
      alert("Watchlist already exists");
      return;
    }
    const updated = { ...watchlists, [newWatchlistName]: [] };
    setWatchlists(updated);
    saveWatchlists(updated);
    setSelectedWatchlist(newWatchlistName);
    setNewWatchlistName("");
  };

  const handleAddTicker = async () => {
    if (!selectedWatchlist || !newTicker.trim()) {
      alert("Please select a watchlist and enter a ticker");
      return;
    }
    const ticker = newTicker.trim().toUpperCase();
    if (watchlists[selectedWatchlist].includes(ticker)) {
      alert(`${ticker} already in watchlist`);
      return;
    }

    try {
      setLoading(true);
      setProgress({ current: 0, total: 0, message: `Validating ${ticker}...` });
      const validation = await validateTicker(ticker);
      if (!validation.valid) {
        alert(validation.reason || "Invalid ticker");
        return;
      }
      const updated = {
        ...watchlists,
        [selectedWatchlist]: [...watchlists[selectedWatchlist], ticker],
      };
      setWatchlists(updated);
      saveWatchlists(updated);
      setNewTicker("");
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTicker = (ticker: string) => {
    if (!selectedWatchlist) return;
    const updated = {
      ...watchlists,
      [selectedWatchlist]: watchlists[selectedWatchlist].filter((t) => t !== ticker),
    };
    setWatchlists(updated);
    saveWatchlists(updated);
  };

  const handleDeleteWatchlist = () => {
    if (!selectedWatchlist) return;
    if (!confirm(`Delete watchlist "${selectedWatchlist}"?`)) return;
    const updated = { ...watchlists };
    delete updated[selectedWatchlist];
    setWatchlists(updated);
    saveWatchlists(updated);
    delete watchlistData[selectedWatchlist];
    setWatchlistData({ ...watchlistData });
    if (Object.keys(updated).length > 0) {
      setSelectedWatchlist(Object.keys(updated)[0]);
    } else {
      setSelectedWatchlist("");
    }
  };

  const handleRefreshWatchlist = async () => {
    if (!selectedWatchlist || watchlists[selectedWatchlist].length === 0) {
      alert("Watchlist is empty");
      return;
    }

    try {
      setLoading(true);
      const tickers = watchlists[selectedWatchlist];
      setProgress({ current: 0, total: tickers.length, message: "Fetching data..." });

      const refCache = loadTickerRefCache();
      const startPriceCache = useCustomRange ? loadStartPriceCache() : null;
      const dateKey = useCustomRange ? customStart.toISOString().split("T")[0] : null;

      const snapshots = await fetchSnapshotBatch(tickers);
      const results: StockData[] = [];

      for (let i = 0; i < tickers.length; i++) {
        const ticker = tickers[i];
        setProgress({
          current: i + 1,
          total: tickers.length,
          message: `Processing ${ticker}...`,
        });

        const snap = snapshots[ticker];
        if (!snap) {
          results.push({
            Ticker: ticker,
            "Starting Price": null,
            "Current Price": null,
            "Market Cap": refCache[ticker]?.market_cap || null,
            "Daily Stock Change %": null,
            "Change Since Start %": null,
            Volume: null,
            Industry: refCache[ticker]?.industry || null,
            Error: "Missing snapshot",
          });
          continue;
        }

        const day = snap.day || {};
        const prevDay = snap.prevDay || {};
        const lastTrade = snap.lastTrade || {};
        const prevClose = prevDay.c ? parseFloat(prevDay.c) : null;
        const currentPrice = lastTrade.p ? parseFloat(lastTrade.p) : day.c ? parseFloat(day.c) : null;
        const volume = day.v ? parseFloat(day.v) : null;

        let changePct: number | null = null;
        if (prevClose && prevClose !== 0 && currentPrice !== null) {
          changePct = ((currentPrice - prevClose) / prevClose) * 100;
        }

        let startingPrice = prevClose;
        let changeSinceStart: number | null = null;

        if (useCustomRange && dateKey && startPriceCache?.[dateKey]?.prices) {
          const cachedStart = startPriceCache[dateKey].prices[ticker];
          if (cachedStart !== undefined) {
            startingPrice = cachedStart;
            if (currentPrice !== null && cachedStart !== 0) {
              changeSinceStart = ((currentPrice - cachedStart) / cachedStart) * 100;
            }
          }
        }

        results.push({
          Ticker: ticker,
          "Starting Price": startingPrice,
          "Current Price": currentPrice,
          "Market Cap": refCache[ticker]?.market_cap || null,
          "Daily Stock Change %": changePct,
          "Change Since Start %": changeSinceStart,
          Volume: volume,
          Industry: refCache[ticker]?.industry || null,
          Error: null,
        });
      }

      setWatchlistData({ ...watchlistData, [selectedWatchlist]: results });
      setProgress({ current: 0, total: 0, message: "✅ Refresh complete!" });
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCalculateMarketCap = async () => {
    if (!selectedWatchlist || !watchlistData[selectedWatchlist]) {
      alert("No data available");
      return;
    }

    try {
      setLoading(true);
      const refCache = loadTickerRefCache();
      const data = watchlistData[selectedWatchlist];
      const tickersToFetch = data.map((d) => d.Ticker).filter((t) => !refCache[t]?.market_cap);

      for (let i = 0; i < tickersToFetch.length; i++) {
        const ticker = tickersToFetch[i];
        setProgress({
          current: i + 1,
          total: tickersToFetch.length,
          message: `Fetching ${ticker}...`,
        });
        const ref = await fetchTickerReference(ticker);
        if (ref) {
          refCache[ticker] = ref;
        }
      }

      saveTickerRefCache(refCache);

      const updatedData = data.map((row) => ({
        ...row,
        "Market Cap": refCache[row.Ticker]?.market_cap || row["Market Cap"],
        Industry: refCache[row.Ticker]?.industry || row.Industry,
      }));

      setWatchlistData({ ...watchlistData, [selectedWatchlist]: updatedData });
      setProgress({ current: 0, total: 0, message: "✅ Market cap calculation complete!" });
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
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

  const currentData = selectedWatchlist ? watchlistData[selectedWatchlist] || [] : [];
  const sortedData = [...currentData].sort((a, b) => {
    if (!sortColumn) return 0;
    const aVal = (a as any)[sortColumn];
    const bVal = (b as any)[sortColumn];
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortAscending ? comparison : -comparison;
  });

  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: "1.5rem", marginBottom: "1rem" }}>
          Create New Watchlist
        </h2>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <input
            type="text"
            value={newWatchlistName}
            onChange={(e) => setNewWatchlistName(e.target.value)}
            placeholder="Watchlist Name"
            style={{ padding: "0.75rem", borderRadius: "4px", border: "1px solid #ccc", flex: 1, maxWidth: "300px" }}
            onKeyPress={(e) => {
              if (e.key === "Enter") handleCreateWatchlist();
            }}
          />
          <button
            onClick={handleCreateWatchlist}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: "#000000",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 600,
            }}
          >
            Create Watchlist
          </button>
        </div>
      </div>

      {Object.keys(watchlists).length > 0 && (
        <>
          <div style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: "1.5rem", marginBottom: "1rem" }}>
              Select Watchlist
            </h2>
            <select
              value={selectedWatchlist}
              onChange={(e) => setSelectedWatchlist(e.target.value)}
              style={{
                padding: "0.75rem",
                borderRadius: "4px",
                border: "1px solid #ccc",
                fontSize: "1rem",
                minWidth: "200px",
              }}
            >
              {Object.keys(watchlists).map((name) => (
                <option key={name} value={name}>
                  {name} ({watchlists[name].length} tickers)
                </option>
              ))}
            </select>
          </div>

          {selectedWatchlist && (
            <>
              <div style={{ marginBottom: "2rem" }}>
                <h3 style={{ fontFamily: "Montserrat, sans-serif", fontSize: "1.25rem", marginBottom: "1rem" }}>
                  Manage {selectedWatchlist}
                </h3>
                <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    value={newTicker}
                    onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                    placeholder="Add Ticker"
                    style={{ padding: "0.75rem", borderRadius: "4px", border: "1px solid #ccc", width: "150px" }}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") handleAddTicker();
                    }}
                  />
                  <button
                    onClick={handleAddTicker}
                    disabled={loading}
                    style={{
                      padding: "0.75rem 1.5rem",
                      backgroundColor: "#000000",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "6px",
                      cursor: loading ? "not-allowed" : "pointer",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      opacity: loading ? 0.6 : 1,
                    }}
                  >
                    Add Ticker
                  </button>

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

                  <button
                    onClick={handleRefreshWatchlist}
                    disabled={loading}
                    style={{
                      padding: "0.75rem 1.5rem",
                      backgroundColor: "#000000",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "6px",
                      cursor: loading ? "not-allowed" : "pointer",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      opacity: loading ? 0.6 : 1,
                    }}
                  >
                    🔄 Refresh Watchlist
                  </button>

                  <button
                    onClick={handleCalculateMarketCap}
                    disabled={loading}
                    style={{
                      padding: "0.75rem 1.5rem",
                      backgroundColor: "#000000",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "6px",
                      cursor: loading ? "not-allowed" : "pointer",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      opacity: loading ? 0.6 : 1,
                    }}
                  >
                    🧮 Calculate Market Cap
                  </button>

                  <button
                    onClick={handleDeleteWatchlist}
                    style={{
                      padding: "0.75rem 1.5rem",
                      backgroundColor: "#dc2626",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                    }}
                  >
                    🗑️ Delete Watchlist
                  </button>
                </div>

                {progress.message && (
                  <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "#f0f0f0", borderRadius: "4px" }}>
                    {progress.message}
                    {progress.total > 0 && ` (${progress.current}/${progress.total})`}
                  </div>
                )}

                <div style={{ marginBottom: "1rem" }}>
                  <h4 style={{ fontFamily: "Montserrat, sans-serif", marginBottom: "0.5rem" }}>
                    Tickers in {selectedWatchlist}
                  </h4>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {watchlists[selectedWatchlist].map((ticker) => (
                      <div
                        key={ticker}
                        style={{
                          padding: "0.5rem 1rem",
                          background: "#f0f0f0",
                          borderRadius: "4px",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        <span>{ticker}</span>
                        <button
                          onClick={() => handleRemoveTicker(ticker)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#dc2626",
                            cursor: "pointer",
                            fontSize: "1.25rem",
                            padding: 0,
                            width: "20px",
                            height: "20px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {sortedData.length > 0 && (
                <>
                  <div style={{ marginBottom: "1rem", display: "flex", gap: "1rem", alignItems: "center" }}>
                    <label>
                      Sort by:
                      <select
                        value={sortColumn}
                        onChange={(e) => setSortColumn(e.target.value)}
                        style={{ marginLeft: "0.5rem", padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}
                      >
                        <option value="">None</option>
                        <option value="Ticker">Ticker</option>
                        <option value="Starting Price">Starting Price</option>
                        <option value="Current Price">Current Price</option>
                        <option value="Market Cap">Market Cap</option>
                        <option value="Daily Stock Change %">Daily Stock Change %</option>
                        <option value="Change Since Start %">Change Since Start %</option>
                        <option value="Volume">Volume</option>
                        <option value="Industry">Industry</option>
                      </select>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <input
                        type="checkbox"
                        checked={sortAscending}
                        onChange={(e) => setSortAscending(e.target.checked)}
                      />
                      Ascending
                    </label>
                  </div>

                  <div style={{ overflowX: "auto", marginBottom: "1rem" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        backgroundColor: "#ffffff",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <thead>
                        <tr style={{ backgroundColor: "#f8f8f8" }}>
                          {["Ticker", "Starting Price", "Current Price", "Market Cap", "Daily Stock Change %", "Change Since Start %", "Volume", "Industry"].map((col) => (
                            <th
                              key={col}
                              style={{
                                padding: "1rem",
                                textAlign: "left",
                                borderBottom: "2px solid #e2e8f0",
                                fontWeight: 600,
                                fontSize: "0.875rem",
                                cursor: "pointer",
                              }}
                              onClick={() => {
                                if (sortColumn === col) {
                                  setSortAscending(!sortAscending);
                                } else {
                                  setSortColumn(col);
                                  setSortAscending(true);
                                }
                              }}
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedData.map((row, idx) => (
                          <tr key={idx} style={{ borderBottom: "1px solid #e2e8f0" }}>
                            <td style={{ padding: "0.75rem" }}>{row.Ticker}</td>
                            <td style={{ padding: "0.75rem" }}>{formatValue(row["Starting Price"])}</td>
                            <td style={{ padding: "0.75rem" }}>{formatValue(row["Current Price"])}</td>
                            <td style={{ padding: "0.75rem" }}>{formatValue(row["Market Cap"])}</td>
                            <td style={{ padding: "0.75rem", color: (row["Daily Stock Change %"] || 0) >= 0 ? "#008000" : "#dc2626" }}>
                              {row["Daily Stock Change %"] !== null ? `${row["Daily Stock Change %"].toFixed(2)}%` : "N/A"}
                            </td>
                            <td style={{ padding: "0.75rem", color: (row["Change Since Start %"] || 0) >= 0 ? "#008000" : "#dc2626" }}>
                              {row["Change Since Start %"] !== null ? `${row["Change Since Start %"].toFixed(2)}%` : "N/A"}
                            </td>
                            <td style={{ padding: "0.75rem" }}>{formatValue(row.Volume)}</td>
                            <td style={{ padding: "0.75rem" }}>{row.Industry || "N/A"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    onClick={() => {
                      const csv = [
                        ["Ticker", "Starting Price", "Current Price", "Market Cap", "Daily Stock Change %", "Change Since Start %", "Volume", "Industry"].join(","),
                        ...sortedData.map((row) =>
                          [
                            row.Ticker,
                            row["Starting Price"] ?? "",
                            row["Current Price"] ?? "",
                            row["Market Cap"] ?? "",
                            row["Daily Stock Change %"] ?? "",
                            row["Change Since Start %"] ?? "",
                            row.Volume ?? "",
                            row.Industry ?? "",
                          ].join(",")
                        ),
                      ].join("\n");
                      const blob = new Blob([csv], { type: "text/csv" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${selectedWatchlist}_${new Date().toISOString().split("T")[0]}.csv`;
                      a.click();
                    }}
                    style={{
                      padding: "0.75rem 1.5rem",
                      backgroundColor: "#000000",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                    }}
                  >
                    Download CSV
                  </button>
                </>
              )}
            </>
          )}
        </>
      )}

      {Object.keys(watchlists).length === 0 && (
        <div style={{ padding: "2rem", textAlign: "center", color: "#666666" }}>
          No watchlists created yet. Create one above!
        </div>
      )}
    </div>
  );
};

export default CustomWatchlists;
