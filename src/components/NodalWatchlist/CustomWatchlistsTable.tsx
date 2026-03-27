import type { StockData } from "../../utils/polygonApi";

type Props = {
  data: StockData[];
  formatValue: (value: number | null) => string;
  isAdmin?: boolean;
  showCustomDatesChange?: boolean;
  sortColumn?: string;
  setSortColumn?: (value: string) => void;
  sortAscending?: boolean;
  setSortAscending?: (value: boolean) => void;
};

const CustomWatchlistsTable = ({
  data,
  formatValue,
  isAdmin = true,
  showCustomDatesChange = true,
  sortColumn = "",
  setSortColumn,
  sortAscending = true,
  setSortAscending,
}: Props) => {
  if (data.length === 0) return null;
  const formatVolume = (value: number | null): string => {
    if (value === null) return "N/A";
    return Math.round(value).toLocaleString();
  };

  const sortedData = isAdmin
    ? [...data].sort((a, b) => {
        if (!sortColumn) return 0;
        const aVal = (a as any)[sortColumn];
        const bVal = (b as any)[sortColumn];
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortAscending ? comparison : -comparison;
      })
    : data;

  const columns = [
    "Ticker",
    "Description",
    "Starting Price",
    "Current Price",
    "Market Cap",
    "Daily Stock Change %",
    ...(showCustomDatesChange ? ["Custom Dates Change %"] : []),
    "Volume",
    "Industry",
  ];

  return (
    <div style={{ overflowX: "auto", marginBottom: "1rem" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
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
                  cursor: isAdmin ? "pointer" : "default",
                }}
                onClick={() => {
                  if (!isAdmin || !setSortColumn || !setSortAscending) return;
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
          {sortedData.map((row, idx) => (
            <tr key={idx} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: "0.75rem" }}>{row.Ticker}</td>
              <td style={{ padding: "0.75rem" }}>{(row as any).Description || ""}</td>
              <td style={{ padding: "0.75rem" }}>{formatValue(row["Starting Price"])}</td>
              <td style={{ padding: "0.75rem" }}>{formatValue(row["Current Price"])}</td>
              <td style={{ padding: "0.75rem" }}>{formatValue(row["Market Cap"])}</td>
              <td style={{ padding: "0.75rem", color: (row["Daily Stock Change %"] || 0) >= 0 ? "#008000" : "#dc2626" }}>
                {row["Daily Stock Change %"] !== null ? `${row["Daily Stock Change %"].toFixed(2)}%` : "N/A"}
              </td>
              {showCustomDatesChange && (
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
              <td style={{ padding: "0.75rem" }}>{row.Industry || "N/A"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CustomWatchlistsTable;

