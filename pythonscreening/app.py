"""
Pair screener visualizer.

Interactive front end for pair_correlation.py, embedded in the Nodal site's
Resources page. Reads the snapshot in data/ (written by the pipeline) and
recomputes correlations live, so lookback and filters can change without any
downloads.

    streamlit run app.py
"""

import re

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from pair_correlation import DATA_DIR, REVIEW_THRESHOLD, correlation_matrix, top_pairs

st.set_page_config(page_title="Pair Screener", layout="wide")

LOOKBACKS = {"3M": 63, "6M": 126, "1Y": 252, "2Y": None}  # trading days; None = all
MIN_CAPS = {"$1B+": 1e9, "$10B+": 1e10, "$50B+": 5e10, "$200B+": 2e11}
TOP_N = 100
ROLLING_DAYS = 60

# Chart tokens: series A/B are categorical slots 1-2 (validated on a white surface).
SERIES_A, SERIES_B = "#2a78d6", "#eb6834"
INK, INK_2, MUTED = "#0b0b0b", "#52514e", "#898781"
GRID, AXIS, SURFACE = "#e1e0d9", "#c3c2b7", "#ffffff"
FONT = "Montserrat, sans-serif"

# Listing names carry the security type ("Class A Common Stock", "ADR (representing...)");
# the company name is everything before it.
SECURITY_SUFFIX = re.compile(
    r"\s+(?:Class [A-Z]\b|Common\b|Ordinary\b|Limited Voting|Exchangeable|American Depositary"
    r"|ADRs?\b|ADS\b|Units? representing|\().*$")


# ---------------------------------------------------------------- data

@st.cache_data
def load_snapshot() -> tuple[pd.DataFrame, pd.DataFrame]:
    prices = pd.read_parquet(DATA_DIR / "prices.parquet").astype("float64")
    meta = pd.read_parquet(DATA_DIR / "universe.parquet")
    meta["name"] = meta["name"].str.replace(SECURITY_SUFFIX, "", regex=True).str.strip()
    return prices, meta


def window(prices: pd.DataFrame, lookback: str) -> pd.DataFrame:
    days = LOOKBACKS[lookback]
    return prices if days is None else prices.iloc[-(days + 1):]  # +1: n returns need n+1 prices


@st.cache_data(max_entries=32, show_spinner="Correlating…")
def screen(lookback: str, min_cap: str, sectors: tuple[str, ...], same_sector_only: bool,
           hide_flagged: bool) -> dict:
    """Top pairs plus summary stats. Caches the small results, not the matrix."""
    prices, meta = load_snapshot()
    keep = meta[meta["market_cap"] >= MIN_CAPS[min_cap]]
    if sectors:
        keep = keep[keep["sector"].isin(sectors)]
    if len(keep) < 2:
        return {"pairs": pd.DataFrame(), "n_companies": len(keep), "n_pairs": 0}

    corr = correlation_matrix(window(prices[keep.index], lookback))
    pairs = top_pairs(corr, keep.reset_index(), TOP_N, same_sector_only, hide_flagged)
    vals = corr.to_numpy()[np.triu_indices(len(corr), k=1)]
    hist, edges = np.histogram(vals, bins=np.linspace(-0.2, 1.0, 61))
    return {
        "pairs": pairs,
        "n_companies": len(corr),
        "n_pairs": len(vals),
        "hist": pd.DataFrame({"lo": edges[:-1], "hi": edges[1:], "count": hist}),
    }


def pair_stats(a: pd.Series, b: pd.Series) -> dict:
    """Spread and mean-reversion stats for one pair over the selected window."""
    log_a, log_b = np.log(a), np.log(b)
    hedge, _ = np.polyfit(log_b, log_a, 1)  # log A ~ hedge * log B
    spread = log_a - hedge * log_b
    z = (spread - spread.mean()) / spread.std()

    # Half-life from an AR(1) fit: change in spread vs. yesterday's distance from its mean.
    lagged = spread.shift(1).iloc[1:]
    speed, _ = np.polyfit(lagged - lagged.mean(), spread.diff().iloc[1:], 1)
    half_life = -np.log(2) / speed if speed < 0 else np.inf

    rets = pd.DataFrame({"a": log_a.diff(), "b": log_b.diff()}).iloc[1:]
    return {
        "correlation": rets["a"].corr(rets["b"]),
        "hedge": hedge,
        "z": z,
        "half_life": half_life,
        "rets": rets,
        "rolling": rets["a"].rolling(ROLLING_DAYS).corr(rets["b"]).dropna(),
    }


