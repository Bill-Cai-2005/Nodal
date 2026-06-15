import { getApiEndpoint } from "./api";

export const RESOURCE_TAB_AI_BUILDOUT = "ai-buildout";
export const RESOURCE_TAB_WATCHLIST = "watchlist";
export const AI_BUILDOUT_WATCHLIST_NAME = "AI Buildout";

export const RESOURCE_TAB_AREAS_OF_INTEREST_LABEL = "Areas of Interest";
export const AREAS_OF_INTEREST_DESCRIPTION =
  "Everything we're interested in outside of AI.";
export const UNIVERSAL_WATCHLIST_DESCRIPTION =
  "The full NYSE and NASDAQ universe with live market data.";
export const AI_BUILDOUT_DESCRIPTION =
  "The central theme of the market.";

export type CustomWatchlistDbEntry = {
  name: string;
  description?: string;
  order?: number;
  category?: string;
  resource_tab?: string;
  tickers: string[];
  stock_descriptions?: Record<string, string>;
  stock_tags?: Record<string, string[]>;
  tag_descriptions?: Record<string, string>;
  key_tags?: string[];
  data: any[];
  last_refreshed: string | null;
};

export async function loadCustomWatchlistsFromDb(
  resourceTab?: string,
): Promise<{ watchlists: CustomWatchlistDbEntry[] }> {
  const query = resourceTab
    ? `?resourceTab=${encodeURIComponent(resourceTab)}`
    : "";
  const res = await fetch(
    getApiEndpoint(`/api/watchlist-cache/custom-watchlists${query}`),
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to load custom watchlists (${res.status}): ${text}`);
  }
  return await res.json();
}

export async function saveCustomWatchlistToDb(
  name: string,
  tickers: string[],
  data: any[],
  last_refreshed?: string | null,
  options?: {
    description?: string;
    order?: number;
    category?: string;
    resourceTab?: string;
    stockDescriptions?: Record<string, string>;
    stockTags?: Record<string, string[]>;
    tagDescriptions?: Record<string, string>;
    keyTags?: string[];
  },
): Promise<CustomWatchlistDbEntry> {
  const res = await fetch(
    getApiEndpoint(
      `/api/watchlist-cache/custom-watchlists/${encodeURIComponent(name)}`,
    ),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tickers,
        data,
        last_refreshed,
        description: options?.description,
        order: options?.order,
        category: options?.category,
        resource_tab: options?.resourceTab,
        stock_descriptions: options?.stockDescriptions,
        stock_subcategories: {},
        stock_tags: options?.stockTags,
        tag_descriptions: options?.tagDescriptions,
        key_tags: options?.keyTags,
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to save custom watchlist (${res.status}): ${text}`);
  }
  return await res.json();
}

export async function saveStockTagsForTickerToDb(
  name: string,
  ticker: string,
  tags: string[],
): Promise<Record<string, string[]>> {
  const res = await fetch(
    getApiEndpoint(
      `/api/watchlist-cache/custom-watchlists/${encodeURIComponent(name)}/stock-tags`,
    ),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, tags }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to save stock tags (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.stock_tags || {};
}

export async function deleteCustomWatchlistFromDb(
  name: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(
    getApiEndpoint(
      `/api/watchlist-cache/custom-watchlists/${encodeURIComponent(name)}`,
    ),
    { method: "DELETE" },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to delete custom watchlist (${res.status}): ${text}`);
  }
  return await res.json();
}
