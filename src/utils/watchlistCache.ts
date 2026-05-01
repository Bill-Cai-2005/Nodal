/**
 * LocalStorage cache utilities for watchlist data
 */

export interface WatchlistCache {
  [watchlistName: string]: string[];
}

const WATCHLISTS_KEY = "nodal_watchlists";
const STOCK_DESCRIPTIONS_KEY = "nodal_stock_descriptions_by_watchlist";
const STOCK_SUBCATEGORIES_KEY = "nodal_stock_subcategories_by_watchlist";

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

export const loadStockDescriptionsByWatchlist = (): Record<
  string,
  Record<string, string>
> => {
  try {
    const data = localStorage.getItem(STOCK_DESCRIPTIONS_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
};

export const saveStockDescriptionsByWatchlist = (
  stockDescriptionsByWatchlist: Record<string, Record<string, string>>,
): void => {
  try {
    localStorage.setItem(
      STOCK_DESCRIPTIONS_KEY,
      JSON.stringify(stockDescriptionsByWatchlist),
    );
  } catch (err) {
    console.error("Failed to save stock descriptions:", err);
  }
};

export const loadStockSubcategoriesByWatchlist = (): Record<
  string,
  Record<string, string>
> => {
  try {
    const data = localStorage.getItem(STOCK_SUBCATEGORIES_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
};

export const saveStockSubcategoriesByWatchlist = (
  stockSubcategoriesByWatchlist: Record<string, Record<string, string>>,
): void => {
  try {
    localStorage.setItem(
      STOCK_SUBCATEGORIES_KEY,
      JSON.stringify(stockSubcategoriesByWatchlist),
    );
  } catch (err) {
    console.error("Failed to save stock subcategories:", err);
  }
};