# ---------------------------------------------------------------- charts

def styled(fig: go.Figure, title: str, height: int = 320) -> go.Figure:
    fig.update_layout(
        height=height, margin=dict(l=48, r=16, t=48, b=40),
        paper_bgcolor=SURFACE, plot_bgcolor=SURFACE,
        font=dict(family=FONT, size=12, color=INK_2),
        title=dict(text=title, x=0, xanchor="left", font=dict(size=14, color=INK)),
        hoverlabel=dict(bgcolor=SURFACE, bordercolor=GRID, font=dict(family=FONT, color=INK)),
        legend=dict(orientation="h", x=1, xanchor="right", y=1.02, yanchor="bottom",
                    font=dict(color=INK_2)),
        showlegend=False,
    )
    fig.update_xaxes(automargin=True, showgrid=False, linecolor=AXIS, tickfont=dict(color=MUTED), ticks="",
                     showspikes=True, spikemode="across", spikethickness=1, spikecolor=AXIS,
                     spikedash="solid")
    fig.update_yaxes(automargin=True, gridcolor=GRID, gridwidth=1, zeroline=False, linecolor=AXIS,
                     tickfont=dict(color=MUTED), ticks="")
    return fig


def show(fig: go.Figure) -> None:
    st.plotly_chart(fig, theme=None, width="stretch", config={"displayModeBar": False})


def price_chart(a: pd.Series, b: pd.Series) -> go.Figure:
    """Both stocks indexed to 100 at the start of the window, on one axis."""
    fig = go.Figure()
    ends = [a.iloc[-1] / a.iloc[0], b.iloc[-1] / b.iloc[0]]
    # When the lines end close together, push the end labels apart so they don't overlap.
    nudge = 8 if abs(ends[0] - ends[1]) * 100 < 4 else 0
    for s, color, end, other in [(a, SERIES_A, ends[0], ends[1]), (b, SERIES_B, ends[1], ends[0])]:
        indexed = s / s.iloc[0] * 100
        fig.add_scatter(x=indexed.index, y=indexed, name=s.name, mode="lines",
                        line=dict(color=color, width=2),
                        hovertemplate=f"{s.name} %{{y:.1f}}<extra></extra>")
        fig.add_annotation(x=indexed.index[-1], y=indexed.iloc[-1], text=f"<b>{s.name}</b>",
                           showarrow=False, xanchor="left", xshift=6,
                           yshift=nudge if end >= other else -nudge,
                           font=dict(color=INK, size=12))
    fig = styled(fig, "Price, indexed to 100")
    fig.update_layout(showlegend=True, hovermode="x unified", margin=dict(l=48, r=56, t=48, b=40))
    return fig


def spread_chart(z: pd.Series) -> go.Figure:
    fig = go.Figure()
    for level in (-2, 2):
        fig.add_hline(y=level, line=dict(color=AXIS, width=1, dash="dash"))
    fig.add_hline(y=0, line=dict(color=AXIS, width=1))
    fig.add_scatter(x=z.index, y=z, mode="lines", line=dict(color=SERIES_A, width=2),
                    hovertemplate="%{x|%b %d, %Y}<br>z = %{y:.2f}<extra></extra>")
    fig = styled(fig, "Spread z-score (dashed: ±2σ)")
    fig.update_layout(hovermode="x")
    return fig


def rolling_chart(rolling: pd.Series, full: float) -> go.Figure:
    fig = go.Figure()
    fig.add_hline(y=full, line=dict(color=AXIS, width=1, dash="dash"))
    fig.add_scatter(x=rolling.index, y=rolling, mode="lines", line=dict(color=SERIES_A, width=2),
                    hovertemplate="%{x|%b %d, %Y}<br>ρ = %{y:.2f}<extra></extra>")
    fig = styled(fig, f"{ROLLING_DAYS}-day rolling correlation (dashed: full window)")
    fig.update_layout(hovermode="x")
    fig.update_yaxes(range=[max(-1.0, min(rolling.min(), full) - 0.1), 1])
    return fig


