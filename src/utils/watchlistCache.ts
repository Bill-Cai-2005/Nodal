/**
 * LocalStorage cache utilities for watchlist data
 */

export interface WatchlistCache {
  [watchlistName: string]: string[];
}

export interface StartPriceCache {
  [dateKey: string]: {
    cached_at: string;
    prices: Record<string, number>;
  };
}

export interface TickerRefCache {
  [ticker: string]: {
    market_cap: number | null;
    industry: string | null;
  };
}

export interface MarketCapCache {
  [timestamp: string]: {
    market_caps: Record<string, number>;
  };
}

const WATCHLISTS_KEY = "marble_watchlists";
const TICKERS_KEY = "marble_tickers";
const START_PRICE_KEY = "marble_start_prices";
const TICKER_REF_KEY = "marble_ticker_ref";
const MARKET_CAP_KEY = "marble_market_cap";
const UNIVERSAL_CACHE_KEY = "marble_universal_cache";

export const loadWatchlists = (): WatchlistCache => {
  try {
    const data = localStorage.getItem(WATCHLISTS_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
};

export const saveWatchlists = (watchlists: WatchlistCache): void => {
  try {
    localStorage.setItem(WATCHLISTS_KEY, JSON.stringify(watchlists));
  } catch (err) {
    console.error("Failed to save watchlists:", err);
  }
};

export const loadTickers = (): { nyse: string[]; nasdaq: string[]; fetched_at?: string } => {
  try {
    const data = localStorage.getItem(TICKERS_KEY);
    return data ? JSON.parse(data) : { nyse: [], nasdaq: [] };
  } catch {
    return { nyse: [], nasdaq: [] };
  }
};

export const saveTickers = (tickers: { nyse: string[]; nasdaq: string[]; fetched_at?: string }): void => {
  try {
    localStorage.setItem(TICKERS_KEY, JSON.stringify(tickers));
  } catch (err) {
    console.error("Failed to save tickers:", err);
  }
};

export const loadStartPriceCache = (): StartPriceCache => {
  try {
    const data = localStorage.getItem(START_PRICE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
};

export const saveStartPriceCache = (cache: StartPriceCache): void => {
  try {
    localStorage.setItem(START_PRICE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.error("Failed to save start price cache:", err);
  }
};

export const loadTickerRefCache = (): TickerRefCache => {
  try {
    const data = localStorage.getItem(TICKER_REF_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
};

export const saveTickerRefCache = (cache: TickerRefCache): void => {
  try {
    localStorage.setItem(TICKER_REF_KEY, JSON.stringify(cache));
  } catch (err) {
    console.error("Failed to save ticker ref cache:", err);
  }
};

export const loadMarketCapCache = (): MarketCapCache => {
  try {
    const data = localStorage.getItem(MARKET_CAP_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
};

export const saveMarketCapCache = (cache: MarketCapCache): void => {
  try {
    localStorage.setItem(MARKET_CAP_KEY, JSON.stringify(cache));
  } catch (err) {
    console.error("Failed to save market cap cache:", err);
  }
};

export const loadUniversalCache = (): { last_refreshed: string; records: any[] } | null => {
  try {
    const data = localStorage.getItem(UNIVERSAL_CACHE_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

export const saveUniversalCache = (data: { last_refreshed: string; records: any[] }): void => {
  try {
    localStorage.setItem(UNIVERSAL_CACHE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("Failed to save universal cache:", err);
  }
};

export const getCachedStartDates = (): string[] => {
  const cache = loadStartPriceCache();
  return Object.keys(cache).sort();
};

export const getLatestMarketCapSnapshot = (): { timestamp: string; caps: Record<string, number> } | null => {
  const cache = loadMarketCapCache();
  const timestamps = Object.keys(cache).sort();
  if (timestamps.length === 0) return null;
  const latest = timestamps[timestamps.length - 1];
  return {
    timestamp: latest,
    caps: cache[latest]?.market_caps || {},
  };
};
