/**
 * LocalStorage cache utilities for watchlist data
 */

export interface WatchlistCache {
  [watchlistName: string]: string[];
}

const WATCHLISTS_KEY = "nodal_watchlists";

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

