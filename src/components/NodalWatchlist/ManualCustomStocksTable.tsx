import type { StockData } from "../../utils/polygonApi";
import { parseStockDescriptionRichText } from "../../utils/stockDescriptionRichText";

const simpleTableStyles = {
  wrapper: { overflowX: "auto" as const },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
  },
  headerRow: { backgroundColor: "#f8f8f8" },
  th: {
    padding: "0.75rem 1rem",
    textAlign: "left" as const,
    borderBottom: "2px solid #e2e8f0",
    fontWeight: 600,
    fontSize: "0.875rem",
  },
  tr: { borderBottom: "1px solid #e2e8f0" },
  td: { padding: "0.65rem 1rem" },
  expandedCell: {
    padding: "0.75rem",
    background: "#f9fafb",
    borderBottom: "1px solid #e2e8f0",
  },
  editableText: {
    color: "#374151",
    whiteSpace: "nowrap" as const,
    cursor: "text" as const,
    display: "inline-block",
    minWidth: "120px",
  },
  input: {
    width: "100%",
    minWidth: "140px",
    padding: "0.35rem 0.5rem",
    borderRadius: "4px",
    border: "1px solid #d1d5db",
  },
  secondaryButton: {
    padding: "0.5rem 0.8rem",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    cursor: "pointer",
  },
};

export type ManualCustomStocksTableProps = {
  watchlistName: string;
  manualRows: StockData[];
  isAdmin: boolean;
  formatValue: (value: number | null) => string;
  stockDescriptionsByWatchlist: Record<string, Record<string, string>>;
  stockSubcategoriesByWatchlist: Record<string, Record<string, string>>;
  expandedStockByWatchlist: Record<string, Record<string, boolean>>;
  editingStockByWatchlist: Record<string, Record<string, boolean>>;
  stockDescriptionDraftByWatchlist: Record<string, Record<string, string>>;
  editingStockSubcategoryByWatchlist: Record<string, Record<string, boolean>>;
  stockSubcategoryDraftByWatchlist: Record<string, Record<string, string>>;
  onToggleExpand: (watchlistName: string, ticker: string) => void;
  onStartEditDescription: (watchlistName: string, ticker: string) => void;
  onCancelEditDescription: (watchlistName: string, ticker: string) => void;
  onDraftDescriptionChange: (
    watchlistName: string,
    ticker: string,
    value: string,
  ) => void;
  onSaveDescription: (
    watchlistName: string,
    ticker: string,
    value: string,
  ) => void;
  onStartEditSubcategory: (watchlistName: string, ticker: string) => void;
  onCancelEditSubcategory: (watchlistName: string, ticker: string) => void;
  onDraftSubcategoryChange: (
    watchlistName: string,
    ticker: string,
    value: string,
  ) => void;
  onSaveSubcategory: (
    watchlistName: string,
    ticker: string,
    value: string,
  ) => void;
};

