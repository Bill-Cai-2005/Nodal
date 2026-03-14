import { useEffect, useState } from "react";

type ProgressState = {
  current: number;
  total: number;
  message: string;
};

type Props = {
  loading: boolean;
  progress: ProgressState;
  useCustomRange: boolean;
  setUseCustomRange: (value: boolean) => void;
  customStart: Date;
  setCustomStart: (date: Date) => void;
  customEnd: Date;
  setCustomEnd: (date: Date) => void;
  minMarketCap: number;
  setMinMarketCap: (value: number) => void;
  onLoadTickers: () => void;
  onLoadLocallyStoredData: () => void;
  onRefresh: () => void;
};

const UniversalWatchlistControls = ({
  loading,
  progress,
  useCustomRange,
  setUseCustomRange,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
  minMarketCap,
  setMinMarketCap,
  onLoadTickers,
  onLoadLocallyStoredData,
  onRefresh,
}: Props) => {
  const [minMarketCapInput, setMinMarketCapInput] = useState(String(minMarketCap));

  useEffect(() => {
    setMinMarketCapInput(String(minMarketCap));
  }, [minMarketCap]);

  const commitMinMarketCap = () => {
    if (minMarketCapInput.trim() === "") {
      setMinMarketCap(0);
      setMinMarketCapInput("0");
      return;
    }
    const parsed = Math.max(0, parseInt(minMarketCapInput, 10) || 0);
    setMinMarketCap(parsed);
    setMinMarketCapInput(String(parsed));
  };

  const adjustMinMarketCap = (delta: number) => {
    const base = parseInt(minMarketCapInput, 10) || 0;
    const next = Math.max(0, base + delta);
    setMinMarketCapInput(String(next));
    setMinMarketCap(next);
  };

  return (
    <>
      <div style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button
            onClick={onLoadTickers}
          disabled={loading}
          style={{
            padding: "0.75rem 1.5rem",
            backgroundColor: "#000000",
            color: "#ffffff",
            border: "none",
            borderRadius: "6px",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: "0.875rem",
            fontWeight: 600,
            opacity: loading ? 0.6 : 1,
          }}
        >
            Load Tickers
        </button>
          <button
            onClick={onLoadLocallyStoredData}
            disabled={loading}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: "#000000",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "0.875rem",
              fontWeight: 600,
              opacity: loading ? 0.6 : 1,
            }}
          >
            Load Locally Stored Data
          </button>
            <button
            onClick={onRefresh}
          disabled={loading}
          style={{
            padding: "0.75rem 1.5rem",
            backgroundColor: "#8B0000",
            color: "#ffffff",
            border: "none",
            borderRadius: "6px",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: "0.875rem",
            fontWeight: 600,
            opacity: loading ? 0.6 : 1,
          }}
        >
            Refresh
        </button>
      </div>

        <div style={{ display: "flex", gap: "1rem", alignItems: "center", justifyContent: "center", flexWrap: "wrap", marginBottom: "1rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={useCustomRange}
              onChange={(e) => setUseCustomRange(e.target.checked)}
            />
            Use Custom Time Range
          </label>

          {useCustomRange && (
            <>
              <input
                type="date"
                value={customStart.toISOString().split("T")[0]}
                onChange={(e) => setCustomStart(new Date(e.target.value))}
                style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}
              />
              <input
                type="date"
                value={customEnd.toISOString().split("T")[0]}
                onChange={(e) => setCustomEnd(new Date(e.target.value))}
                style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}
              />
            </>
          )}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "center" }}>
          Min Market Cap (Millions USD):
          <button
            type="button"
            onClick={() => adjustMinMarketCap(-1)}
            disabled={loading}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "4px",
              border: "1px solid #9ca3af",
              backgroundColor: "#ffffff",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "1rem",
              lineHeight: 1,
            }}
          >
            -
          </button>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={minMarketCapInput}
            onChange={(e) => {
              const next = e.target.value;
              if (/^\d*$/.test(next)) {
                setMinMarketCapInput(next);
              }
            }}
            onBlur={commitMinMarketCap}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitMinMarketCap();
              }
            }}
            style={{
              padding: "0.5rem 0.6rem",
              borderRadius: "4px",
              border: "1px solid #ccc",
              width: "120px",
              fontSize: "1rem",
              textAlign: "center",
            }}
          />
          <button
            type="button"
            onClick={() => adjustMinMarketCap(1)}
            disabled={loading}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "4px",
              border: "1px solid #9ca3af",
              backgroundColor: "#ffffff",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "1rem",
              lineHeight: 1,
            }}
          >
            +
          </button>
        </label>
      </div>

      {progress.message && (
        <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "#f0f0f0", borderRadius: "4px" }}>
          {progress.message}
          {progress.total > 0 && ` (${progress.current}/${progress.total})`}
        </div>
      )}
    </>
  );
};

export default UniversalWatchlistControls;
