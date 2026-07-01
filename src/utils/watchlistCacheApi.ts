import { getApiEndpoint } from "./api";

export const RESOURCE_TAB_AI_BUILDOUT = "ai-buildout";
export const RESOURCE_TAB_AI_APPLICATIONS = "ai-applications";
export const RESOURCE_TAB_WATCHLIST = "watchlist";
export const RESOURCE_TAB_UNIVERSAL = "universal";
export const RESOURCE_TAB_META_WATCHLIST_NAME = "__tab_description__";
export const AI_BUILDOUT_WATCHLIST_NAME = "AI Buildout";
export const AI_APPLICATIONS_WATCHLIST_NAME = "AI Applications";

export const RESOURCE_TAB_AREAS_OF_INTEREST_LABEL = "Areas of Interest";
export const AREAS_OF_INTEREST_DESCRIPTION =
  "Everything we're interested in outside of AI.";
export const UNIVERSAL_WATCHLIST_DESCRIPTION =
  "The full NYSE and NASDAQ universe with live market data.";
export const AI_BUILDOUT_DESCRIPTION =
  "The central theme of the market.";
export const AI_APPLICATIONS_DESCRIPTION =
  "Companies building and deploying AI-powered applications.";

export const MANAGED_THEME_WATCHLIST_NAMES = [
  AI_BUILDOUT_WATCHLIST_NAME,
  AI_APPLICATIONS_WATCHLIST_NAME,
] as const;

export function getManagedThemeWatchlistTab(name: string): string | null {
  const normalized = String(name || "").trim().toLowerCase();
  if (normalized === AI_BUILDOUT_WATCHLIST_NAME.toLowerCase()) {
    return RESOURCE_TAB_AI_BUILDOUT;
  }
  if (normalized === AI_APPLICATIONS_WATCHLIST_NAME.toLowerCase()) {
    return RESOURCE_TAB_AI_APPLICATIONS;
  }
  return null;
}

export function getManagedThemeWatchlistLabel(name: string): string {
  if (name.toLowerCase() === AI_BUILDOUT_WATCHLIST_NAME.toLowerCase()) {
    return "AI Buildout";
  }
  if (name.toLowerCase() === AI_APPLICATIONS_WATCHLIST_NAME.toLowerCase()) {
    return "AI Applications";
  }
  return name;
}

export function isManagedThemeWatchlistName(name: string): boolean {
  return getManagedThemeWatchlistTab(name) !== null;
}

export function isResourceTabMetaWatchlistName(name: string): boolean {
  return (
    String(name || "").trim().toLowerCase() ===
    RESOURCE_TAB_META_WATCHLIST_NAME.toLowerCase()
  );
}

export async function saveResourceTabDescription(
  resourceTab: string,
  description: string,
): Promise<CustomWatchlistDbEntry> {
  return saveCustomWatchlistToDb(
    RESOURCE_TAB_META_WATCHLIST_NAME,
    [],
    [],
    null,
    {
      description,
      order: -1,
      category: "Uncategorized",
      resourceTab,
    },
  );
}

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