const ManualCustomStocksTable = ({
  watchlistName,
  manualRows,
  isAdmin,
  formatValue,
  stockDescriptionsByWatchlist,
  stockSubcategoriesByWatchlist,
  expandedStockByWatchlist,
  editingStockByWatchlist,
  stockDescriptionDraftByWatchlist,
  editingStockSubcategoryByWatchlist,
  stockSubcategoryDraftByWatchlist,
  onToggleExpand,
  onStartEditDescription,
  onCancelEditDescription,
  onDraftDescriptionChange,
  onSaveDescription,
  onStartEditSubcategory,
  onCancelEditSubcategory,
  onDraftSubcategoryChange,
  onSaveSubcategory,
}: ManualCustomStocksTableProps) => {
  if (manualRows.length === 0) return null;

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <div
        style={{
          fontSize: "0.85rem",
          fontWeight: 700,
          color: "#111827",
          marginBottom: "0.4rem",
        }}
      >
        International Stocks
      </div>
      <div style={simpleTableStyles.wrapper}>
        <table style={simpleTableStyles.table}>
          <thead>
            <tr style={simpleTableStyles.headerRow}>
              <th style={simpleTableStyles.th}>Ticker</th>
              <th style={simpleTableStyles.th}>Subcategory</th>
              <th style={simpleTableStyles.th}>Market Cap</th>
            </tr>
          </thead>
          <tbody>
            {manualRows.map((row, idx) => {
              const ticker = row.Ticker;
              const isExpanded =
                expandedStockByWatchlist[watchlistName]?.[ticker] ?? false;

              const isEditingDescription =
                editingStockByWatchlist[watchlistName]?.[ticker] ?? false;
              const liveDescription =
                stockDescriptionsByWatchlist[watchlistName]?.[ticker] || "";
              const draftDescription =
                stockDescriptionDraftByWatchlist[watchlistName]?.[ticker] ??
                liveDescription;

              const liveSubcategory =
                stockSubcategoriesByWatchlist[watchlistName]?.[ticker] || "";
              const isEditingSubcategory =
                editingStockSubcategoryByWatchlist[watchlistName]?.[ticker] ??
                false;
              const draftSubcategory =
                stockSubcategoryDraftByWatchlist[watchlistName]?.[ticker] ??
                liveSubcategory;

              return (
                <>
                  <tr
                    key={`${watchlistName}-manual-row-${ticker}-${idx}`}
                    onClick={() => onToggleExpand(watchlistName, ticker)}
                    style={{ ...simpleTableStyles.tr, cursor: "pointer" }}
                  >
                    <td style={simpleTableStyles.td}>{ticker}</td>
                    <td style={simpleTableStyles.td}>
                      {!isAdmin ? (
                        <span
                          style={{ color: "#374151", whiteSpace: "nowrap" }}
                        >
                          {(liveSubcategory || "").trim() || "—"}
                        </span>
                      ) : !isEditingSubcategory ? (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartEditSubcategory(watchlistName, ticker);
                          }}
                          style={simpleTableStyles.editableText}
                          title="Click to edit"
                        >
                          {(liveSubcategory || "").trim() || "—"}
                        </span>
                      ) : (
                        <input
                          type="text"
                          value={draftSubcategory}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            onDraftSubcategoryChange(
                              watchlistName,
                              ticker,
                              e.target.value,
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.preventDefault();
                              onCancelEditSubcategory(watchlistName, ticker);
                            }
                            if (e.key === "Enter") {
                              e.preventDefault();
                              onSaveSubcategory(
                                watchlistName,
                                ticker,
                                draftSubcategory,
                              );
                            }
                          }}
                          onBlur={() =>
                            onSaveSubcategory(
                              watchlistName,
                              ticker,
                              draftSubcategory,
                            )
                          }
                          autoFocus
                          style={simpleTableStyles.input}
                        />
                      )}
                    </td>
                    <td style={simpleTableStyles.td}>
                      {formatValue(row["Market Cap"])}
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr
                      key={`${watchlistName}-manual-row-expanded-${ticker}-${idx}`}
                    >
                      <td
                        colSpan={3}
                        style={simpleTableStyles.expandedCell}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {!isEditingDescription ? (
                          <div
                            style={{
                              display: "flex",
                              gap: "0.5rem",
                              alignItems: "center",
                              justifyContent: "space-between",
                              flexWrap: "wrap",
                            }}
                          >
                            <div
                              style={{
                                color: "#374151",
                                whiteSpace: "pre-wrap",
                                flex: 1,
                              }}
                            >
                              {liveDescription
                                ? parseStockDescriptionRichText(liveDescription)
                                : "No description"}
                            </div>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() =>
                                  onStartEditDescription(watchlistName, ticker)
                                }
                                style={simpleTableStyles.secondaryButton}
                              >
                                {liveDescription
                                  ? "Edit Description"
                                  : "Add Description"}
                              </button>
                            )}
                          </div>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.5rem",
                              width: "100%",
                            }}
                          >
                            <textarea
                              value={draftDescription}
                              onChange={(e) =>
                                onDraftDescriptionChange(
                                  watchlistName,
                                  ticker,
                                  e.target.value,
                                )
                              }
                              onInput={(e) => {
                                const target = e.currentTarget;
                                target.style.height = "auto";
                                target.style.height = `${target.scrollHeight}px`;
                              }}
                              rows={3}
                              style={{
                                width: "100%",
                                minHeight: "84px",
                                padding: "0.6rem",
                                borderRadius: "6px",
                                border: "1px solid #d1d5db",
                                resize: "vertical",
                              }}
                            />
                            <div
                              style={{ fontSize: "0.75rem", color: "#6b7280" }}
                            >
                              Wrap text in <strong>**double asterisks**</strong>{" "}
                              to bold it in the saved description.
                            </div>
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              <button
                                type="button"
                                onClick={() =>
                                  onSaveDescription(
                                    watchlistName,
                                    ticker,
                                    draftDescription,
                                  )
                                }
                                style={{
                                  padding: "0.5rem 0.8rem",
                                  borderRadius: "6px",
                                  border: "none",
                                  background: "#000000",
                                  color: "#ffffff",
                                  cursor: "pointer",
                                }}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  onCancelEditDescription(watchlistName, ticker)
                                }
                                style={{
                                  padding: "0.5rem 0.8rem",
                                  borderRadius: "6px",
                                  border: "none",
                                  background: "#6b7280",
                                  color: "#ffffff",
                                  cursor: "pointer",
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ManualCustomStocksTable;
