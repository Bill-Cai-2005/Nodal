"""
Pair trading correlation screen.

Correlates daily log returns of every NYSE + NASDAQ common stock with $1B+ market
cap against every other one over the last 2 years, collapses share classes of the
same company (by SEC CIK) before correlating, and writes the top 100 pairs.

Pipeline: universe -> prices -> clean -> dedupe -> correlate -> rank

Usage:
    python pair_correlation.py              # uses cache where available
    python pair_correlation.py --refresh    # re-download universe, CIK map and prices

Set SEC_USER_AGENT to "<Name> <email>" (SEC fair-access policy requires a contact).
"""

import argparse
import json
import os
import re
import time
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import requests
import yfinance as yf

# ---------------------------------------------------------------- config

MIN_MARKET_CAP = 1e9
LOOKBACK_YEARS = 2
MAX_MISSING_FRAC = 0.02  # drop stocks missing more than this share of trading days
MAX_FFILL_DAYS = 5  # forward-fill gaps (halts) up to this many days
TOP_N = 100
REVIEW_THRESHOLD = 0.97  # at/above this, likely a missed duplicate or pegged merger

BATCH_SIZE = 100
BATCH_PAUSE_SEC = 2.0
RETRY_PAUSE_SEC = 30.0

BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / "cache"
OUTPUT_DIR = BASE_DIR / "output"

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124 Safari/537.36",
    "Accept": "application/json",
}
SEC_USER_AGENT = os.environ.get("SEC_USER_AGENT", "MarbleInvestments research@example.com")

# Non-common-stock securities. The Nasdaq screener assigns preferreds, notes and
# warrants their parent's market cap, so the $1B filter alone doesn't remove them.
JUNK_NAME = re.compile(
    r"warrants?\b|preferred|preference|notes? due|\bnotes\b|debentures?|subordinated\b"
    r"|\bbonds?\b|\brights\b|\bzones\b|%",
    re.I,
)
# "Units" is junk for SPACs / equity units, but MLP partnership units are real equity,
# and ADRs sometimes say "representing one unit".
UNITS = re.compile(r"\bunits?\b", re.I)
UNITS_OK = re.compile(r"L\.P\.|limited partner|partners|american depositary", re.I)
# Bare "Depositary Shares" (without "American") are preferred-stock depositary receipts.
BARE_DEPOSITARY = re.compile(r"(?<!american )deposit[ao]ry shares?", re.I)
# Closed-end funds: not operating companies, and sibling funds (e.g. BlackRock muni funds)
# move in lockstep, so they'd flood the top of the list. Sponsor names only count when
# not followed by "Inc", so BlackRock Inc. (BLK) and Cohen & Steers Inc (CNS) stay.
CLOSED_END_FUND = re.compile(
    r"\bfunds?\b|\bstrats\b|^(?:blackrock|gabelli|royce|nuveen|eaton vance|pimco|cohen & steers"
    r"|virtus|doubleline|kayne anderson|calamos|abrdn|tri[- ]continental|general american "
    r"investors|adams|tekla|reaves|liberty all-star)\b(?!\s+inc\b)",
    re.I,
)


# ---------------------------------------------------------------- 1. universe

