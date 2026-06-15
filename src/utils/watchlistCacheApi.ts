import { getApiEndpoint } from "./api";

export const RESOURCE_TAB_AI_BUILDOUT = "ai-buildout";
export const RESOURCE_TAB_WATCHLIST = "watchlist";
export const AI_BUILDOUT_WATCHLIST_NAME = "AI Buildout";

export const RESOURCE_TAB_AREAS_OF_INTEREST_LABEL = "Areas of Interest";
export const AREAS_OF_INTEREST_DESCRIPTION =
  "A list of themes and sectors we are tracking closely. Omits the AI buildout which we think deserves it's own section.";
export const UNIVERSAL_WATCHLIST_DESCRIPTION =
  "The full NYSE and NASDAQ universe with live market data. Filter by market cap, compare performance over custom date ranges, and pull AI-generated company summaries.";
export const AI_BUILDOUT_DESCRIPTION =
  "The central theme of the market. Select tags to filter the watchlist, Nodal's key AI themes are highlighted.";
export type CustomWatchlistDbEntry = {
  name: string;
  description?: string;
  order?: number;
  category?: string;
  resource_tab?: string;
  tickers: string[];
  stock_descriptions?: Record<string, string>;
  stock_subcategories?: Record<string, string>;
  stock_tags?: Record<string, string[]>;
  tag_descriptions?: Record<string, string>;
  key_tags?: string[];
  data: any[];
  last_refreshed: string | null;
};

export type CustomWatchlistCategoryDbEntry = {
  name: string;
  order?: number;
  resource_tab?: string;
};

export async function loadCustomWatchlistCategoriesFromDb(
  resourceTab?: string,
): Promise<{ categories: CustomWatchlistCategoryDbEntry[] }> {
  const query = resourceTab
    ? `?resourceTab=${encodeURIComponent(resourceTab)}`
    : "";
  const res = await fetch(
    getApiEndpoint(`/api/watchlist-cache/custom-watchlist-categories${query}`),
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to load custom watchlist categories (${res.status}): ${text}`);
  }
  return await res.json();
}

export async function saveCustomWatchlistCategoryToDb(
  name: string,
  order?: number,
  resourceTab?: string,
): Promise<CustomWatchlistCategoryDbEntry> {
  const res = await fetch(
    getApiEndpoint(`/api/watchlist-cache/custom-watchlist-categories/${encodeURIComponent(name)}`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order, resource_tab: resourceTab }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to save custom watchlist category (${res.status}): ${text}`);
  }
  return await res.json();
}

export async function deleteCustomWatchlistCategoryFromDb(
  name: string,
  resourceTab?: string,
): Promise<{ ok: boolean }> {
  const query = resourceTab
    ? `?resourceTab=${encodeURIComponent(resourceTab)}`
    : "";
  const res = await fetch(
    getApiEndpoint(
      `/api/watchlist-cache/custom-watchlist-categories/${encodeURIComponent(name)}${query}`,
    ),
    { method: "DELETE" }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to delete custom watchlist category (${res.status}): ${text}`);
  }
  return await res.json();
}

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
    stockSubcategories?: Record<string, string>;
    stockTags?: Record<string, string[]>;
    tagDescriptions?: Record<string, string>;
    keyTags?: string[];
  }
): Promise<CustomWatchlistDbEntry> {
  const res = await fetch(getApiEndpoint(`/api/watchlist-cache/custom-watchlists/${encodeURIComponent(name)}`), {
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
      stock_subcategories: options?.stockSubcategories,
      stock_tags: options?.stockTags,
      tag_descriptions: options?.tagDescriptions,
      key_tags: options?.keyTags,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to save custom watchlist (${res.status}): ${text}`);
  }
  return await res.json();
}

export async function deleteCustomWatchlistFromDb(name: string): Promise<{ ok: boolean }> {
  const res = await fetch(getApiEndpoint(`/api/watchlist-cache/custom-watchlists/${encodeURIComponent(name)}`), {
    method: "DELETE",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to delete custom watchlist (${res.status}): ${text}`);
  }
  return await res.json();
}
