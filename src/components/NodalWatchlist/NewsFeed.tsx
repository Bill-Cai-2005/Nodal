import { useEffect, useState } from "react";
import {
  fetchNewsFeed,
  getLoadedNewsFeed,
  type NewsFeedResponse,
} from "../../utils/newsFeedApi";
import {
  compactActionButtonStyle,
  refreshWatchlistsToolbarStyle,
} from "./watchlistButtonStyles";

const descriptionStyle = {
  maxWidth: "720px",
  margin: "0 auto 1.5rem",
  textAlign: "center" as const,
  color: "#4b5563",
  fontSize: "1rem",
  lineHeight: 1.6,
};

const cardStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  backgroundColor: "#ffffff",
  overflow: "hidden",
};

const messageStyle = {
  padding: "3rem 1.5rem",
  textAlign: "center" as const,
  color: "#4b5563",
  fontSize: "0.95rem",
};

const mutedTextStyle = { color: "#6b7280", fontSize: "0.875rem" };

const chipStyle = {
  padding: "0.1rem 0.5rem",
  borderRadius: "9999px",
  border: "1px solid #e2e8f0",
  backgroundColor: "#f8fafc",
  color: "#374151",
  fontSize: "0.75rem",
  fontWeight: 600,
};

// Same format as TickerNews, e.g. "Nov 3, 4:05 PM ET".
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

// "Updated 4 min ago", measured from the server news job's last successful read of Massive.
const formatUpdated = (fetchedAt: string, now: number) => {
  const minutes = Math.floor((now - new Date(fetchedAt).getTime()) / 60000);
  if (Number.isNaN(minutes)) return "";
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes} min ago`;
  return `Updated ${Math.floor(minutes / 60)} hr ago`;
};

// News tab on the Resources page: the latest material news across all of our tickers.
const NewsFeed = () => {
  const [feed, setFeed] = useState<NewsFeedResponse | undefined>(() =>
    getLoadedNewsFeed(),
  );
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      setFeed(await fetchNewsFeed());
      setNow(Date.now());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!getLoadedNewsFeed()) void load();
  }, []);

  // Keeps "Updated X min ago" current while the tab stays open.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Re-checks the feed every 5 minutes while the News tab is open and the browser tab is in view.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5 * 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const days = feed?.days ?? 3;

  return (
    <div>
      <p style={descriptionStyle}>
        Material news from the last {days} days across the companies we
        follow, newest first. Each headline lists the tickers it affects.
      </p>

      <div style={refreshWatchlistsToolbarStyle}>
        <span style={mutedTextStyle}>
          {failed && feed
            ? "Couldn't refresh right now."
            : feed
              ? `${feed.items.length} stories · ${formatUpdated(feed.fetched_at, now)}`
              : ""}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          style={{
            ...compactActionButtonStyle,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div style={cardStyle}>
        {!feed ? (
          <div style={messageStyle}>
            {failed ? "Couldn't load news right now." : "Loading latest news…"}
          </div>
        ) : feed.items.length === 0 ? (
          <div style={messageStyle}>
            No major news in the last {days} days
          </div>
        ) : (
          feed.items.map((item, index) => {
            const hasLink = /^https?:\/\//i.test(item.url);
            const events = [...new Set(item.tickers.map((t) => t.event))];
            return (
              <div
                key={`${index}-${item.url}`}
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  alignItems: "baseline",
                  flexWrap: "wrap",
                  padding: "1rem 1.25rem",
                  borderTop: index === 0 ? "none" : "1px solid #e2e8f0",
                }}
              >
                <span
                  style={{
                    width: "11rem",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    lineHeight: 1.4,
                  }}
                >
                  {events.join(" · ")}
                </span>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  {hasLink ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "#111827",
                        fontWeight: 500,
                        textDecoration: "underline",
                        textUnderlineOffset: "2px",
                      }}
                    >
                      {item.title} ↗
                    </a>
                  ) : (
                    <span style={{ color: "#111827", fontWeight: 500 }}>
                      {item.title}
                    </span>
                  )}
                  <div
                    style={{
                      display: "flex",
                      gap: "0.375rem",
                      alignItems: "center",
                      flexWrap: "wrap",
                      marginTop: "0.375rem",
                    }}
                  >
                    {item.tickers.map(({ ticker }) => (
                      <span key={ticker} style={chipStyle}>
                        {ticker}
                      </span>
                    ))}
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "#6b7280",
                        marginLeft: "0.25rem",
                      }}
                    >
                      {item.publisher} · {formatEasternTime(item.published_utc)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default NewsFeed;