def fetch_universe(refresh: bool) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (universe, excluded). Caches the raw listing; filters are applied on
    every run so they can be tuned without re-downloading."""
    path = CACHE_DIR / "universe_raw.parquet"
    if path.exists() and not refresh:
        raw = pd.read_parquet(path)
    else:
        frames = []
        for exchange in ["nasdaq", "nyse"]:
            r = requests.get(
                "https://api.nasdaq.com/api/screener/stocks",
                params={"tableonly": "true", "exchange": exchange, "download": "true"},
                headers=BROWSER_HEADERS,
                timeout=60,
            )
            r.raise_for_status()
            df = pd.DataFrame(r.json()["data"]["rows"])
            df["exchange"] = exchange.upper()
            frames.append(df)
        raw = pd.concat(frames, ignore_index=True)
        raw.to_parquet(path)

    df = pd.DataFrame({
        "ticker": raw["symbol"].str.strip().str.replace("/", "-", regex=False),
        "name": raw["name"].str.strip(),
        "exchange": raw["exchange"],
        "market_cap": pd.to_numeric(raw["marketCap"], errors="coerce"),
        "sector": raw["sector"].replace("", "Unknown").fillna("Unknown"),
        "industry": raw["industry"].replace("", "Unknown").fillna("Unknown"),
        "country": raw["country"],
    })

    df = df[df["market_cap"] >= MIN_MARKET_CAP].drop_duplicates("ticker")
    name = df["name"]
    reason = pd.Series("", index=df.index)
    reason[name.str.contains(CLOSED_END_FUND)] = "closed-end fund"
    reason[name.str.contains(BARE_DEPOSITARY)] = "preferred depositary"
    reason[name.str.contains(UNITS) & ~name.str.contains(UNITS_OK)] = "units"
    reason[name.str.contains(JUNK_NAME)] = "preferred/debt/warrant/rights"
    reason[df["ticker"].str.contains("^", regex=False)] = "preferred"

    excluded = df[reason != ""].assign(reason=reason[reason != ""])
    universe = df[reason == ""].reset_index(drop=True)
    return universe, excluded


# ---------------------------------------------------------------- 2. prices

def _download_batch(tickers: list[str], start: date, end: date) -> pd.DataFrame:
    df = yf.download(
        tickers, start=start, end=end, interval="1d", auto_adjust=True,
        progress=False, threads=True, group_by="column",
    )
    if df.empty:
        return df
    return df[["Close", "Volume"]]


def fetch_prices(tickers: list[str], refresh: bool) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (close, volume), each dates x tickers. Only missing tickers are downloaded."""
    close_path = CACHE_DIR / "close.parquet"
    volume_path = CACHE_DIR / "volume.parquet"
    failed_path = CACHE_DIR / "failed_tickers.json"

    end = date.today()  # yfinance end is exclusive: excludes today's partial bar
    start = end - timedelta(days=365 * LOOKBACK_YEARS)

    if close_path.exists() and not refresh:
        close = pd.read_parquet(close_path)
        volume = pd.read_parquet(volume_path)
        failed = set(json.loads(failed_path.read_text())) if failed_path.exists() else set()
    else:
        close, volume, failed = pd.DataFrame(), pd.DataFrame(), set()

    todo = [t for t in tickers if t not in close.columns and t not in failed]
    batches = [todo[i:i + BATCH_SIZE] for i in range(0, len(todo), BATCH_SIZE)]
    if batches:
        print(f"  downloading {len(todo)} tickers in {len(batches)} batches")

    for i, batch in enumerate(batches, 1):
        try:
            df = _download_batch(batch, start, end)
        except Exception as e:  # rate limit or network error: back off once
            print(f"  batch {i} failed ({e}); retrying in {RETRY_PAUSE_SEC:.0f}s")
            time.sleep(RETRY_PAUSE_SEC)
            df = _download_batch(batch, start, end)

        got = [] if df.empty else [t for t in batch if df["Close"].get(t) is not None
                                   and df["Close"][t].notna().any()]
        failed.update(set(batch) - set(got))
        if got:
            close = pd.concat([close, df["Close"][got]], axis=1)
            volume = pd.concat([volume, df["Volume"][got]], axis=1)

        # Save after each batch so an interrupted run resumes where it stopped.
        close.to_parquet(close_path)
        volume.to_parquet(volume_path)
        failed_path.write_text(json.dumps(sorted(failed)))
        print(f"  batch {i}/{len(batches)}: {len(got)}/{len(batch)} ok")
        time.sleep(BATCH_PAUSE_SEC)

    keep = [t for t in tickers if t in close.columns]
    close = close[keep].sort_index()
    volume = volume[keep].sort_index()
    return close, volume


