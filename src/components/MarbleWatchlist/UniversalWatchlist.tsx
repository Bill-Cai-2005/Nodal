import { useState, useEffect, useRef } from "react";
import {
  fetchNyseNasdaqTickers,
  fetchSnapshotBatch,
  fetchHistoricalOpenPrice,
  type StockData,
  fetchTickerReference,
} from "../../utils/polygonApi";
import {
  loadTickers,
  saveTickers,
  loadStartPriceCache,
  saveStartPriceCache,
  loadTickerRefCache,
  saveTickerRefCache,
  loadMarketCapCache,
  saveMarketCapCache,
  loadUniversalCache,
  saveUniversalCache,
  getLatestMarketCapSnapshot,
} from "../../utils/watchlistCache";
import {
  saveStartPricesToDb,
  loadStartPricesFromDb,
  loadStartPriceDatesFromDb,
  saveMarketCapsToDb,
  loadLatestMarketCapsFromDb,
} from "../../utils/watchlistCacheApi";
import { runWithConcurrency } from "../../utils/concurrency";

const UniversalWatchlist = () => {
  const [tickers, setTickers] = useState<{ nyse: string[]; nasdaq: string[] }>({ nyse: [], nasdaq: [] });
  const [data, setData] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: "" });
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customStart, setCustomStart] = useState<Date>(new Date());
  const [customEnd, setCustomEnd] = useState<Date>(new Date());
  const [historicalDate, setHistoricalDate] = useState<Date>(new Date());
  const [sortColumn, setSortColumn] = useState<string>("");
  const [sortAscending, setSortAscending] = useState(true);
  const [minMarketCap, setMinMarketCap] = useState(0);
  const [cachedStartDates, setCachedStartDates] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const loaded = loadTickers();
    setTickers({ nyse: loaded.nyse || [], nasdaq: loaded.nasdaq || [] });

    const cached = loadUniversalCache();
    if (cached?.records) {
      setData(cached.records);
    }

    // Load cached start dates (DB + local) so users can actually select them later
    (async () => {
      const localDates = Object.keys(loadStartPriceCache() || {});
      let dbDates: string[] = [];
      try {
        const resp = await loadStartPriceDatesFromDb();
        dbDates = (resp?.dates || []).map((d) => d.dateKey).filter(Boolean);
      } catch {
        // ignore; local is still available
      }
      const merged = Array.from(new Set([...localDates, ...dbDates])).sort();
      setCachedStartDates(merged);
    })();
  }, []);

  const handleFetchTickers = async () => {
    try {
      setLoading(true);
      setProgress({ current: 0, total: 0, message: "Fetching tickers..." });
      const result = await fetchNyseNasdaqTickers((current, total) => {
        setProgress({ current, total, message: `Fetched ${current} tickers...` });
      });
      setTickers(result);
      saveTickers({ ...result, fetched_at: new Date().toISOString() });
      setProgress({ current: 0, total: 0, message: `✅ Loaded ${result.nyse.length + result.nasdaq.length} tickers` });
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleHistoricalFetch = async () => {
    const allTickers = [...tickers.nyse, ...tickers.nasdaq];
    if (allTickers.length === 0) {
      alert("Please fetch tickers first");
      return;
    }

    try {
      setLoading(true);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const cache = loadStartPriceCache();
      const dateKey = historicalDate.toISOString().split("T")[0];
      const prices: Record<string, number> = {};
      const concurrency = 24;
      let completed = 0;
      setProgress({ current: 0, total: allTickers.length, message: "Fetching historical open prices..." });

      await runWithConcurrency(allTickers, concurrency, async (ticker) => {
        if (controller.signal.aborted) return null;
        const price = await fetchHistoricalOpenPrice(ticker, historicalDate, controller.signal);
        if (price !== null) {
          prices[ticker] = price;
        }
        completed += 1;
        if (completed % 10 === 0 || completed === allTickers.length) {
          setProgress({
            current: completed,
            total: allTickers.length,
            message: `Historical fetch in progress...`,
          });
        }
        return price;
      });

      if (controller.signal.aborted) {
        setProgress({ current: completed, total: allTickers.length, message: "Cancelled historical fetch." });
        return;
      }

      cache[dateKey] = {
        cached_at: new Date().toISOString(),
        prices,
      };
      saveStartPriceCache(cache);
      // Persist to DB (best-effort; local cache is the fallback)
      try {
        await saveStartPricesToDb(dateKey, prices);
      } catch (e) {
        console.warn("Failed to save start prices to DB (kept local cache):", e);
      }
      // Update local state so it shows up immediately in the dropdown
      setCachedStartDates((prev) => Array.from(new Set([...prev, dateKey])).sort());
      setProgress({ current: 0, total: 0, message: `✅ Cached ${Object.keys(prices).length} prices` });
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setProgress({ current: 0, total: 0, message: "Cancelled historical fetch." });
        return;
      }
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSnapshotRefresh = async () => {
    const allTickers = [...tickers.nyse, ...tickers.nasdaq];
    if (allTickers.length === 0) {
      alert("Please fetch tickers first");
      return;
    }

    try {
      setLoading(true);
      setProgress({ current: 0, total: allTickers.length, message: "Fetching snapshots..." });

      const refCache = loadTickerRefCache();
      const dateKey = useCustomRange ? customStart.toISOString().split("T")[0] : null;
      // Prefer DB cache for selected start date, fallback to localStorage cache
      let startPriceCache: any = useCustomRange ? loadStartPriceCache() : null;
      if (useCustomRange && dateKey) {
        try {
          const dbEntry = await loadStartPricesFromDb(dateKey);
          startPriceCache = {
            ...(startPriceCache || {}),
            [dateKey]: { cached_at: dbEntry.cached_at, prices: dbEntry.prices },
          };
        } catch (e) {
          // ok to fallback to local cache
        }
      }

      const snapshots = await fetchSnapshotBatch(allTickers);
      const results: StockData[] = [];

      for (let i = 0; i < allTickers.length; i++) {
        const ticker = allTickers[i];
        setProgress({
          current: i + 1,
          total: allTickers.length,
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

      setData(results);
      saveUniversalCache({
        last_refreshed: new Date().toISOString(),
        records: results,
      });
      setProgress({ current: 0, total: 0, message: "✅ Refresh complete!" });
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCalculateMarketCap = async () => {
    if (data.length === 0) {
      alert("No data available");
      return;
    }

    try {
      setLoading(true);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const refCache = loadTickerRefCache();
      const tickersToFetch = data.map((d) => d.Ticker).filter((t) => !refCache[t]?.market_cap);

      const concurrency = 24;
      let completed = 0;
      setProgress({ current: 0, total: tickersToFetch.length, message: "Fetching market caps..." });

      await runWithConcurrency(tickersToFetch, concurrency, async (ticker) => {
        if (controller.signal.aborted) return null;
        const ref = await fetchTickerReference(ticker, controller.signal);
        if (ref) {
          refCache[ticker] = ref;
        }
        completed += 1;
        if (completed % 10 === 0 || completed === tickersToFetch.length) {
          setProgress({ current: completed, total: tickersToFetch.length, message: "Fetching market caps..." });
        }
        return ref;
      });

      if (controller.signal.aborted) {
        setProgress({ current: completed, total: tickersToFetch.length, message: "Cancelled market cap fetch." });
        return;
      }

      saveTickerRefCache(refCache);

      const updatedData = data.map((row) => ({
        ...row,
        "Market Cap": refCache[row.Ticker]?.market_cap || row["Market Cap"],
        Industry: refCache[row.Ticker]?.industry || row.Industry,
      }));

      setData(updatedData);
      saveUniversalCache({
        last_refreshed: new Date().toISOString(),
        records: updatedData,
      });

      const capCache = loadMarketCapCache();
      capCache[new Date().toISOString()] = {
        market_caps: Object.fromEntries(
          Object.entries(refCache).map(([t, r]) => [t, r.market_cap || 0])
        ),
      };
      saveMarketCapCache(capCache);
      // Persist to DB (best-effort; local cache is the fallback)
      try {
        await saveMarketCapsToDb(
          Object.fromEntries(Object.entries(refCache).map(([t, r]) => [t, r.market_cap || 0]))
        );
      } catch (e) {
        console.warn("Failed to save market caps to DB (kept local cache):", e);
      }

      setProgress({ current: 0, total: 0, message: "✅ Market cap calculation complete!" });
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setProgress({ current: 0, total: 0, message: "Cancelled market cap fetch." });
        return;
      }
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMarketCap = () => {
    (async () => {
      // Prefer DB latest snapshot, fallback to localStorage
      let caps: Record<string, number> | null = null;
      let tsLabel: string | null = null;
      try {
        const dbSnap = await loadLatestMarketCapsFromDb();
        caps = dbSnap.market_caps || {};
        tsLabel = dbSnap.timestamp;
      } catch {
        const snapshot = getLatestMarketCapSnapshot();
        if (snapshot) {
          caps = snapshot.caps;
          tsLabel = snapshot.timestamp;
        }
      }

      if (!caps) {
        alert("No previous market cap cache found");
        return;
      }

      const updatedData = data.map((row) => ({
        ...row,
        "Market Cap": caps?.[row.Ticker] || row["Market Cap"],
      }));

      setData(updatedData);
      saveUniversalCache({
        last_refreshed: new Date().toISOString(),
        records: updatedData,
      });
      alert(`Applied market cap cache from ${tsLabel || "latest"}`);
    })();
  };

  const formatValue = (value: number | null): string => {
    if (value === null) return "N/A";
    if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    if (typeof value === "number") return value.toFixed(2);
    return String(value);
  };

  const sortedData = [...data].sort((a, b) => {
    if (!sortColumn) return 0;
    const aVal = (a as any)[sortColumn];
    const bVal = (b as any)[sortColumn];
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortAscending ? comparison : -comparison;
  });

  const filteredData = sortedData.filter((row) => {
    if (minMarketCap > 0) {
      const cap = row["Market Cap"];
      if (cap === null || cap < minMarketCap * 1_000_000) return false;
    }
    return true;
  });

  const displayData = filteredData.filter((row) => {
    const cols = ["Ticker", "Starting Price", "Current Price", "Market Cap", "Daily Stock Change %", "Change Since Start %", "Volume"];
    return cols.every((col) => col in row);
  });

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <button
          onClick={handleFetchTickers}
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
          Fetch NYSE/NASDAQ Tickers
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
            {cachedStartDates.length > 0 && (
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                Start date cache:
                <select
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    setCustomStart(new Date(v));
                  }}
                  style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}
                >
                  <option value="">Select cached date…</option>
                  {cachedStartDates
                    .slice()
                    .reverse()
                    .map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                </select>
              </label>
            )}
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
            <span style={{ color: "#666666", fontSize: "0.875rem" }}>
              (To use saved historical prices, pick the same start date here, then run Snapshot Refresh)
            </span>
          </>
        )}

        <input
          type="date"
          value={historicalDate.toISOString().split("T")[0]}
          onChange={(e) => setHistoricalDate(new Date(e.target.value))}
          style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}
        />
        <button
          onClick={handleHistoricalFetch}
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
          Historical Price Fetch
        </button>

        <button
          onClick={handleSnapshotRefresh}
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
          Snapshot Refresh
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
          Calculate Market Cap
        </button>

        <button
          onClick={handleLoadMarketCap}
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
          Load Market Cap From Previous Date
        </button>

        <button
          onClick={() => {
            if (!abortRef.current) return;
            abortRef.current.abort();
          }}
          disabled={!loading}
          style={{
            padding: "0.75rem 1.5rem",
            backgroundColor: "#dc2626",
            color: "#ffffff",
            border: "none",
            borderRadius: "6px",
            cursor: loading ? "pointer" : "not-allowed",
            fontSize: "0.875rem",
            fontWeight: 600,
            opacity: loading ? 1 : 0.5,
          }}
        >
          Cancel
        </button>
      </div>

      {progress.message && (
        <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "#f0f0f0", borderRadius: "4px" }}>
          {progress.message}
          {progress.total > 0 && ` (${progress.current}/${progress.total})`}
        </div>
      )}

      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          Min Market Cap (Millions USD):
          <input
            type="number"
            value={minMarketCap}
            onChange={(e) => setMinMarketCap(parseInt(e.target.value) || 0)}
            style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc", width: "100px" }}
          />
        </label>
      </div>

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

      {displayData.length > 0 ? (
        <>
          <div
            style={{
              overflowX: "auto",
              overflowY: "auto",
              maxHeight: "70vh",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              backgroundColor: "#ffffff",
              marginBottom: "1rem",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                backgroundColor: "#ffffff",
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "#f8f8f8" }}>
                  {["Ticker", "Starting Price", "Current Price", "Market Cap", "Daily Stock Change %", "Change Since Start %", "Volume"].map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: "1rem",
                        textAlign: "left",
                        borderBottom: "2px solid #e2e8f0",
                        fontWeight: 600,
                        fontSize: "0.875rem",
                        cursor: "pointer",
                        position: "sticky",
                        top: 0,
                        backgroundColor: "#f8f8f8",
                        zIndex: 1,
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
                {displayData.map((row, idx) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => {
              const csv = [
                ["Ticker", "Starting Price", "Current Price", "Market Cap", "Daily Stock Change %", "Change Since Start %", "Volume"].join(","),
                ...displayData.map((row) =>
                  [
                    row.Ticker,
                    row["Starting Price"] ?? "",
                    row["Current Price"] ?? "",
                    row["Market Cap"] ?? "",
                    row["Daily Stock Change %"] ?? "",
                    row["Change Since Start %"] ?? "",
                    row.Volume ?? "",
                  ].join(",")
                ),
              ].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `universal_watchlist_${new Date().toISOString().split("T")[0]}.csv`;
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
      ) : (
        <div style={{ padding: "2rem", textAlign: "center", color: "#666666" }}>
          {loading ? "Loading..." : "No data available. Fetch tickers and refresh to load data."}
        </div>
      )}
    </div>
  );
};

export default UniversalWatchlist;
