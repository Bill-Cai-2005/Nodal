import { getApiEndpoint } from "./api";

export type TickerNewsPick = {
  title: string;
  url: string;
  publisher: string;
  published_utc: string;
  event: string;
};

export type TickerNewsResponse = {
  ticker: string;
  pick: TickerNewsPick | null;
  checked: number;
};

// One request per ticker per page load: re-expanding a row reuses the first answer.
const requests = new Map<string, Promise<TickerNewsResponse>>();
const results = new Map<string, TickerNewsResponse>();

const cacheKey = (ticker: string) => ticker.trim().toUpperCase();

export const getLoadedTickerNews = (ticker: string): TickerNewsResponse | undefined =>
  results.get(cacheKey(ticker));

export function fetchTickerNews(ticker: string): Promise<TickerNewsResponse> {
  const key = cacheKey(ticker);
  const existing = requests.get(key);
  if (existing) return existing;

  const request = (async () => {
    const res = await fetch(getApiEndpoint(`/api/news/${encodeURIComponent(key)}`));
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to load news (${res.status}): ${text}`);
    }
    const data = (await res.json()) as TickerNewsResponse;
    results.set(key, data);
    return data;
  })();
  requests.set(key, request);
  // Forget failures so the next expand can try again.
  request.catch(() => requests.delete(key));
  return request;
}