# ---------------------------------------------------------------- 3. clean

def clean_prices(close: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Drops sparse series and forward-fills short gaps. Returns (clean_close, dropped)."""
    close = close.dropna(how="all")  # dates where nothing traded (bad rows)
    missing_frac = close.isna().mean()

    too_sparse = missing_frac[missing_frac > MAX_MISSING_FRAC].index
    close = close.drop(columns=too_sparse)
    close = close.ffill(limit=MAX_FFILL_DAYS)

    # Anything still missing (leading gap, or a gap longer than the ffill limit) can't
    # go into a full-matrix correlation.
    still_missing = close.columns[close.isna().any()]
    close = close.drop(columns=still_missing)

    dropped = pd.DataFrame({
        "ticker": list(too_sparse) + list(still_missing),
        "reason": ["missing >{:.0%} of days".format(MAX_MISSING_FRAC)] * len(too_sparse)
        + [f"gap longer than {MAX_FFILL_DAYS} days"] * len(still_missing),
        "missing_frac": list(missing_frac[too_sparse]) + list(missing_frac[still_missing]),
    })
    return close, dropped


# ---------------------------------------------------------------- 4. dedupe

def fetch_cik_map(refresh: bool) -> pd.Series:
    """ticker -> CIK, from the SEC's public ticker file."""
    path = CACHE_DIR / "sec_tickers.json"
    if not path.exists() or refresh:
        r = requests.get(
            "https://www.sec.gov/files/company_tickers.json",
            headers={"User-Agent": SEC_USER_AGENT},
            timeout=60,
        )
        r.raise_for_status()
        path.write_text(r.text)
    rows = json.loads(path.read_text()).values()
    return pd.Series({row["ticker"].replace(".", "-"): row["cik_str"] for row in rows})


def dedupe_share_classes(close: pd.DataFrame, volume: pd.DataFrame, cik_map: pd.Series,
                         universe: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Keeps the most liquid ticker per CIK. Returns (close, removed)."""
    tickers = close.columns
    dollar_volume = (close * volume[tickers]).mean()
    # Tickers without a CIK (rare) are treated as their own company.
    company = pd.Series({t: cik_map.get(t, f"noCIK:{t}") for t in tickers})

    info = pd.DataFrame({"company": company, "avg_dollar_volume": dollar_volume})
    info = info.sort_values("avg_dollar_volume", ascending=False)
    kept = info[~info["company"].duplicated()]
    removed = info[info["company"].duplicated()].copy()

    removed["kept_ticker"] = removed["company"].map(
        pd.Series(kept.index, index=kept["company"]))
    removed = removed.rename_axis("removed_ticker").reset_index()
    removed = removed.merge(universe[["ticker", "name"]], left_on="removed_ticker",
                            right_on="ticker", how="left").drop(columns="ticker")
    removed = removed.rename(columns={"company": "cik"})

    return close[kept.index], removed


# ---------------------------------------------------------------- 5. correlate

def correlation_matrix(close: pd.DataFrame) -> pd.DataFrame:
    """Pearson correlation of daily log returns via one matrix multiply."""
    log_returns = np.log(close).diff().iloc[1:]
    log_returns = log_returns.loc[:, log_returns.std() > 0]  # flat series can't be standardized
    r = log_returns.to_numpy()
    z = (r - r.mean(axis=0)) / r.std(axis=0)  # standardize each stock's series
    corr = (z.T @ z) / len(z)  # correlation = mean product of z-scores
    return pd.DataFrame(corr, index=log_returns.columns, columns=log_returns.columns)


# ---------------------------------------------------------------- 6. rank

def top_pairs(corr: pd.DataFrame, universe: pd.DataFrame, n: int) -> pd.DataFrame:
    c = corr.to_numpy()
    i, j = np.triu_indices_from(c, k=1)  # each pair once, no self-pairs
    vals = c[i, j]
    top = np.argsort(vals)[::-1][:n]

    tickers = corr.columns.to_numpy()
    pairs = pd.DataFrame({
        "rank": np.arange(1, len(top) + 1),
        "ticker_a": tickers[i[top]],
        "ticker_b": tickers[j[top]],
        "correlation": vals[top].round(4),
    })

    meta = universe.set_index("ticker")[["name", "sector", "industry", "market_cap"]]
    for side in ["a", "b"]:
        pairs = pairs.join(meta.add_suffix(f"_{side}"), on=f"ticker_{side}")
    pairs["same_sector"] = pairs["sector_a"] == pairs["sector_b"]
    pairs["same_industry"] = pairs["industry_a"] == pairs["industry_b"]
    pairs["review_flag"] = np.where(
        pairs["correlation"] >= REVIEW_THRESHOLD,
        "REVIEW: possible duplicate or pegged merger", "")

    cols = ["rank", "ticker_a", "name_a", "ticker_b", "name_b", "correlation",
            "review_flag", "sector_a", "sector_b", "same_sector", "industry_a",
            "industry_b", "same_industry", "market_cap_a", "market_cap_b"]
    return pairs[cols]


# ---------------------------------------------------------------- main

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--refresh", action="store_true",
                        help="ignore cache and re-download everything")
    args = parser.parse_args()

    CACHE_DIR.mkdir(exist_ok=True)
    OUTPUT_DIR.mkdir(exist_ok=True)

    print("1. Universe")
    universe, excluded = fetch_universe(args.refresh)
    excluded.to_csv(OUTPUT_DIR / "excluded_securities.csv", index=False)
    print(f"  {len(universe)} common stocks with market cap >= ${MIN_MARKET_CAP / 1e9:.0f}B "
          f"({len(excluded)} non-common securities excluded)")

    print("2. Prices")
    close, volume = fetch_prices(universe["ticker"].tolist(), args.refresh)
    print(f"  {close.shape[1]} tickers with data, {close.shape[0]} trading days "
          f"({close.index[0].date()} to {close.index[-1].date()})")

    print("3. Clean")
    close, dropped = clean_prices(close)
    dropped.to_csv(OUTPUT_DIR / "dropped_missing_data.csv", index=False)
    print(f"  dropped {len(dropped)} for missing data, {close.shape[1]} remain")

    print("4. Dedupe share classes")
    cik_map = fetch_cik_map(args.refresh)
    close, removed = dedupe_share_classes(close, volume, cik_map, universe)
    removed.to_csv(OUTPUT_DIR / "removed_share_classes.csv", index=False)
    print(f"  removed {len(removed)} duplicate share classes, {close.shape[1]} companies remain")

    print("5. Correlate")
    t0 = time.perf_counter()
    corr = correlation_matrix(close)
    n_pairs = len(corr) * (len(corr) - 1) // 2
    print(f"  {len(corr)}x{len(corr)} matrix ({n_pairs:,} pairs) in "
          f"{time.perf_counter() - t0:.2f}s")
    corr.to_parquet(OUTPUT_DIR / "correlation_matrix.parquet")

    print("6. Rank")
    pairs = top_pairs(corr, universe, TOP_N)
    out = OUTPUT_DIR / f"top_{TOP_N}_pairs.csv"
    pairs.to_csv(out, index=False)
    n_flag = (pairs["review_flag"] != "").sum()
    print(f"  wrote {out.relative_to(BASE_DIR)}; {n_flag} pairs flagged >= {REVIEW_THRESHOLD}, "
          f"{pairs['same_sector'].mean():.0%} same-sector")
    print()
    print(pairs[["rank", "ticker_a", "ticker_b", "correlation", "review_flag"]]
          .head(20).to_string(index=False))


if __name__ == "__main__":
    main()
