import { useState } from "react";

/**
 * Pair Screener tab: embeds the Streamlit app in /pythonscreening (app.py).
 * Set VITE_PAIR_SCREENER_URL to the deployed app's URL; in local dev it defaults
 * to `streamlit run app.py` on http://localhost:8501.
 */
const getPairScreenerUrl = (): string => {
  const base =
    import.meta.env.VITE_PAIR_SCREENER_URL ||
    (import.meta.env.DEV ? "http://localhost:8501" : "");
  if (!base) return "";
  const url = new URL(base);
  url.searchParams.set("embed", "true"); // hides Streamlit's own header and menu
  return url.toString();
};

export const PAIR_SCREENER_DESCRIPTION =
  "Stock pairs whose daily moves track each other most closely, across every NYSE and NASDAQ company over $1B. Candidates for pair trades, not recommendations.";

const descriptionStyle = {
  maxWidth: "720px",
  margin: "0 auto 1.5rem",
  textAlign: "center" as const,
  color: "#4b5563",
  fontSize: "1rem",
  lineHeight: 1.6,
};

const cardStyle = {
  position: "relative" as const,
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

const PairScreener = () => {
  const [loaded, setLoaded] = useState(false);
  const src = getPairScreenerUrl();
  // Streamlit stacks its columns on narrow screens, so the app gets much taller there.
  const isNarrow = window.matchMedia("(max-width: 768px)").matches;

  return (
    <div>
      <p style={descriptionStyle}>{PAIR_SCREENER_DESCRIPTION}</p>
      <div style={cardStyle}>
        {!src ? (
          <div style={messageStyle}>
            The pair screener isn't configured yet. Set VITE_PAIR_SCREENER_URL to
            the deployed Streamlit app.
          </div>
        ) : (
          <>
            {!loaded && (
              <div style={{ ...messageStyle, position: "absolute", inset: 0 }}>
                Loading the screener… this can take up to a minute if the app
                has been idle.
              </div>
            )}
            <iframe
              src={src}
              title="Pair Screener"
              onLoad={() => setLoaded(true)}
              style={{
                display: "block",
                width: "100%",
                height: isNarrow ? "3600px" : "1750px",
                border: "none",
                opacity: loaded ? 1 : 0,
                transition: "opacity 0.2s ease",
              }}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default PairScreener;
