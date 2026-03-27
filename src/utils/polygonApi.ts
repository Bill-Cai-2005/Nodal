/**
 * Polygon.io API utilities
 * All calls are routed through the backend proxy at /api/polygon,
 * which holds the POLYGON_API_KEY on the server (Render).
 */

import { getApiEndpoint } from "./api";

const SNAPSHOT_BATCH_SIZE = 250;
const LOG_REFRESH_SPEED = true;

export interface StockData {
  Ticker: string;
  Description?: string;
  "Starting Price": number | null;
  "Current Price": number | null;
  "Market Cap": number | null;
  "Daily Stock Change %": number | null;
  "Custom Dates Change %": number | null;
  Volume: number | null;
  Industry: string | null;
  Error: string | null;
}

export interface TickerReference {
  market_cap: number | null;
  industry: string | null;
}

const polygonGet = async (
  path: string,
  params?: Record<string, string | number | boolean>,
  timeout = 20,
  retries = 4,
  signal?: AbortSignal
): Promise<any> => {
  const q: Record<string, string> = { ...(params || {}) } as Record<string, string>;
  const queryString = new URLSearchParams(
    Object.entries(q).reduce((acc, [k, v]) => {
      acc[k] = String(v);
      return acc;
    }, {} as Record<string, string>)
  ).toString();

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);
      const onAbort = () => controller.abort();
      if (signal) signal.addEventListener("abort", onAbort, { once: true });

      const response = await fetch(
        `${getApiEndpoint(`/api/polygon${path}`)}${queryString ? `?${queryString}` : ""}`,
        {
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener("abort", onAbort);

      if (response.status === 429 || response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempt)));
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (err: any) {
      lastErr = err;
      if (signal?.aborted) break;
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr || new Error("Request failed");
};

const toIso = (d: Date | string): string => {
  if (typeof d === "string") return d;
  return d.toISOString().split("T")[0];
};

const safeFloat = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  const num = parseFloat(v);
  return isNaN(num) ? null : num;
};

const nowMs = (): number => {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
};

const isIndividualCompanyResult = (row: any): boolean => {
  const instrumentType = String(row?.type || "").toUpperCase().trim();
  if (instrumentType !== "CS") return false;

  const name = String(row?.name || "").toUpperCase();
  const blockedTokens = [
    " ETF",
    " FUND",
    " TRUST",
    " ETN",
    " INDEX",
    " SPDR",
    " ISHARES",
    " PROSHARES",
    " ULTRASHORT",
    " INVERSE",
  ];
  return !blockedTokens.some((token) => name.includes(token));
};

export const fetchTickerReference = async (ticker: string, signal?: AbortSignal): Promise<TickerReference | null> => {
  try {
    const data = await polygonGet(`/v3/reference/tickers/${ticker}`, undefined, 20, 4, signal);
    const row = data?.results || {};
    if (!row || !isIndividualCompanyResult(row)) return null;

    return {
      market_cap: safeFloat(row.market_cap),
      industry: row.sic_description || row.industry || null,
    };
  } catch {
    return null;
  }
};

export const validateTicker = async (ticker: string): Promise<{ valid: boolean; reason?: string }> => {
  try {
    const ref = await fetchTickerReference(ticker);
    if (!ref) {
      return { valid: false, reason: "Ticker is not an individual operating company (common stock only)." };
    }
    return { valid: true };
  } catch (err: any) {
    return { valid: false, reason: `Validation failed: ${err.message}` };
  }
};