def returns_chart(rets: pd.DataFrame, name_a: str, name_b: str) -> go.Figure:
    pct = rets * 100
    slope, intercept = np.polyfit(pct["b"], pct["a"], 1)
    x = np.array([pct["b"].min(), pct["b"].max()])
    fig = go.Figure()
    fig.add_scatter(x=pct["b"], y=pct["a"], mode="markers",
                    marker=dict(color=SERIES_A, size=8, opacity=0.45,
                                line=dict(color=SURFACE, width=1)),
                    customdata=pct.index.strftime("%b %d, %Y"),
                    hovertemplate=(f"%{{customdata}}<br>{name_b} %{{x:.2f}}%<br>"
                                   f"{name_a} %{{y:.2f}}%<extra></extra>"))
    fig.add_scatter(x=x, y=slope * x + intercept, mode="lines", hoverinfo="skip",
                    line=dict(color=INK_2, width=1.5))
    fig = styled(fig, "Daily returns (%)")
    fig.update_xaxes(title=dict(text=name_b, font=dict(color=MUTED)), showspikes=False,
                     zeroline=True, zerolinecolor=GRID)
    fig.update_yaxes(title=dict(text=name_a, font=dict(color=MUTED)), zeroline=True,
                     zerolinecolor=GRID)
    return fig


def sector_chart(pairs: pd.DataFrame) -> go.Figure:
    label = np.where(pairs["same_sector"], pairs["sector_a"], "Cross-sector")
    counts = pd.Series(label).value_counts().sort_values()
    fig = go.Figure(go.Bar(
        x=counts.values, y=counts.index, orientation="h",
        marker=dict(color=SERIES_A, cornerradius=4, line=dict(color=SURFACE, width=2)),
        text=counts.values, textposition="outside", textfont=dict(color=INK_2),
        hovertemplate="%{y}: %{x} pairs<extra></extra>",
    ))
    fig = styled(fig, f"Top {len(pairs)} pairs by sector", height=max(240, 40 * len(counts) + 80))
    fig.update_xaxes(showgrid=False, showticklabels=False, showspikes=False)
    fig.update_yaxes(showgrid=False, tickfont=dict(color=INK_2))
    return fig


def distribution_chart(hist: pd.DataFrame, cutoff: float) -> go.Figure:
    fig = go.Figure(go.Bar(
        x=(hist["lo"] + hist["hi"]) / 2, y=hist["count"], width=0.018,
        marker=dict(color=SERIES_A, cornerradius=2),
        customdata=hist[["lo", "hi"]],
        hovertemplate="ρ %{customdata[0]:.2f} to %{customdata[1]:.2f}: %{y:,} pairs<extra></extra>",
    ))
    fig.add_vline(x=cutoff, line=dict(color=INK_2, width=1, dash="dash"))
    fig.add_annotation(x=cutoff, y=1, yref="paper", text=f"Top {TOP_N} start at {cutoff:.2f}",
                       showarrow=False, xanchor="right", xshift=-6, font=dict(color=INK_2))
    fig = styled(fig, "Correlation of every pair screened", height=320)
    fig.update_xaxes(title=dict(text="Correlation of daily returns", font=dict(color=MUTED)),
                     showspikes=False)
    return fig


# ---------------------------------------------------------------- views

def pair_detail(prices: pd.DataFrame, meta: pd.DataFrame, ticker_a: str, ticker_b: str) -> None:
    a, b = prices[ticker_a], prices[ticker_b]
    stats = pair_stats(a, b)

    st.markdown(f"#### {ticker_a} · {meta.at[ticker_a, 'name']}  vs  "
                f"{ticker_b} · {meta.at[ticker_b, 'name']}")
    if stats["correlation"] >= REVIEW_THRESHOLD:
        st.warning("Correlation is at or above 0.97. These are usually the same company under "
                   "two IDs or a pegged merger, not a real pair. Check by hand.")

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Correlation", f"{stats['correlation']:.3f}",
              help="Pearson correlation of daily log returns over the window.")
    c2.metric("Hedge ratio", f"{stats['hedge']:.2f}",
              help=f"Units of log {ticker_b} per unit of log {ticker_a} (OLS of log prices).")
    c3.metric("Spread z-score now", f"{stats['z'].iloc[-1]:+.2f}",
              help="How far today's spread is from its window average, in standard deviations.")
    hl = stats["half_life"]
    c4.metric("Half-life", f"{hl:.0f} days" if np.isfinite(hl) and hl < 1000 else "None",
              help="Days for a spread gap to halve, from an AR(1) fit. 'None' means the "
                   "spread isn't mean-reverting over this window.")

    left, right = st.columns(2)
    with left:
        show(price_chart(a, b))
        show(rolling_chart(stats["rolling"], stats["correlation"]))
    with right:
        show(spread_chart(stats["z"]))
        show(returns_chart(stats["rets"], ticker_a, ticker_b))
    st.caption("Spread = log A − hedge ratio × log B; z-score and half-life are fitted over the "
               "same window, so they describe the past, not a forecast. Correlation alone doesn't "
               "show the spread will close; check cointegration before trading.")


