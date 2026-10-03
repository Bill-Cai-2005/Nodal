# Pair Trading Correlation Screen

Finds pairs of US stocks whose daily moves track each other most closely, as
candidates for a pair trade (long one, short the other, betting the gap between
them closes).

It covers every NYSE and NASDAQ common stock with a market cap of $1B or more
(about 2,300 companies after cleaning), correlates each one against every other
over the last 2 years of daily prices, and writes the top 100 pairs.

**The output is a list of candidates, not trades.** A pair can be highly
correlated and still drift apart for good. Before trading a pair you'd also need
to confirm that the price spread between the two stocks mean-reverts
(cointegration). This screen doesn't check that.

## Visualizer (Pair Screener tab)

`app.py` is a Streamlit app that turns the screen into an interactive page. The
Nodal site embeds it as the **Pair Screener** tab on the Resources page
(`src/components/NodalWatchlist/PairScreener.tsx`).

- **Top pairs:** the ranked list, filterable by lookback (3M to 2Y), market cap,
  sector and same-sector. Click a row to chart the pair.
- **Look up a pair:** the same charts for any two stocks.
- **Overview:** how all 2.7M correlations are distributed, and which sectors the
  top pairs come from.

Each pair gets indexed prices, the spread's z-score, a 60-day rolling
correlation and a returns scatter, plus hedge ratio and mean-reversion
half-life.

The app works from a snapshot of the pipeline's cleaned, deduped prices and
company info (about 6MB) and recomputes correlations on the fly, so it loads
fast and works on a free host.

### Keeping the data fresh

The **Refresh pair data** GitHub Actions workflow
(`.github/workflows/refresh-pair-data.yml`) runs `pair_correlation.py --refresh`
and publishes the snapshot as files on the `pair-data` GitHub release. It runs:

- **Automatically** every weekday evening, after the US market close.
- **From the app**, when someone clicks **Refresh data** at the bottom of the
  page. The button shows progress, and the new data loads by itself when the run
  finishes, after about 5 to 10 minutes. It's disabled for 30 minutes after a
  refresh.
- **From GitHub**: Actions → Refresh pair data → Run workflow.

The app checks the release for new data every 15 minutes. If it can't reach the
release, for example before the workflow has ever run, it uses the snapshot
committed in `data/` instead. That copy only changes when someone commits it.

If Yahoo throttles the download, the workflow won't publish a snapshot with
fewer than 2,000 companies; the app keeps the previous data and says the last
refresh failed, with a link to the log.

The **Refresh data** button only appears when the app has a `GITHUB_TOKEN` that
can start the workflow (see Deploying). Without one, everything else, including
the automatic daily refresh, still works.

### Running the site with the screener locally

```bash
# terminal 1, from pythonscreening/
source venv/bin/activate
streamlit run app.py          # http://localhost:8501

# terminal 2, from the repo root
npm install && npm run dev    # open /tools, then the Pair Screener tab
```

In dev the tab loads `http://localhost:8501` automatically.

### Deploying

1. Deploy the Streamlit app. `render.yaml` defines it as the
   `nodal-pair-screener` service. Any Python host works if it runs
   `streamlit run app.py` from this folder, so `.streamlit/config.toml` (the
   Nodal theme) gets picked up.
2. On Vercel, set `VITE_PAIR_SCREENER_URL` to the app's URL and redeploy.
   Without it, the tab shows a "not configured" message instead of the app.
3. For the **Refresh data** button, add a `GITHUB_TOKEN` environment variable
   on the Render service: a GitHub token that can run Actions on this repo. The
   narrowest is a fine-grained token made by the repo owner, limited to this
   repo, with **Actions: Read and write**. A collaborator can instead use a
   classic token with the `repo` scope, which gives access to all of their
   repos.

Render's free plan sleeps after inactivity, so the first visit after a while
takes up to a minute while the tab shows a loading message.

## Running it

One-time setup (needs Python 3.10+):

