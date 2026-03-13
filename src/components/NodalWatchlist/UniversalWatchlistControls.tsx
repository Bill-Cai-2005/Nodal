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
  onRefresh,
}: Props) => {
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
            onClick={onRefresh}
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
          <input
            type="number"
            value={minMarketCap}
            onChange={(e) => setMinMarketCap(parseInt(e.target.value) || 0)}
            style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc", width: "100px" }}
          />
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
