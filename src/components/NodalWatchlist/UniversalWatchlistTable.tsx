import type { StockData } from "../../utils/polygonApi";

type Props = {
  loading: boolean;
  displayData: StockData[];
  useCustomRange: boolean;
  sortColumn: string;
  setSortColumn: (value: string) => void;
  sortAscending: boolean;
  setSortAscending: (value: boolean) => void;
  formatValue: (value: number | null) => string;
  onRowClick: (ticker: string) => void;
  selectedTicker: string | null;
};

const UniversalWatchlistTable = ({
  loading,
  displayData,
  useCustomRange,
  sortColumn,
  setSortColumn,
  sortAscending,
  setSortAscending,
  formatValue,
  onRowClick,
  selectedTicker,
}: Props) => {
  const formatVolume = (value: number | null): string => {
    if (value === null) return "N/A";
    return Math.round(value).toLocaleString();
  };

  const columns = [
    "Ticker",
    "Starting Price",
    "Current Price",
    "Market Cap",
    "Daily Stock Change %",
    ...(useCustomRange ? ["Custom Dates Change %"] : []),
    "Volume",
  ];

  return (
    displayData.length > 0 ? (
      <div
        style={{
          overflowX: "auto",
          overflowY: "auto",
          maxHeight: "70vh",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          backgroundColor: "#ffffff",
          marginBottom: "1rem",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            backgroundColor: "#ffffff",
          }}
        >
          <thead>
            <tr style={{ backgroundColor: "#f8f8f8" }}>
              {columns.map((col) => (
                <th
                  key={col}
                  style={{
                    padding: "1rem",
                    textAlign: "left",
                    borderBottom: "2px solid #e2e8f0",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    position: "sticky",
                    top: 0,
                    backgroundColor: "#f8f8f8",
                    zIndex: 1,
                  }}
                  onClick={() => {
                    if (sortColumn === col) {
                      setSortAscending(!sortAscending);
                    } else {
                      setSortColumn(col);
                      setSortAscending(true);
                    }
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayData.map((row) => (
              <tr
                key={row.Ticker}
                onClick={() => onRowClick(row.Ticker)}
                title={`Generate AI summary for ${row.Ticker}`}
                style={{
                  borderBottom: "1px solid #e2e8f0",
                  cursor: "pointer",
                  backgroundColor: selectedTicker === row.Ticker ? "#f0f9ff" : "#ffffff",
                }}
              >
                <td style={{ padding: "0.75rem" }}>{row.Ticker}</td>
                <td style={{ padding: "0.75rem" }}>{formatValue(row["Starting Price"])}</td>
                <td style={{ padding: "0.75rem" }}>{formatValue(row["Current Price"])}</td>
                <td style={{ padding: "0.75rem" }}>{formatValue(row["Market Cap"])}</td>
                <td style={{ padding: "0.75rem", color: (row["Daily Stock Change %"] || 0) >= 0 ? "#008000" : "#dc2626" }}>
                  {row["Daily Stock Change %"] !== null ? `${row["Daily Stock Change %"].toFixed(2)}%` : "N/A"}
                </td>
                {useCustomRange && (
                  <td
                    style={{
                      padding: "0.75rem",
                      color: (row["Custom Dates Change %"] || 0) >= 0 ? "#008000" : "#dc2626",
                    }}
                  >
                    {row["Custom Dates Change %"] !== null
                      ? `${row["Custom Dates Change %"].toFixed(2)}%`
                      : "N/A"}
                  </td>
                )}
                <td style={{ padding: "0.75rem" }}>{formatVolume(row.Volume)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div style={{ padding: "2rem", textAlign: "center", color: "#666666" }}>
        {loading ? "Loading..." : "No data available. Fetch tickers and refresh to load data."}
      </div>
    )
  );
};

export default UniversalWatchlistTable;