export const fetchStockData = async (
  ticker: string,
  customStartDate?: Date,
  customEndDate?: Date,
  startPriceCache?: Record<string, { prices: Record<string, number> }>,
  options?: { includeReference?: boolean; signal?: AbortSignal }
): Promise<StockData> => {
  const t0 = nowMs();
  let refMs = 0;
  let aggsMs = 0;
  try {
    const includeReference = options?.includeReference ?? true;
    const signal = options?.signal;
    let marketCap: number | null = null;
    let industry: string | null = null;

    // Get reference data
    if (includeReference) {
      const refStart = nowMs();
      const ref = await fetchTickerReference(ticker, signal);
      refMs = nowMs() - refStart;
      if (ref) {
        marketCap = ref.market_cap;
        industry = ref.industry;
      }
    }

    let dailyChangePct: number | null = null;
    let customDatesChangePct: number | null = null;
    let startingPrice: number | null = null;
    let currentPrice: number | null = null;
    let volume: number | null = null;
    const useCustomRange = customStartDate && customEndDate;

    // Daily path is independent from custom range and should always represent
    // recent day-over-day movement.
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7);
    const dailyAggsStart = nowMs();
    const dailyAggs = await polygonGet(
      `/v2/aggs/ticker/${ticker}/range/1/day/${toIso(fromDate)}/${toIso(new Date())}`,
      { adjusted: "true", sort: "asc", limit: 5000 },
      20,
      4,
      signal
    );
    aggsMs += nowMs() - dailyAggsStart;
    const dailyRows = dailyAggs?.results || [];
    const dailyLastClose = dailyRows.length >= 1 ? safeFloat(dailyRows[dailyRows.length - 1].c) : null;
    const dailyPrevClose = dailyRows.length >= 2
      ? safeFloat(dailyRows[dailyRows.length - 2].c)
      : dailyRows.length >= 1
        ? safeFloat(dailyRows[dailyRows.length - 1].o)
        : null;
    const dailyVolume = dailyRows.length >= 1 ? safeFloat(dailyRows[dailyRows.length - 1].v) : null;
    if (dailyPrevClose && dailyPrevClose !== 0 && dailyLastClose !== null) {
      dailyChangePct = ((dailyLastClose - dailyPrevClose) / dailyPrevClose) * 100;
    }

    // Custom range path
    if (useCustomRange && customStartDate && customEndDate) {
      const dateKey = toIso(customStartDate);
      let cachedPrice: number | null = null;

      if (startPriceCache?.[dateKey]?.prices) {
        cachedPrice = safeFloat(startPriceCache[dateKey].prices[ticker]);
      }

      if (cachedPrice !== null) {
        startingPrice = cachedPrice;
      } else {
        // Fetch first open on or after start date
        const toDate = new Date(customStartDate);
        toDate.setDate(toDate.getDate() + 14);
        const aggsStart = nowMs();
        const aggs = await polygonGet(
          `/v2/aggs/ticker/${ticker}/range/1/day/${toIso(customStartDate)}/${toIso(toDate)}`,
          { adjusted: "true", sort: "asc", limit: 50 },
          20,
          4,
          signal
        );
        aggsMs += nowMs() - aggsStart;
        const rows = aggs?.results || [];
        if (rows.length > 0) {
          startingPrice = safeFloat(rows[0].o);
        }
      }

      // Fetch last close on or before end date
      const fromDate = new Date(customEndDate);
      fromDate.setDate(fromDate.getDate() - 14);
      const aggsStart = nowMs();
      const aggs = await polygonGet(
        `/v2/aggs/ticker/${ticker}/range/1/day/${toIso(fromDate)}/${toIso(customEndDate)}`,
        { adjusted: "true", sort: "asc", limit: 50 },
        20,
        4,
        signal
      );
      aggsMs += nowMs() - aggsStart;
      const rows = aggs?.results || [];
      if (rows.length > 0) {
        const last = rows[rows.length - 1];
        currentPrice = safeFloat(last.c);
        volume = safeFloat(last.v);
      }

      if (startingPrice && startingPrice !== 0 && currentPrice !== null) {
        customDatesChangePct = ((currentPrice - startingPrice) / startingPrice) * 100;
      }
    } else {
      startingPrice = dailyPrevClose;
      currentPrice = dailyLastClose;
      volume = dailyVolume;
    }

    if (LOG_REFRESH_SPEED) {
      const totalMs = nowMs() - t0;
      console.log({
        ticker,
        refMs,
        aggsMs,
        totalMs,
      });
    }

    return {
      Ticker: ticker,
      "Starting Price": startingPrice,
      "Current Price": currentPrice,
      "Market Cap": marketCap,
      "Daily Stock Change %": dailyChangePct,
      "Custom Dates Change %": useCustomRange ? customDatesChangePct : null,
      Volume: volume,
      Industry: industry,
      Error: null,
    };
  } catch (err: any) {
    if (LOG_REFRESH_SPEED) {
      const totalMs = nowMs() - t0;
      console.log({
        ticker,
        refMs,
        aggsMs,
        totalMs,
      });
    }
    return {
      Ticker: ticker,
      "Starting Price": null,
      "Current Price": null,
      "Market Cap": null,
      "Daily Stock Change %": null,
      "Custom Dates Change %": null,
      Volume: null,
      Industry: null,
      Error: err.message || "Unknown error",
    };
  }
};

