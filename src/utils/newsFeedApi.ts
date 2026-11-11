import { getApiEndpoint } from "./api";

export type NewsFeedItem = {
  title: string;
  url: string;
  publisher: string;
  published_utc: string;
  tickers: { ticker: string; event: string }[];
};

export type NewsFeedResponse = {
  fetched_at: string;
  days: number;
  checked: number;
  items: NewsFeedItem[];
};

// The last feed loaded on this page, so switching back to the News tab shows it at once.
let lastFeed: NewsFeedResponse | undefined;

export const getLoadedNewsFeed = (): NewsFeedResponse | undefined => lastFeed;

export async function fetchNewsFeed(): Promise<NewsFeedResponse> {
  const res = await fetch(getApiEndpoint("/api/news-feed"));
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to load news feed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as NewsFeedResponse;
  lastFeed = data;
  return data;
}