```bash
cd pythonscreening
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Then run it:

```bash
source venv/bin/activate
python pair_correlation.py              # reuse cached data
python pair_correlation.py --refresh    # download everything fresh
```

- **The first run takes a few minutes** because it downloads about 2,500 price
  histories from Yahoo in batches, pausing between them to avoid rate limits.
  After that, runs take about a second.
- **Use `--refresh` to get current data.** Without it, the script reuses the
  stock list and prices saved on the first run, so the results never move
  forward in time. Running it on a new day without `--refresh` also mixes old
  and new date ranges if the stock list changed.
- **Set an SEC contact.** The SEC requires a name and email on requests for its
  data. The script falls back to a placeholder, but you should set your own:

  ```bash
  export SEC_USER_AGENT="Marble Investments you@yourfirm.com"
  ```

## Output

Everything is written to `output/`:

| File | What's in it |
|---|---|
| `top_100_pairs.csv` | The result: ranked pairs with names, sectors, industries, correlation and a review flag |
| `excluded_securities.csv` | Listings removed as not common stock (preferreds, bonds, warrants, funds, …), with the reason |
| `dropped_missing_data.csv` | Stocks dropped for too many missing trading days (mostly recent IPOs) |
| `removed_share_classes.csv` | Duplicate share classes removed, and which ticker was kept |
| `correlation_matrix.parquet` | The full correlation matrix, for lookups beyond the top 100 |

### Reading the top 100

- `correlation` ranges up to 1.0, which would mean identical daily moves.
- `review_flag` marks pairs at **0.97 or above**. At that level the two tickers
  are almost always the same economic entity under different company IDs, or
  two companies in a pending merger with pegged prices. Check these by hand;
  they usually aren't real pairs. For example, BN/BNT (BNT shares can be
  exchanged 1:1 for BN shares) and PAA/PAGP (PAGP's only asset is PAA units).
- Expect most pairs to be in the same sector, especially regional banks. High
  correlation mostly reflects shared industry exposure, so this is expected,
  not a bug.

## How it works, and why

The pipeline in `pair_correlation.py` runs six steps, one function each.

### 1. Universe: `fetch_universe`

It pulls every NYSE and NASDAQ listing from Nasdaq's public screener API (no key
needed) and keeps those with a market cap of $1B or more.

A market-cap filter alone isn't enough. **The screener gives preferred shares,
bonds and warrants their parent company's market cap**, so a $25 preferred of a
large bank shows up as a $50B "stock." The script also filters on the security
name to drop:

- preferreds, notes, debentures, warrants, rights and SPAC units
- **closed-end funds.** These aren't companies, and sibling funds (e.g. several
  BlackRock muni funds) move almost identically, so they would fill the top of
  the list with pairs that mean nothing.

The name rules are tuned so real equity isn't caught: MLP partnership units
(PAA, ARLP) and foreign ADRs are kept, and so are asset managers such as
BlackRock Inc. (BLK), even though the funds it runs are dropped.

The raw listing is cached, and the filters are applied on every run, so you can
change a filter without re-downloading anything.

### 2. Prices: `fetch_prices`

It downloads 2 years of daily prices and volume from Yahoo Finance (`yfinance`)
in batches of 100.

- **Adjusted prices.** Prices are adjusted for splits and dividends. Otherwise a
  2-for-1 split would look like a 50% one-day crash.
- **Completed days only.** The window ends at the last completed trading day,
  so a partial intraday bar never gets in.
- **Resumable.** Prices are cached to `cache/*.parquet` after every batch, so an
  interrupted run picks up where it stopped. Tickers Yahoo has no data for are
  recorded so they aren't retried every run.

### 3. Clean: `clean_prices`

- **Sparse stocks are dropped.** Any stock missing more than 2% of trading days
  is removed; these are mostly recent IPOs and delistings. Two years of history
  with gaps in it would distort the correlation.
- **Short gaps are filled.** Gaps of up to 5 days (trading halts) are filled
  with the previous close.
- **Leftover gaps are dropped.** Anything still missing after that is removed,
  because the correlation step needs a complete grid of prices.

### 4. Dedupe share classes: `dedupe_share_classes`

Some companies trade under several tickers (GOOG/GOOGL, BRK-A/BRK-B). Their
tickers correlate at about 0.99 for a meaningless reason and would take over the
top of the list.

Every US-registered company has one **SEC CIK number**, however many share
classes it has. The script maps each ticker to its CIK using the SEC's public
`company_tickers.json` and keeps the most liquid ticker per company (highest
average daily dollar volume).

This happens **before** correlating, and it works from the SEC data instead of
a hand-maintained list. That's how it catches obscure cases no one would think
to hardcode, such as SENEA/SENEB and RUSHA/RUSHB.

### 5. Correlate: `correlation_matrix`

**It correlates daily returns, not prices.** Two stocks that both trended up for
2 years look correlated on price even if their day-to-day moves are unrelated.
That's a shared trend, not shared movement. A pair trade depends on whether B
moves when A moves, and that shows up in daily returns.

It uses **log returns**, `ln(today / yesterday)`, which are symmetric and add
cleanly across days.

**It does this with one matrix multiply, not a loop over pairs.** Correlation is
the average product of two standardized series. So the script standardizes
every stock's returns (subtract the mean, divide by the standard deviation) into
a matrix `Z` of days × stocks. Then `Z.T @ Z / days` is the full correlation
matrix. For about 2,300 stocks (2.7 million pairs) this takes a fraction of a
second.

### 6. Rank: `top_pairs`

It takes each pair once (the upper triangle of the matrix, excluding a stock
paired with itself), sorts by correlation, and keeps the top 100. It then adds
names, sectors and industries, `same_sector`/`same_industry` columns, and the
0.97 review flag.

## Settings

The constants at the top of `pair_correlation.py`:

| Setting | Default | Meaning |
|---|---|---|
| `MIN_MARKET_CAP` | `1e9` | Market-cap cutoff |
| `LOOKBACK_YEARS` | `2` | Length of price history |
| `MAX_MISSING_FRAC` | `0.02` | Drop stocks missing more than this share of days |
| `MAX_FFILL_DAYS` | `5` | Longest gap to fill with the previous close |
| `TOP_N` | `100` | Number of pairs written out |
| `REVIEW_THRESHOLD` | `0.97` | Flag pairs at or above this correlation |
| `BATCH_SIZE` / `BATCH_PAUSE_SEC` | `100` / `2.0` | Yahoo download pacing |

## Known limitations

- **It doesn't refresh by itself.** Use `--refresh` to get new data.
- **Fixed lookback.** It measures correlation over one fixed 2-year window. A
  relationship that broke down recently can still rank high.
- **Survivorship bias.** It includes only stocks that are listed and above $1B
  today, and uses today's market caps.
- **Name-based filtering.** Security types are identified from listing names,
  which can have typos or unusual wording. New kinds of junk securities may slip
  through; check `excluded_securities.csv` and the flagged rows.
- **Related companies can have different CIKs.** Two tickers belonging to one parent
  company can have different CIKs (tracking stocks, exchangeable shares, an MLP
  and its general partner). Dedupe can't catch these, so rely on the 0.97 flag
  and manual review. LYV/LLYVK is an example that falls just below the flag.
