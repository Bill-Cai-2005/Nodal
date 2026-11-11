# News feed: should it update live?

Goalset 2 asks us to explore live updating for the Resources → News feed and decide whether it's viable. Manual refresh is acceptable.

## Recommendation

- **v0 (built):** manual Refresh button plus an "Updated X min ago" line.
- **Next, if we want it:** have the page re-check the feed every 5 minutes while the News tab is open. This is viable: it's about 10 lines of frontend code, it costs nothing extra at Massive, and it works with our sleeping Render server.
- **Not now:** true push (server-sent events or websockets). Our news source isn't real-time, so push would only show a story a few minutes sooner, and our free Render backend can't hold long-lived connections reliably.

## Why: our source isn't real-time

- The feed reads Massive's news endpoint (`/v2/reference/news`). Massive's docs say it is "updated hourly on all plans".
- On Nov 3, I checked Massive's newest articles once a minute from 5:13 to 5:31 PM ET, after the market close. No new articles appeared; the newest stayed at 5:00 PM ET. That fits hourly batches, but early evening is quiet, so it isn't proof.
- Massive has **no news websocket**. Its stock websockets cover trades, quotes, per-second and per-minute bars, trading halts (LULD), order imbalances and fair value. News isn't one of them.
- The only real-time news Massive sells is **Benzinga News** (`/benzinga/v2/news`), a separate add-on listed at $99/month. Even that is a REST endpoint you poll, not a stream.

So any "live" feed we build ends up polling Massive somewhere. The only choice is who polls and how often.

## What polling costs

Fetching the whole feed (3 days of all news) takes 2–3 Massive requests: on Nov 3 it was 1,446 articles, or 2 pages of 1,000. Fetching only articles newer than the last one we saw takes 1 request.

| Polling Massive every | Whole feed each time | Only new articles |
|---|---|---|
| 1 minute | 2,900–4,300 requests/day | 1,440 requests/day |
| 5 minutes | 580–860 requests/day | 288 requests/day |
| 10 minutes | 290–430 requests/day | 144 requests/day |

- **On a paid Massive plan,** requests are unlimited, so any row is fine.
- **On the free Basic plan** (5 requests a minute), polling every minute would use most of our allowance and slow down the price lookups that share the key. We still need to confirm which plan we're on; it's an open question in the Goalset 1 plan.
- **Browser polling doesn't multiply these numbers.** The server caches the feed for 10 minutes, so it calls Massive at most once per 10 minutes, however many visitors are polling. Worst case, with someone on the page all day: about 430 requests a day.

## Polling vs. server-sent events vs. websockets, for our setup

Our setup: the frontend is a static site on Vercel, so the browser talks straight to the backend on Render. Vercel's limits don't matter here; Render's do. The backend is on Render's free plan, which means:

- it sleeps after 15 minutes without traffic and takes about a minute to wake;
- Render may restart it at any time, which also empties the in-memory news cache;
- it shares 750 free hours a month with the Pair Screener service.

| Approach | How it works | Fit for us |
|---|---|---|
| **Manual refresh** (v0) | The visitor clicks Refresh. | Works today. The visitor has to remember to click. |
| **Browser polling** | The page asks our server for the feed every few minutes while the tab is open. | **Good fit.** Simple, and it survives sleeps and restarts, since each check is an ordinary request. It only wakes the server while someone is looking. |
| **Server-sent events (SSE)** | The browser keeps one connection open, and the server pushes new stories down it. | Poor fit for now. The server still has to poll Massive to know what's new. Connections drop whenever Render restarts or sleeps, so we'd need reconnect handling. It's more code to save a few minutes, on a source that updates about hourly. |
| **Websockets** | A two-way connection between browser and server. | Worst fit. It has all of SSE's problems and more code, and two-way isn't needed because visitors only receive news. |

## Keeping news fresh when nobody is on the site

That's a different problem from live updates. The Goalset 1 plan already proposes a scheduled ingest job that stores news every 10 minutes. On the free plan, a timer inside the server stops when the server sleeps. Keeping the server awake around the clock would use about 730 of the 750 free hours and leave too little for the Pair Screener. So that job belongs in an external scheduler (a Render cron job or GitHub Actions) that writes to the database. The feed would then read from the database instead of calling Massive.

## When to revisit push

Reconsider SSE if both of these happen:

1. we pay for a real-time source, such as Benzinga, and
2. the backend moves to an always-on paid Render instance.

Even then, browser polling every 1–2 minutes gets most of the benefit with far less code.

Sources: [Massive news endpoint](https://massive.com/docs/rest/stocks/news), [Massive stock websockets](https://massive.com/docs/websocket/stocks/overview), [Benzinga News v2 on Massive](https://massive.com/docs/rest/partners/benzinga/news), [Massive changelog](https://massive.com/changelog), [Massive pricing](https://massive.com/pricing), [Massive request limits](https://massive.com/knowledge-base/article/what-is-the-request-limit-for-massives-restful-apis), [Render free plan](https://render.com/docs/free).
