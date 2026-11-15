# News job: setup

The watchlist rows' "latest news" and the News tab now read from MongoDB instead of calling
Massive and the SEC on every click. A scheduled GitHub Actions workflow,
[`.github/workflows/refresh-news.yml`](../.github/workflows/refresh-news.yml), fills the database by
running `server/src/jobs/ingestNews.ts`. It runs every 10 minutes on weekdays from about 6 AM to
8 PM New York time and hourly otherwise. It runs on GitHub rather than on Render because the free
Render backend sleeps when nobody is using it.

## What to set (repo Settings → Secrets and variables → Actions)

| Name | Kind | Value |
| --- | --- | --- |
| `MONGO_URI` | Secret | The same Atlas connection string the Render backend uses. |
| `POLYGON_API_KEY` | Secret | The Massive (Polygon) API key the backend uses. |
| `SEC_USER_AGENT` | Variable | A name and a contact email the SEC can reach, e.g. `Nodal Research ops@yourdomain.com`. The SEC requires this. It is the same variable `refresh-pair-data.yml` reads, so if that is already set there is nothing to do. |
| `ANTHROPIC_API_KEY` | Secret | Optional. Turns on the AI check (below). Use a key from an Anthropic workspace with a monthly spend limit. |

If `SEC_USER_AGENT` is missing, the job still saves Massive news, but the run fails with a message
saying so, and the rows show no SEC filings.

### The AI check

With `ANTHROPIC_API_KEY` set, a small Claude model (Claude Haiku 5.5) reads each new Massive article
and decides, for each of our tickers it is tagged with, whether it is material news about that
company. It uses the same three tests, event types and drop reasons as the rules, and the rules'
verdict is kept next to its answer. The code is in `server/src/utils/newsAi.ts`.

- Without the key, or when a call fails, the rules make the call, exactly as before.
- Law-firm and market-research ads, articles tagged with more than 12 of our tickers, and SEC
  filings are never sent to it.
- Each run sends at most 200 articles, newest first. Only the first run's 14-day backfill gets near
  that; a normal 10-minute run sends a handful.
- Each run's log and its `news_runs` document show the calls, tokens and estimated cost.
- To measure it against hand-labelled stories, see `server/src/jobs/scoreAiCheck.ts`.

Also check that Atlas → Network Access allows GitHub's runners. Their addresses change, so this
needs `0.0.0.0/0`, which a free Render backend usually needs too.

## Turning it on

1. Merge to `master`. GitHub only runs scheduled workflows from the default branch.
2. Set the secrets and variable above.
3. Actions → Refresh news → Run workflow, once. The first run reads 14 days of news and every
   company's filings, which takes a minute or two. Until it finishes, news rows say "Couldn't load
   news right now" and the API answers `503` with `status: "empty"`.

After that it runs on its own. The Render backend no longer needs `SEC_USER_AGENT` for news.
It still needs `POLYGON_API_KEY` for prices.

## Checking on it

- Each run's log on the Actions tab lists how many articles and filings were new, and how many
  were already stored and skipped. A failed source shows as a failed run, and GitHub emails whoever
  last changed the workflow's schedule.
- `GET /api/news-feed` and `GET /api/news/:ticker` include `fetched_at` (the last successful read
  of Massive) and `status`. `status` becomes `"stale"` after 3 hours without a successful run, and
  the row and the News tab then show how old the news is.
- GitHub turns off scheduled workflows in public repos after 60 days without any commits. If that
  happens, re-enable it on the Actions tab.

## What it stores

Three collections, with anything older than 30 days deleted on every run (a few MB in total):

- `news_articles`: one document per article or filing.
- `news_verdicts`: one per article–ticker pair, with whether it is shown, the event type or the
  reason it was dropped, and which judge made the call (`ai` or `rules`). AI verdicts also store
  the rules' verdict, the AI check's version and its one-line reason.
- `news_runs`: one per job run, used for `fetched_at`/`status` and to know where to resume.
