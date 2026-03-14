import { useEffect, useRef, useState } from "react";
import {
  fetchNyseNasdaqTickers,
  fetchStockData,
  fetchSnapshotBatch,
  fetchTickerReference,
  type StockData,
} from "../../utils/polygonApi";
import { loadMarketCapsFromIndexedDb, replaceMarketCapsInIndexedDb } from "../../utils/marketCapIndexedDb";
import { runWithConcurrency } from "../../utils/concurrency";
import { fetchCompanySummary } from "../../utils/companySummaryApi";
import UniversalWatchlistControls from "./UniversalWatchlistControls";
import UniversalWatchlistTable from "./UniversalWatchlistTable";

const UniversalWatchlist = () => {
  const [tickers, setTickers] = useState<{ nyse: string[]; nasdaq: string[] }>({ nyse: [], nasdaq: [] });
  const [data, setData] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: "" });
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customStart, setCustomStart] = useState<Date>(new Date());
  const [customEnd, setCustomEnd] = useState<Date>(new Date());
  const [sortColumn, setSortColumn] = useState<string>("");
  const [sortAscending, setSortAscending] = useState(true);
  const [minMarketCap, setMinMarketCap] = useState(0);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [summaryText, setSummaryText] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryCache, setSummaryCache] = useState<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!useCustomRange && sortColumn === "Custom Dates Change %") {
      setSortColumn("");
    }
  }, [useCustomRange, sortColumn]);

  const handleLoadTickers = async () => {
    try {
      setLoading(true);
      setProgress({ current: 0, total: 0, message: "Fetching tickers..." });
      const result = await fetchNyseNasdaqTickers((current, total) => {
        setProgress({ current, total, message: `Fetched ${current} tickers...` });
      });
      setTickers(result);

      const allTickers = [...result.nyse, ...result.nasdaq];
      if (allTickers.length > 0) {
        setProgress({ current: 0, total: allTickers.length, message: "Fetching snapshot batches..." });
        const snapshots = await fetchSnapshotBatch(allTickers);
        const rows: StockData[] = allTickers.map((ticker, idx) => {
          if ((idx + 1) % 250 === 0 || idx + 1 === allTickers.length) {
            setProgress({
              current: idx + 1,
              total: allTickers.length,
              message: "Building table from snapshots...",
            });
          }

          const snap = snapshots[ticker];
          const day = snap?.day || {};
          const prevDay = snap?.prevDay || {};
          const lastTrade = snap?.lastTrade || {};
          const prevClose = prevDay.c ? parseFloat(prevDay.c) : null;
          const currentPrice = lastTrade.p ? parseFloat(lastTrade.p) : day.c ? parseFloat(day.c) : null;
          const volume = day.v ? parseFloat(day.v) : null;

          let dailyChange: number | null = null;
          if (prevClose !== null && prevClose !== 0 && currentPrice !== null) {
            dailyChange = ((currentPrice - prevClose) / prevClose) * 100;
          }

          return {
            Ticker: ticker,
            "Starting Price": prevClose,
            "Current Price": currentPrice,
            "Market Cap": null,
            "Daily Stock Change %": dailyChange,
            "Custom Dates Change %": null,
            Volume: volume,
            Industry: null,
            Error: snap ? null : "Missing snapshot",
          };
        });
        setData(rows);
      }

      setProgress({ current: 0, total: 0, message: `Loaded ${allTickers.length} tickers and table snapshot` });
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
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
      setProgress({ current: 0, total: allTickers.length, message: "Fetching stock data..." });

      const byTicker: Record<string, StockData> = {};
      const existingByTicker = Object.fromEntries(data.map((row) => [row.Ticker, row]));
      let completed = 0;

      await runWithConcurrency(allTickers, 24, async (ticker) => {
        if (controller.signal.aborted) return null;
        const existing = existingByTicker[ticker] as StockData | undefined;
        const needsMarket = !existing || existing["Market Cap"] === null || !existing.Industry;
        const needsPrice = !existing ||
          existing["Starting Price"] === null ||
          existing["Current Price"] === null ||
          existing["Daily Stock Change %"] === null ||
          existing.Volume === null ||
          (useCustomRange && existing["Custom Dates Change %"] === null);

        if (!needsMarket && !needsPrice && existing) {
          byTicker[ticker] = existing;
        } else if (needsPrice) {
          const fetched = await fetchStockData(
            ticker,
            useCustomRange ? customStart : undefined,
            useCustomRange ? customEnd : undefined,
            undefined,
            { includeReference: needsMarket, signal: controller.signal }
          );
          byTicker[ticker] = {
            ...fetched,
            "Market Cap": needsMarket ? fetched["Market Cap"] : (existing?.["Market Cap"] ?? fetched["Market Cap"]),
            Industry: needsMarket ? fetched.Industry : (existing?.Industry ?? fetched.Industry),
          };
        } else if (existing) {
          const ref = await fetchTickerReference(ticker, controller.signal);
          byTicker[ticker] = {
            ...existing,
            "Market Cap": ref?.market_cap ?? existing["Market Cap"],
            Industry: ref?.industry ?? existing.Industry,
          };
        }

        completed += 1;
        if (completed % 10 === 0 || completed === allTickers.length) {
          setProgress({ current: completed, total: allTickers.length, message: "Refreshing missing data only..." });
        }
        return byTicker[ticker];
      });

      if (controller.signal.aborted) {
        setProgress({ current: completed, total: allTickers.length, message: "Cancelled refresh." });
        return;
      }

      const refreshedRows = allTickers.map(
        (ticker) =>
          byTicker[ticker] || {
            Ticker: ticker,
            "Starting Price": null,
            "Current Price": null,
            "Market Cap": null,
            "Daily Stock Change %": null,
            "Custom Dates Change %": null,
            Volume: null,
            Industry: null,
            Error: "Missing data",
          }
      );
      setData(refreshedRows);
      try {
        await replaceMarketCapsInIndexedDb(refreshedRows);
      } catch (e) {
        console.warn("Failed to persist market caps to IndexedDB:", e);
      }
      setProgress({ current: 0, total: 0, message: "Refresh complete!" });
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setProgress({ current: 0, total: 0, message: "Cancelled refresh." });
        return;
      }
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadLocallyStoredData = async () => {
    try {
      const marketCaps = await loadMarketCapsFromIndexedDb();
      if (Object.keys(marketCaps).length === 0) {
        alert("No locally stored market cap data found.");
        return;
      }

      setData((prev) =>
        prev.map((row) => ({
          ...row,
          "Market Cap": marketCaps[row.Ticker] ?? row["Market Cap"],
        }))
      );
      setProgress({ current: 0, total: 0, message: "Loaded locally stored market cap data." });
    } catch (e: any) {
      alert(`Failed to load locally stored data: ${e?.message || "Unknown error"}`);
    }
  };

  const handleRowClick = async (ticker: string) => {
    setSelectedTicker(ticker);
    setSummaryError(null);

    if (summaryCache[ticker]) {
      setSummaryText(summaryCache[ticker]);
      return;
    }

    try {
      setSummaryLoading(true);
      setSummaryText("");
      const summary = await fetchCompanySummary(ticker);
      setSummaryText(summary);
      setSummaryCache((prev) => ({ ...prev, [ticker]: summary }));
    } catch (err: any) {
      setSummaryError(err?.message || "Failed to generate summary");
    } finally {
      setSummaryLoading(false);
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
    const cols = [
      "Ticker",
      "Starting Price",
      "Current Price",
      "Market Cap",
      "Daily Stock Change %",
      "Custom Dates Change %",
      "Volume",
    ];
    return cols.every((col) => col in row);
  });

  return (
    <div style={{ width: "100%" }}>
      <UniversalWatchlistControls
        loading={loading}
        progress={progress}
        useCustomRange={useCustomRange}
        setUseCustomRange={setUseCustomRange}
        customStart={customStart}
        setCustomStart={setCustomStart}
        customEnd={customEnd}
        setCustomEnd={setCustomEnd}
        minMarketCap={minMarketCap}
        setMinMarketCap={setMinMarketCap}
        onLoadTickers={handleLoadTickers}
        onLoadLocallyStoredData={handleLoadLocallyStoredData}
        onRefresh={handleRefresh}
      />

      <UniversalWatchlistTable
        loading={loading}
        displayData={displayData}
        useCustomRange={useCustomRange}
        sortColumn={sortColumn}
        setSortColumn={setSortColumn}
        sortAscending={sortAscending}
        setSortAscending={setSortAscending}
        formatValue={formatValue}
        onRowClick={handleRowClick}
        selectedTicker={selectedTicker}
      />

      {selectedTicker && (
        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            padding: "1rem",
            backgroundColor: "#ffffff",
            marginTop: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>
            AI Company Summary: {selectedTicker}
          </h3>
          {summaryLoading && <p style={{ margin: 0 }}>Generating summary...</p>}
          {summaryError && <p style={{ margin: 0, color: "#dc2626" }}>{summaryError}</p>}
          {!summaryLoading && !summaryError && summaryText && (
            <p style={{ margin: 0, lineHeight: 1.6 }}>{summaryText}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default UniversalWatchlist;
