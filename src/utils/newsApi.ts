import { getApiEndpoint } from "./api";

export type TickerNewsPick = {
  title: string;
  url: string;
  publisher: string;
  published_utc: string;
  event: string;
  // "sec": an 8-K or 6-K filing; publisher is then the form, e.g. "8-K".
  source: "news" | "sec";
};

export type TickerNewsResponse = {
  ticker: string;
  pick: TickerNewsPick | null;
  checked: number;
  // When the server's news job last read Massive news and SEC filings. "stale": one of them is
  // over 3 hours old; "not_tracked": the job doesn't collect news for this ticker.
  fetched_at?: string | null;
  filings_checked_at?: string | null;
  status?: "ok" | "stale" | "not_tracked";
};

type EveryTickerResponse = {
  fetched_at: string | null;
  filings_checked_at: string | null;
  status: "ok" | "stale";
  tickers: Record<string, Pick<TickerNewsResponse, "ticker" | "pick" | "checked">>;
};

// One request per ticker per page load: re-expanding a row reuses the first answer.
const requests = new Map<string, Promise<TickerNewsResponse>>();
const results = new Map<string, TickerNewsResponse>();

const cacheKey = (ticker: string) => ticker.trim().toUpperCase();

export const getLoadedTickerNews = (ticker: string): TickerNewsResponse | undefined =>
  results.get(cacheKey(ticker));

// The first expanded row loads every tracked ticker's news in one request (GET /api/news), so
// later rows open instantly. Tickers missing from it are asked for one at a time.
let everyTicker: Promise<void> | null = null;
function loadEveryTicker(): Promise<void> {
  if (!everyTicker) {
    everyTicker = (async () => {
      const res = await fetch(getApiEndpoint("/api/news"));
      if (!res.ok) throw new Error(`Failed to load news (${res.status})`);
      const { tickers, ...freshness } = (await res.json()) as EveryTickerResponse;
      for (const news of Object.values(tickers)) {
        results.set(cacheKey(news.ticker), { ...news, ...freshness });
      }
    })();
    // Forget failures so the next expand can try again.
    everyTicker.catch(() => {
      everyTicker = null;
    });
  }
  return everyTicker;
}

export function fetchTickerNews(ticker: string): Promise<TickerNewsResponse> {
  const key = cacheKey(ticker);
  const existing = requests.get(key);
  if (existing) return existing;

  const request = (async () => {
    await loadEveryTicker().catch(() => undefined); // on failure, the single request below decides
    const loaded = results.get(key);
    if (loaded) return loaded;

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
