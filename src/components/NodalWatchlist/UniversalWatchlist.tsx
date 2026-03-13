import { useEffect, useRef, useState } from "react";
import {
  fetchNyseNasdaqTickers,
  fetchStockData,
  fetchSnapshotBatch,
  type StockData,
} from "../../utils/polygonApi";
import { runWithConcurrency } from "../../utils/concurrency";
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
            "Market Cap": null, // intentionally left empty for snapshot-only table seed
            "Daily Stock Change %": dailyChange,
            "Custom Dates Change %": null, // populated only by custom-range refresh
            Volume: volume,
            Industry: null,
            Error: snap ? null : "Missing snapshot",
          };
        });
        setData(rows);
      }

      setProgress({ current: 0, total: 0, message: `✅ Loaded ${allTickers.length} tickers and table snapshot` });
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
      let completed = 0;

      await runWithConcurrency(allTickers, 50, async (ticker) => {
        if (controller.signal.aborted) return null;
        const row = await fetchStockData(
          ticker,
          useCustomRange ? customStart : undefined,
          useCustomRange ? customEnd : undefined
        );
        byTicker[ticker] = row;
        completed += 1;
        if (completed % 10 === 0 || completed === allTickers.length) {
          setProgress({ current: completed, total: allTickers.length, message: "Fetching stock data..." });
        }
        return row;
      });

      if (controller.signal.aborted) {
        setProgress({ current: completed, total: allTickers.length, message: "Cancelled refresh." });
        return;
      }

      setData(
        allTickers.map(
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
        )
      );
      setProgress({ current: 0, total: 0, message: "✅ Refresh complete!" });
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
      />
    </div>
  );
};

export default UniversalWatchlist;
