import { Fragment } from "react";
import type { StockData } from "../../utils/polygonApi";
import { parseStockDescriptionRichText } from "../../utils/stockDescriptionRichText";

type Props = {
  data: StockData[];
  formatValue: (value: number | null) => string;
  isAdmin?: boolean;
  showCustomDatesChange?: boolean;
  sortColumn?: string;
  setSortColumn?: (value: string) => void;
  sortAscending?: boolean;
  setSortAscending?: (value: boolean) => void;
  expandedByTicker?: Record<string, boolean>;
  editingByTicker?: Record<string, boolean>;
  draftDescriptionByTicker?: Record<string, string>;
  onToggleTickerExpand?: (ticker: string) => void;
  onStartEditDescription?: (ticker: string) => void;
  onCancelEditDescription?: (ticker: string) => void;
  onDraftDescriptionChange?: (ticker: string, value: string) => void;
  onSaveDescription?: (ticker: string, value: string) => void;
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
  expandedByTicker = {},
  editingByTicker = {},
  draftDescriptionByTicker = {},
  onToggleTickerExpand,
  onStartEditDescription,
  onCancelEditDescription,
  onDraftDescriptionChange,
  onSaveDescription,
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
    "Starting Price",
    "Current Price",
    "Market Cap",
    "Daily Stock Change %",
    ...(showCustomDatesChange ? ["Custom Dates Change %"] : []),
    "Volume",
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
          {sortedData.map((row, idx) => {
            const ticker = row.Ticker;
            const isExpanded = expandedByTicker[ticker] ?? false;
            const isEditing = editingByTicker[ticker] ?? false;
            const liveDescription = (row as any).Description || "";
            const draftDescription = draftDescriptionByTicker[ticker] ?? liveDescription;
            return (
              <Fragment key={`${ticker}-${idx}`}>
                <tr
                  style={{ borderBottom: "1px solid #e2e8f0", cursor: "pointer" }}
                  onClick={() => onToggleTickerExpand?.(ticker)}
                >
                  <td style={{ padding: "0.75rem" }}>{row.Ticker}</td>
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
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={columns.length} style={{ padding: "0.75rem", background: "#f9fafb", borderBottom: "1px solid #e2e8f0" }}>
                      {!isEditing ? (
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                          <div style={{ color: "#374151", whiteSpace: "pre-wrap", flex: 1 }}>
                            {liveDescription ? parseStockDescriptionRichText(liveDescription) : "No description"}
                          </div>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => onStartEditDescription?.(ticker)}
                              style={{ padding: "0.5rem 0.8rem", borderRadius: "6px", border: "1px solid #d1d5db", background: "#ffffff", cursor: "pointer" }}
                            >
                              {liveDescription ? "Edit Description" : "Add Description"}
                            </button>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%" }}>
                          <textarea
                            value={draftDescription}
                            onChange={(e) => onDraftDescriptionChange?.(ticker, e.target.value)}
                            onInput={(e) => {
                              const target = e.currentTarget;
                              target.style.height = "auto";
                              target.style.height = `${target.scrollHeight}px`;
                            }}
                            rows={3}
                            style={{ width: "100%", minHeight: "84px", padding: "0.6rem", borderRadius: "6px", border: "1px solid #d1d5db", resize: "vertical" }}
                          />
                          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                            Wrap text in <strong>**double asterisks**</strong> to bold it in the saved description.
                          </div>
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button
                              type="button"
                              onClick={() => onSaveDescription?.(ticker, draftDescription)}
                              style={{ padding: "0.5rem 0.8rem", borderRadius: "6px", border: "none", background: "#000000", color: "#ffffff", cursor: "pointer" }}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => onCancelEditDescription?.(ticker)}
                              style={{ padding: "0.5rem 0.8rem", borderRadius: "6px", border: "none", background: "#6b7280", color: "#ffffff", cursor: "pointer" }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default CustomWatchlistsTable;