export const fetchNyseNasdaqTickers = async (
  onProgress?: (progress: number, total: number) => void
): Promise<{ nyse: string[]; nasdaq: string[] }> => {
  const nasdaqTickers: string[] = [];
  const nyseTickers: string[] = [];
  const nasdaqCodes = new Set(["NASDAQ", "XNAS", "XNCM", "XNGS", "XNMS", "BATS"]);
  const nyseCodes = new Set(["NYSE", "XNYS", "ARCX", "XASE", "AMEX"]);

  try {
    // Polygon paginates using `next_url` which includes a cursor; using URL string concatenation
    // can break pagination (double `?`) and truncate results. We always call `polygonGet` and
    // follow the cursor explicitly.
    let cursor: string | null = null;
    let totalProcessed = 0;

    while (true) {
      const data = await polygonGet("/v3/reference/tickers", {
        market: "stocks",
        active: "true",
        limit: 1000,
        ...(cursor ? { cursor } : {}),
      });

      for (const row of data?.results || []) {
        const symbol = String(row.ticker || "").trim().toUpperCase();
        const exch = String(row.primary_exchange || "").toUpperCase().trim();

        if (!symbol || symbol.length > 6) continue;
        if (!isIndividualCompanyResult(row)) continue;

        if (nasdaqCodes.has(exch) || exch.includes("NASDAQ")) {
          nasdaqTickers.push(symbol);
        } else if (nyseCodes.has(exch) || exch.includes("NYSE")) {
          nyseTickers.push(symbol);
        }
      }

      totalProcessed += data?.results?.length || 0;
      onProgress?.(totalProcessed, totalProcessed);

      const nextUrl = data?.next_url;
      if (!nextUrl) break;

      try {
        const parsed = new URL(nextUrl);
        cursor = parsed.searchParams.get("cursor");
      } catch {
        // If parsing fails, stop to avoid infinite loops / bad URLs
        break;
      }

      if (!cursor) break;
    }
  } catch (err: any) {
    throw new Error(`Polygon ticker fetch failed: ${err.message}`);
  }

  return {
    nyse: Array.from(new Set(nyseTickers)).sort(),
    nasdaq: Array.from(new Set(nasdaqTickers)).sort(),
  };
};

export const fetchSnapshotBatch = async (tickers: string[]): Promise<Record<string, any>> => {
  const chunks: string[][] = [];
  for (let i = 0; i < tickers.length; i += SNAPSHOT_BATCH_SIZE) {
    chunks.push(tickers.slice(i, i + SNAPSHOT_BATCH_SIZE));
  }

  const results: Record<string, any> = {};
  for (const chunk of chunks) {
    try {
      const data = await polygonGet("/v2/snapshot/locale/us/markets/stocks/tickers", {
        tickers: chunk.join(","),
      });
      for (const t of data?.tickers || []) {
        results[String(t.ticker).toUpperCase()] = t;
      }
    } catch (err) {
      console.error("Snapshot batch failed:", err);
    }
  }
  return results;
};

export const fetchHistoricalOpenPrice = async (
  ticker: string,
  startDate: Date,
  signal?: AbortSignal
): Promise<number | null> => {
  const toDate = new Date(startDate);
  toDate.setDate(toDate.getDate() + 14);
  try {
    const aggs = await polygonGet(
      `/v2/aggs/ticker/${ticker}/range/1/day/${toIso(startDate)}/${toIso(toDate)}`,
      { adjusted: "true", sort: "asc", limit: 50 },
      20,
      4,
      signal
    );
    const rows = aggs?.results || [];
    return rows.length > 0 ? safeFloat(rows[0].o) : null;
  } catch {
    return null;
  }
};
