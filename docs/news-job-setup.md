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
| `MONGO_URI` | Secret | The same Atlas connection string the Render backend uses. The one in the committed root `.env` needs rotating; use the new one. |
| `POLYGON_API_KEY` | Secret | The Massive (Polygon) API key the backend uses. |
| `SEC_USER_AGENT` | Variable | A name and a contact email the SEC can reach, e.g. `Nodal Research ops@yourdomain.com`. The SEC requires this. It is the same variable `refresh-pair-data.yml` reads, so if that is already set there is nothing to do. |

If `SEC_USER_AGENT` is missing, the job still saves Massive news, but the run fails with a message
saying so, and the rows show no SEC filings.

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
  reason it was dropped, and which judge made the call (`rules` today, `ai` once the AI check is
  approved and added in `judgeWithAi` in `ingestNews.ts`).
- `news_runs`: one per job run, used for `fetched_at`/`status` and to know where to resume.
