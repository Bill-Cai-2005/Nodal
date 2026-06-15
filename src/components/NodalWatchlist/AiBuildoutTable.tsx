import { Fragment } from "react";
import type { StockData } from "../../utils/polygonApi";
import { parseStockDescriptionRichText } from "../../utils/stockDescriptionRichText";
import { toggleMarkdownBold } from "../../utils/markdownBoldToggle";
import {
  getTagPillStyle,
  isKeyTag,
  sortTagsWithKeysFirst,
} from "../../utils/tagUtils";

type RowData = StockData & {
  Description?: string;
  Tags?: string[];
  isManual?: boolean;
};

type Props = {
  data: RowData[];
  keyTags?: string[];
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
  editingTagsByTicker?: Record<string, boolean>;
  draftTagsByTicker?: Record<string, string>;
  onToggleTickerExpand?: (ticker: string) => void;
  onStartEditDescription?: (ticker: string) => void;
  onCancelEditDescription?: (ticker: string) => void;
  onDraftDescriptionChange?: (ticker: string, value: string) => void;
  onSaveDescription?: (ticker: string, value: string) => void;
  onStartEditTags?: (ticker: string) => void;
  onCancelEditTags?: (ticker: string) => void;
  onDraftTagsChange?: (ticker: string, value: string) => void;
  onSaveTags?: (ticker: string, tags: string[]) => void;
  onRemoveTicker?: (ticker: string) => void;
  isEditMode?: boolean;
};

const parseTagsInput = (raw: string): string[] =>
  raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

