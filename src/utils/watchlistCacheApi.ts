import { getApiEndpoint } from "./api";

export type CustomWatchlistDbEntry = {
  name: string;
  description?: string;
  order?: number;
  category?: string;
  tickers: string[];
  stock_descriptions?: Record<string, string>;
  stock_subcategories?: Record<string, string>;
  data: any[];
  last_refreshed: string | null;
};

export type CustomWatchlistCategoryDbEntry = {
  name: string;
  order?: number;
};

export async function loadCustomWatchlistCategoriesFromDb(): Promise<{ categories: CustomWatchlistCategoryDbEntry[] }> {
  const res = await fetch(getApiEndpoint("/api/watchlist-cache/custom-watchlist-categories"));
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to load custom watchlist categories (${res.status}): ${text}`);
  }
  return await res.json();
}

export async function saveCustomWatchlistCategoryToDb(
  name: string,
  order?: number
): Promise<CustomWatchlistCategoryDbEntry> {
  const res = await fetch(
    getApiEndpoint(`/api/watchlist-cache/custom-watchlist-categories/${encodeURIComponent(name)}`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to save custom watchlist category (${res.status}): ${text}`);
  }
  return await res.json();
}

export async function deleteCustomWatchlistCategoryFromDb(name: string): Promise<{ ok: boolean }> {
  const res = await fetch(
    getApiEndpoint(`/api/watchlist-cache/custom-watchlist-categories/${encodeURIComponent(name)}`),
    { method: "DELETE" }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to delete custom watchlist category (${res.status}): ${text}`);
  }
  return await res.json();
}

export async function loadCustomWatchlistsFromDb(): Promise<{ watchlists: CustomWatchlistDbEntry[] }> {
  const res = await fetch(getApiEndpoint("/api/watchlist-cache/custom-watchlists"));
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
    stockDescriptions?: Record<string, string>;
    stockSubcategories?: Record<string, string>;
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
      stock_descriptions: options?.stockDescriptions,
      stock_subcategories: options?.stockSubcategories,
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
