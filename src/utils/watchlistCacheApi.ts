import { getApiEndpoint } from "./api";

export type CustomWatchlistDbEntry = {
  name: string;
  tickers: string[];
  data: any[];
  last_refreshed: string | null;
};

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
  last_refreshed?: string | null
): Promise<CustomWatchlistDbEntry> {
  const res = await fetch(getApiEndpoint(`/api/watchlist-cache/custom-watchlists/${encodeURIComponent(name)}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tickers, data, last_refreshed }),
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