def pairs_table(pairs: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame({
        "Rank": pairs["rank"],
        "A": pairs["ticker_a"],
        "B": pairs["ticker_b"],
        "Correlation": pairs["correlation"],
        "Company A": pairs["name_a"],
        "Company B": pairs["name_b"],
        "Sector": np.where(pairs["same_sector"], pairs["sector_a"],
                           pairs["sector_a"] + " / " + pairs["sector_b"]),
        "Same industry": pairs["same_industry"],
        "Review": np.where(pairs["review_flag"] != "", "≥ 0.97", ""),
    })


# ---------------------------------------------------------------- page

prices, meta = load_snapshot()

f1, f2, f3, f4, f5 = st.columns([1.3, 1.1, 2.2, 1.2, 1.1], vertical_alignment="bottom")
lookback = f1.segmented_control("Lookback", list(LOOKBACKS), default="2Y",
                                required=True)
min_cap = f2.selectbox("Market cap", list(MIN_CAPS))
sectors = f3.multiselect("Sectors", sorted(meta["sector"].unique()), placeholder="All sectors")
same_sector_only = f4.toggle("Same sector")
hide_flagged = f5.toggle("Hide ≥ 0.97", help="Hide pairs flagged as likely duplicates or "
                         "pegged mergers.")

result = screen(lookback, min_cap, tuple(sorted(sectors)), same_sector_only, hide_flagged)
pairs = result["pairs"]
data = window(prices, lookback)

k1, k2, k3, k4 = st.columns(4)
k1.metric("Companies screened", f"{result['n_companies']:,}")
k2.metric("Pairs compared", f"{result['n_pairs']:,}")
k3.metric("Prices through", f"{data.index[-1]:%b %d, %Y}",
          help=f"Window: {len(data) - 1} trading days from {data.index[0]:%b %d, %Y}.")
k4.metric(f"Top {TOP_N} cutoff", f"{pairs['correlation'].min():.3f}" if len(pairs) else "–",
          help=f"Lowest correlation in the current top {TOP_N}.")

if pairs.empty:
    st.info("No pairs match these filters. Try a lower market cap or more sectors.")
    st.stop()

tab_top, tab_lookup, tab_overview = st.tabs(["Top pairs", "Look up a pair", "Overview"])

with tab_top:
    st.caption("Click a row to chart that pair.")
    event = st.dataframe(
        pairs_table(pairs), hide_index=True, height=380, width="stretch",
        on_select="rerun", selection_mode="single-row", key="pairs_table",
        column_config={
            "Rank": st.column_config.NumberColumn(width="small"),
            "A": st.column_config.TextColumn(width="small"),
            "B": st.column_config.TextColumn(width="small"),
            "Correlation": st.column_config.ProgressColumn(
                format="%.3f", min_value=0.0, max_value=1.0, width="medium"),
            "Same industry": st.column_config.CheckboxColumn(width="small"),
        },
    )
    rows = event.selection.rows
    row = pairs.iloc[rows[0] if rows and rows[0] < len(pairs) else 0]
    pair_detail(data, meta, row["ticker_a"], row["ticker_b"])

with tab_lookup:
    options = meta.sort_values("market_cap", ascending=False).index.tolist()
    label = lambda t: f"{t} · {meta.at[t, 'name']}"
    l1, l2 = st.columns(2)
    ticker_a = l1.selectbox("Stock A", options, index=options.index("KO") if "KO" in options
                            else 0, format_func=label)
    ticker_b = l2.selectbox("Stock B", options, index=options.index("PEP") if "PEP" in options
                            else 1, format_func=label)
    if ticker_a == ticker_b:
        st.info("Pick two different stocks.")
    else:
        pair_detail(data, meta, ticker_a, ticker_b)

with tab_overview:
    o1, o2 = st.columns(2)
    with o1:
        show(distribution_chart(result["hist"], pairs["correlation"].min()))
    with o2:
        show(sector_chart(pairs))
    st.caption("High correlation mostly reflects shared industry exposure, so most top pairs "
               "sit in the same sector (regional banks especially). Share classes of one "
               "company are collapsed before correlating.")

st.caption("NYSE and NASDAQ common stocks, adjusted "
           "daily closes from Yahoo Finance. Candidates for research, not trade recommendations.")
