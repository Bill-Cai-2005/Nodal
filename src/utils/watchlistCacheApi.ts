import { getApiEndpoint } from "./api";

export type StartPriceCacheEntry = {
  dateKey: string;
  cached_at: string;
  prices: Record<string, number>;
};

export type MarketCapSnapshotEntry = {
  timestamp: string;
  market_caps: Record<string, number>;
  count?: number;
};

export async function saveStartPricesToDb(dateKey: string, prices: Record<string, number>) {
  const res = await fetch(getApiEndpoint("/api/watchlist-cache/start-prices"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dateKey, prices }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to save start prices (${res.status}): ${text}`);
  }
  return await res.json();
}

export async function loadStartPricesFromDb(dateKey: string): Promise<StartPriceCacheEntry> {
  const res = await fetch(getApiEndpoint(`/api/watchlist-cache/start-prices?dateKey=${encodeURIComponent(dateKey)}`));
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to load start prices (${res.status}): ${text}`);
  }
  return await res.json();
}

export async function loadStartPriceDatesFromDb(): Promise<{ dates: { dateKey: string; cachedAt: string }[] }> {
  const res = await fetch(getApiEndpoint("/api/watchlist-cache/start-prices"));
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to list start price dates (${res.status}): ${text}`);
  }
  return await res.json();
}

export async function saveMarketCapsToDb(market_caps: Record<string, number>, timestamp?: string) {
  const res = await fetch(getApiEndpoint("/api/watchlist-cache/market-caps"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ market_caps, timestamp }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to save market caps (${res.status}): ${text}`);
  }
  return await res.json();
}

export async function loadLatestMarketCapsFromDb(): Promise<MarketCapSnapshotEntry> {
  const res = await fetch(getApiEndpoint("/api/watchlist-cache/market-caps/latest"));
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to load latest market caps (${res.status}): ${text}`);
  }
  return await res.json();
}

