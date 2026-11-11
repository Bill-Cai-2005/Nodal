import { useEffect, useState } from "react";
import {
  fetchTickerNews,
  getLoadedTickerNews,
  type TickerNewsResponse,
} from "../../utils/newsApi";

type Props = {
  ticker: string;
};

const mutedTextStyle = { color: "#6b7280", fontSize: "0.875rem" };

const formatEasternTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const formatted = date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatted} ET`;
};

// Only when the server's news job has fallen behind (status "stale"); fresh news needs no note.
const staleNote = (news: TickerNewsResponse) => {
  if (news.status !== "stale") return "";
  if (!news.fetched_at || !news.filings_checked_at) return "News may be out of date";
  const oldest = Math.min(new Date(news.fetched_at).getTime(), new Date(news.filings_checked_at).getTime());
  const hours = Math.floor((Date.now() - oldest) / 3_600_000);
  return `News last updated ${hours < 48 ? `${hours} hr` : `${Math.floor(hours / 24)} days`} ago`;
};

// Latest material news for one ticker, shown inside an expanded watchlist row.
const TickerNews = ({ ticker }: Props) => {
  const [news, setNews] = useState<TickerNewsResponse | undefined>(() =>
    getLoadedTickerNews(ticker),
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (getLoadedTickerNews(ticker)) return;
    let cancelled = false;
    fetchTickerNews(ticker)
      .then((data) => {
        if (!cancelled) setNews(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const pick = news?.pick;
  const hasLink = pick ? /^https?:\/\//i.test(pick.url) : false;

  return (
    <div
      style={{
        marginTop: "0.75rem",
        paddingTop: "0.75rem",
        borderTop: "1px solid #e2e8f0",
      }}
    >
      {failed ? (
        <div style={mutedTextStyle}>Couldn't load news right now.</div>
      ) : !news ? (
        <div style={mutedTextStyle}>Loading latest news…</div>
      ) : news.status === "not_tracked" ? (
        <div style={mutedTextStyle}>News isn't collected for this ticker yet.</div>
      ) : !pick ? (
        <div style={mutedTextStyle}>No major news in the last 14 days</div>
      ) : (
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            alignItems: "baseline",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: "0.7rem",
              fontWeight: 600,
              color: "#6b7280",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              whiteSpace: "nowrap",
            }}
          >
            {pick.event}
          </span>
          <div style={{ flex: 1, minWidth: "200px" }}>
            {hasLink ? (
              <a
                href={pick.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "#111827",
                  fontWeight: 500,
                  textDecoration: "underline",
                  textUnderlineOffset: "2px",
                }}
              >
                {pick.title} ↗
              </a>
            ) : (
              <span style={{ color: "#111827", fontWeight: 500 }}>
                {pick.title}
              </span>
            )}
            <div
              style={{
                fontSize: "0.75rem",
                color: "#6b7280",
                marginTop: "0.25rem",
              }}
            >
              {pick.source === "sec" ? `SEC filing · ${pick.publisher}` : pick.publisher} ·{" "}
              {formatEasternTime(pick.published_utc)}
            </div>
          </div>
        </div>
      )}
      {news && staleNote(news) && (
        <div style={{ ...mutedTextStyle, fontSize: "0.75rem", marginTop: "0.25rem" }}>
          {staleNote(news)}
        </div>
      )}
    </div>
  );
};

export default TickerNews;