const AiBuildoutTable = ({
  data,
  keyTags = [],
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
  editingTagsByTicker = {},
  draftTagsByTicker = {},
  onToggleTickerExpand,
  onStartEditDescription,
  onCancelEditDescription,
  onDraftDescriptionChange,
  onSaveDescription,
  onStartEditTags,
  onCancelEditTags,
  onDraftTagsChange,
  onSaveTags,
  onRemoveTicker,
  isEditMode = false,
}: Props) => {
  if (data.length === 0) {
    return (
      <div
        style={{
          padding: "2rem",
          textAlign: "center",
          color: "#6b7280",
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
        }}
      >
        No stocks match the current filters.
      </div>
    );
  }

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
  ...(isEditMode ? [" "] : []),
    "Ticker",
    "Tags",
    "Starting Price",
    "Current Price",
    "Market Cap",
    "Daily Stock Change %",
    ...(showCustomDatesChange ? ["Custom Dates Change %"] : []),
    "Volume",
  ];

  const renderTags = (ticker: string, liveTags: string[]) => {
    const isEditingTags = editingTagsByTicker[ticker] ?? false;
    const draftTags = draftTagsByTicker[ticker] ?? liveTags.join(", ");
    const displayTags = sortTagsWithKeysFirst(liveTags, keyTags);

    const renderTagPill = (tag: string) => {
      const isKey = isKeyTag(keyTags, tag);
      return (
        <span key={`${ticker}-${tag}`} style={getTagPillStyle(isKey, false, true)}>
          {isKey ? `★ ${tag}` : tag}
        </span>
      );
    };

    if (!isAdmin) {
      return (
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
          {displayTags.length > 0 ? (
            displayTags.map((tag) => renderTagPill(tag))
          ) : (
            <span style={{ color: "#9ca3af" }}>—</span>
          )}
        </div>
      );
    }

    if (!isEditingTags) {
      return (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onStartEditTags?.(ticker);
          }}
          style={{
            display: "flex",
            gap: "0.35rem",
            flexWrap: "wrap",
            cursor: "text",
            minHeight: "24px",
          }}
          title="Click to edit tags"
        >
          {displayTags.length > 0 ? (
            displayTags.map((tag) => renderTagPill(tag))
          ) : (
            <span style={{ color: "#9ca3af" }}>Add tags</span>
          )}
        </div>
      );
    }

    return (
      <input
        type="text"
        value={draftTags}
        onChange={(e) => onDraftTagsChange?.(ticker, e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancelEditTags?.(ticker);
          }
          if (e.key === "Enter") {
            e.preventDefault();
            onSaveTags?.(ticker, parseTagsInput(draftTags));
          }
        }}
        onBlur={() => onSaveTags?.(ticker, parseTagsInput(draftTags))}
        placeholder="lithography, semis"
        autoFocus
        style={{
          width: "100%",
          minWidth: "160px",
          padding: "0.35rem 0.5rem",
          borderRadius: "4px",
          border: "1px solid #d1d5db",
          fontSize: "0.85rem",
        }}
      />
    );
  };

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
                  cursor:
                    isAdmin && col !== " " && col !== "Tags"
                      ? "pointer"
                      : "default",
                  width: col === " " ? "40px" : undefined,
                }}
                onClick={() => {
                  if (!isAdmin || !setSortColumn || !setSortAscending) return;
                  if (col === " " || col === "Tags") return;
                  if (sortColumn === col) {
                    setSortAscending(!sortAscending);
                  } else {
                    setSortColumn(col);
                    setSortAscending(true);
                  }
                }}
              >
                {col.trim() || ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, idx) => {
            const ticker = row.Ticker;
            const isExpanded = expandedByTicker[ticker] ?? false;
            const isEditing = editingByTicker[ticker] ?? false;
            const liveDescription = row.Description || "";
            const draftDescription =
              draftDescriptionByTicker[ticker] ?? liveDescription;
            const liveTags = row.Tags || [];

            return (
              <Fragment key={`${ticker}-${idx}`}>
                <tr
                  style={{
                    borderBottom: "1px solid #e2e8f0",
                    cursor: "pointer",
                  }}
                  onClick={() => onToggleTickerExpand?.(ticker)}
                >
                  {isEditMode && (
                    <td style={{ padding: "0.75rem" }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveTicker?.(ticker);
                        }}
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "9999px",
                          border: "1px solid #fecaca",
                          backgroundColor: "transparent",
                          color: "#b91c1c",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                        aria-label={`Remove ${ticker}`}
                      >
                        ×
                      </button>
                    </td>
                  )}
                  <td style={{ padding: "0.75rem" }}>
                    {ticker}
                    {row.isManual ? (
                      <span
                        style={{
                          marginLeft: "0.5rem",
                          fontSize: "0.7rem",
                          color: "#6b7280",
                        }}
                      >
                        intl
                      </span>
                    ) : null}
                  </td>
                  <td style={{ padding: "0.75rem", minWidth: "180px" }}>
                    {renderTags(ticker, liveTags)}
                  </td>
                  <td style={{ padding: "0.75rem" }}>
                    {row.isManual ? "—" : formatValue(row["Starting Price"])}
                  </td>
                  <td style={{ padding: "0.75rem" }}>
                    {row.isManual ? "—" : formatValue(row["Current Price"])}
                  </td>
                  <td style={{ padding: "0.75rem" }}>
                    {formatValue(row["Market Cap"])}
                  </td>
                  <td
                    style={{
                      padding: "0.75rem",
                      color:
                        (row["Daily Stock Change %"] || 0) >= 0
                          ? "#008000"
                          : "#dc2626",
                    }}
                  >
                    {row.isManual || row["Daily Stock Change %"] === null
                      ? "N/A"
                      : `${row["Daily Stock Change %"].toFixed(2)}%`}
                  </td>
                  {showCustomDatesChange && (
                    <td
                      style={{
                        padding: "0.75rem",
                        color:
                          (row["Custom Dates Change %"] || 0) >= 0
                            ? "#008000"
                            : "#dc2626",
                      }}
                    >
                      {row.isManual || row["Custom Dates Change %"] === null
                        ? "N/A"
                        : `${row["Custom Dates Change %"].toFixed(2)}%`}
                    </td>
                  )}
                  <td style={{ padding: "0.75rem" }}>
                    {row.isManual ? "—" : formatVolume(row.Volume)}
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      style={{
                        padding: "0.75rem",
                        background: "#f9fafb",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      {!isEditing ? (
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
                              onClick={() => onStartEditDescription?.(ticker)}
                              style={{
                                padding: "0.5rem 0.8rem",
                                borderRadius: "6px",
                                border: "1px solid #d1d5db",
                                background: "#ffffff",
                                cursor: "pointer",
                              }}
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
                              onDraftDescriptionChange?.(ticker, e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (!(e.ctrlKey || e.metaKey)) return;
                              if (e.key.toLowerCase() !== "b") return;
                              e.preventDefault();
                              const target = e.currentTarget;
                              const update = toggleMarkdownBold(
                                draftDescription,
                                target.selectionStart ?? 0,
                                target.selectionEnd ?? 0,
                              );
                              onDraftDescriptionChange?.(ticker, update.value);
                              requestAnimationFrame(() => {
                                target.setSelectionRange(
                                  update.selectionStart,
                                  update.selectionEnd,
                                );
                              });
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
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button
                              type="button"
                              onClick={() =>
                                onSaveDescription?.(ticker, draftDescription)
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
                              onClick={() => onCancelEditDescription?.(ticker)}
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
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default AiBuildoutTable;
