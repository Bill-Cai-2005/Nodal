import { useMemo, useState, type DragEvent } from "react";
import type { StockData } from "../../utils/polygonApi";
import { parseStockDescriptionRichText } from "../../utils/stockDescriptionRichText";
import { toggleMarkdownBold } from "../../utils/markdownBoldToggle";
import CustomWatchlistsTable from "./CustomWatchlistsTable";
import ManualCustomStocksTable from "./ManualCustomStocksTable";

type Props = {
  watchlistName: string;
  isAdmin: boolean;
  isExpanded: boolean;
  isEditing: boolean;
  isBusy: boolean;
  isDragOver: boolean;
  isDragged: boolean;

  tickers: string[];
  currentData: StockData[];
  manualRows: StockData[];

  watchlistNameDraft: string;
  editingWatchlistName: boolean;

  watchlistDescription: string;
  watchlistDescriptionDraft: string;
  editingWatchlistDescription: boolean;

  newTicker: string;
  newManualTicker: string;
  newManualMarketCap: string;

  sortColumn: string;
  sortAscending: boolean;
  useCustomRange: boolean;

  formatValue: (value: number | null) => string;

  stockDescriptionsByWatchlist: Record<string, Record<string, string>>;
  stockSubcategoriesByWatchlist: Record<string, Record<string, string>>;
  expandedStockByWatchlist: Record<string, Record<string, boolean>>;
  editingStockByWatchlist: Record<string, Record<string, boolean>>;
  stockDescriptionDraftByWatchlist: Record<string, Record<string, string>>;
  editingStockSubcategoryByWatchlist: Record<string, Record<string, boolean>>;
  stockSubcategoryDraftByWatchlist: Record<string, Record<string, string>>;

  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;

  onToggleExpanded: () => void;
  onStartEditWatchlistName: () => void;
  onWatchlistNameDraftChange: (value: string) => void;
  onSaveWatchlistName: () => void;
  onToggleEditMode: () => void;
  onDeleteWatchlist: () => void;

  onCancelEditWatchlistDescription: () => void;
  onWatchlistDescriptionDraftChange: (value: string) => void;
  onSaveWatchlistDescription: () => void;

  onNewTickerChange: (value: string) => void;
  onAddTicker: () => void;

  onNewManualTickerChange: (value: string) => void;
  onNewManualMarketCapChange: (value: string) => void;
  onAddManualStock: () => void;

  onRemoveTicker: (ticker: string) => void;
  onRemoveManualStock: (ticker: string) => void;

  onSetSortColumn: (value: string) => void;
  onSetSortAscending: (value: boolean) => void;

  onToggleTickerExpand: (ticker: string) => void;
  onStartEditDescription: (ticker: string) => void;
  onCancelEditDescription: (ticker: string) => void;
  onDraftDescriptionChange: (ticker: string, value: string) => void;
  onSaveDescription: (ticker: string, value: string) => void;
  onStartEditSubcategory: (ticker: string) => void;
  onCancelEditSubcategory: (ticker: string) => void;
  onDraftSubcategoryChange: (ticker: string, value: string) => void;
  onSaveSubcategory: (ticker: string, value: string) => void;
};

const iconButtonBaseStyle = {
  width: "28px",
  height: "28px",
  backgroundColor: "transparent",
  borderRadius: "9999px",
  cursor: "pointer",
  fontWeight: 600,
  lineHeight: 1,
};

const WatchlistSection = ({
  watchlistName,
  isAdmin,
  isExpanded,
  isEditing,
  isBusy,
  isDragOver,
  isDragged,
  tickers,
  currentData,
  manualRows,
  watchlistNameDraft,
  editingWatchlistName,
  watchlistDescription,
  watchlistDescriptionDraft,
  editingWatchlistDescription,
  newTicker,
  newManualTicker,
  newManualMarketCap,
  sortColumn,
  sortAscending,
  useCustomRange,
  formatValue,
  stockDescriptionsByWatchlist,
  stockSubcategoriesByWatchlist,
  expandedStockByWatchlist,
  editingStockByWatchlist,
  stockDescriptionDraftByWatchlist,
  editingStockSubcategoryByWatchlist,
  stockSubcategoryDraftByWatchlist,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onToggleExpanded,
  onStartEditWatchlistName,
  onWatchlistNameDraftChange,
  onSaveWatchlistName,
  onToggleEditMode,
  onDeleteWatchlist,
  onCancelEditWatchlistDescription,
  onWatchlistDescriptionDraftChange,
  onSaveWatchlistDescription,
  onNewTickerChange,
  onAddTicker,
  onNewManualTickerChange,
  onNewManualMarketCapChange,
  onAddManualStock,
  onRemoveTicker,
  onRemoveManualStock,
  onSetSortColumn,
  onSetSortAscending,
  onToggleTickerExpand,
  onStartEditDescription,
  onCancelEditDescription,
  onDraftDescriptionChange,
  onSaveDescription,
  onStartEditSubcategory,
  onCancelEditSubcategory,
  onDraftSubcategoryChange,
  onSaveSubcategory,
}: Props) => {
  const [isWatchlistDescriptionExpanded, setIsWatchlistDescriptionExpanded] =
    useState(false);

  const trimmedWatchlistDescription = useMemo(
    () => (watchlistDescription || "").trim(),
    [watchlistDescription],
  );
  const shouldShowWatchlistDescriptionToggle = useMemo(() => {
    if (!trimmedWatchlistDescription) return false;
    if (trimmedWatchlistDescription.includes("\n")) return true;
    return trimmedWatchlistDescription.length > 160;
  }, [trimmedWatchlistDescription]);

  return (
    <div
      draggable={isAdmin}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{
        marginBottom: "1rem",
        border: isDragOver ? "2px dashed #111827" : "1px solid #e2e8f0",
        borderRadius: "8px",
        padding: "1rem",
        backgroundColor: "#ffffff",
        opacity: isDragged ? 0.65 : 1,
      }}
    >
      <div
        onClick={onToggleExpanded}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: isExpanded ? "1rem" : 0,
          gap: "0.75rem",
          flexWrap: "wrap",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          {isAdmin && editingWatchlistName ? (
            <input
              type="text"
              value={watchlistNameDraft}
              onChange={(e) => onWatchlistNameDraftChange(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSaveWatchlistName();
                }
              }}
              style={{
                padding: "0.35rem 0.5rem",
                borderRadius: "4px",
                border: "1px solid #ccc",
                minWidth: "220px",
              }}
            />
          ) : (
            <h2
              onClick={(e) => {
                if (!isAdmin) return;
                e.stopPropagation();
                onStartEditWatchlistName();
              }}
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontSize: "1.1rem",
                margin: 0,
              }}
            >
              {watchlistName}
            </h2>
          )}
        </div>

        {isAdmin && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleEditMode();
              }}
              disabled={isBusy}
              style={{
                ...iconButtonBaseStyle,
                color: isEditing ? "#047857" : "#374151",
                border: "1px solid #d1d5db",
                fontSize: "0.9rem",
                cursor: isBusy ? "not-allowed" : "pointer",
                opacity: isBusy ? 0.6 : 1,
              }}
              title={isEditing ? "Done editing" : "Edit watchlist"}
              aria-label={isEditing ? "Done editing" : "Edit watchlist"}
            >
              {isEditing ? "✓" : "✎"}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteWatchlist();
              }}
              disabled={isBusy}
              style={{
                ...iconButtonBaseStyle,
                color: "#b91c1c",
                border: "1px solid #fecaca",
                cursor: isBusy ? "not-allowed" : "pointer",
                fontSize: "1rem",
                opacity: isBusy ? 0.6 : 1,
              }}
              title="Delete watchlist"
              aria-label="Delete watchlist"
            >
              ×
            </button>
          </div>
        )}

        {!isExpanded ? null : (
          <div
            style={{
              width: "100%",
              marginTop: "0.5rem",
              display: "flex",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: "260px" }}>
              {!isAdmin || !editingWatchlistDescription ? (
                <div
                  style={{
                    color: "#374151",
                    whiteSpace: "pre-wrap",
                    flex: 1,
                    fontSize: "0.9rem",
                    cursor: "default",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: "0.4rem",
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        ...(isWatchlistDescriptionExpanded
                          ? {}
                          : {
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }),
                      }}
                    >
                      {trimmedWatchlistDescription
                        ? parseStockDescriptionRichText(trimmedWatchlistDescription)
                        : "No description"}
                    </div>

                    {shouldShowWatchlistDescriptionToggle && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsWatchlistDescriptionExpanded((prev) => !prev);
                        }}
                        style={{
                          padding: 0,
                          marginRight: "0.6rem",
                          border: "none",
                          background: "transparent",
                          color: "#6b7280",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          lineHeight: 1,
                          flexShrink: 0,
                        }}
                        aria-label={
                          isWatchlistDescriptionExpanded
                            ? "Collapse description"
                            : "Expand description"
                        }
                        title={
                          isWatchlistDescriptionExpanded
                            ? "Show less"
                            : "Show more"
                        }
                      >
                        {isWatchlistDescriptionExpanded
                          ? "Hide Subcategory Description"
                          : "Show Subcategory Description"}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div onClick={(e) => e.stopPropagation()}>
                  <textarea
                    value={watchlistDescriptionDraft}
                    onChange={(e) =>
                      onWatchlistDescriptionDraftChange(e.target.value)
                    }
                    onKeyDown={(e) => {
                      if (!(e.ctrlKey || e.metaKey)) return;
                      if (e.key.toLowerCase() !== "b") return;
                      e.preventDefault();

                      const target = e.currentTarget;
                      const update = toggleMarkdownBold(
                        watchlistDescriptionDraft,
                        target.selectionStart ?? 0,
                        target.selectionEnd ?? 0,
                      );

                      onWatchlistDescriptionDraftChange(update.value);
                      requestAnimationFrame(() => {
                        target.setSelectionRange(
                          update.selectionStart,
                          update.selectionEnd,
                        );
                      });
                    }}
                    onInput={(e) => {
                      const target = e.currentTarget;
                      target.style.height = "auto";
                      target.style.height = `${target.scrollHeight}px`;
                    }}
                    rows={2}
                    style={{
                      width: "100%",
                      minHeight: "64px",
                      padding: "0.6rem",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                      resize: "vertical",
                    }}
                  />
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#6b7280",
                      marginTop: "0.35rem",
                    }}
                  >
                    Wrap text in <strong>**double asterisks**</strong> to bold
                    it in the saved description.
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      marginTop: "0.5rem",
                    }}
                  >
                    <button
                      type="button"
                      onClick={onSaveWatchlistDescription}
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
                      onClick={onCancelEditWatchlistDescription}
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
            </div>
          </div>
        )}
      </div>

      {!isExpanded ? null : (
        <>
          {isAdmin && isEditing && (
            <div
              style={{
                marginBottom: "1rem",
                padding: "1rem",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                backgroundColor: "#fafafa",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  marginBottom: "0.75rem",
                  flexWrap: "wrap",
                }}
              >
                <input
                  type="text"
                  value={newTicker}
                  onChange={(e) =>
                    onNewTickerChange(e.target.value.toUpperCase())
                  }
                  placeholder="Add Ticker"
                  style={{
                    padding: "0.65rem",
                    borderRadius: "4px",
                    border: "1px solid #ccc",
                    width: "150px",
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onAddTicker();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={onAddTicker}
                  disabled={isBusy}
                  style={{
                    padding: "0.65rem 1rem",
                    backgroundColor: "#000000",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    cursor: isBusy ? "not-allowed" : "pointer",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    opacity: isBusy ? 0.6 : 1,
                  }}
                >
                  Add Ticker
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  marginBottom: "0.75rem",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <input
                  type="text"
                  value={newManualTicker}
                  onChange={(e) =>
                    onNewManualTickerChange(e.target.value.toUpperCase())
                  }
                  placeholder="Manual Global Ticker (e.g. KRX:005930)"
                  style={{
                    padding: "0.65rem",
                    borderRadius: "4px",
                    border: "1px solid #ccc",
                    width: "240px",
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onAddManualStock();
                    }
                  }}
                />
                <input
                  type="text"
                  value={newManualMarketCap}
                  onChange={(e) =>
                    onNewManualMarketCapChange(e.target.value.toUpperCase())
                  }
                  placeholder="Market Cap (e.g. 350B)"
                  style={{
                    padding: "0.65rem",
                    borderRadius: "4px",
                    border: "1px solid #ccc",
                    width: "170px",
                  }}
                />
                <button
                  type="button"
                  onClick={onAddManualStock}
                  disabled={isBusy}
                  style={{
                    padding: "0.65rem 1rem",
                    backgroundColor: "#111827",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    cursor: isBusy ? "not-allowed" : "pointer",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    opacity: isBusy ? 0.6 : 1,
                  }}
                >
                  Add Manual Stock
                </button>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {tickers.map((t) => (
                  <div
                    key={`${watchlistName}-${t}`}
                    style={{
                      padding: "0.4rem 0.75rem",
                      background: "#f0f0f0",
                      borderRadius: "4px",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                    }}
                  >
                    <span>{t}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveTicker(t)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#dc2626",
                        cursor: "pointer",
                        fontSize: "1rem",
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              {manualRows.length > 0 && (
                <div style={{ marginTop: "0.75rem" }}>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "#374151",
                      marginBottom: "0.4rem",
                    }}
                  >
                    Manual global stocks (excluded from refresh)
                  </div>
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}
                  >
                    {manualRows.map((row) => (
                      <div
                        key={`${watchlistName}-manual-${row.Ticker}`}
                        style={{
                          padding: "0.4rem 0.75rem",
                          background: "#eef2ff",
                          borderRadius: "4px",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                        }}
                      >
                        <span>{row.Ticker}</span>
                        <button
                          type="button"
                          onClick={() => onRemoveManualStock(row.Ticker)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#dc2626",
                            cursor: "pointer",
                            fontSize: "1rem",
                            lineHeight: 1,
                          }}
                          title="Remove manual stock"
                          aria-label="Remove manual stock"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <CustomWatchlistsTable
            data={currentData
              .filter((row) => tickers.includes(row.Ticker))
              .map((row) => ({
                ...row,
                Description:
                  stockDescriptionsByWatchlist[watchlistName]?.[row.Ticker] ||
                  "",
                Subcategory:
                  stockSubcategoriesByWatchlist[watchlistName]?.[row.Ticker] ||
                  "",
              }))}
            sortColumn={sortColumn}
            setSortColumn={onSetSortColumn}
            sortAscending={sortAscending}
            setSortAscending={onSetSortAscending}
            formatValue={formatValue}
            isAdmin={isAdmin}
            showCustomDatesChange={useCustomRange}
            expandedByTicker={expandedStockByWatchlist[watchlistName] || {}}
            editingByTicker={editingStockByWatchlist[watchlistName] || {}}
            draftDescriptionByTicker={
              stockDescriptionDraftByWatchlist[watchlistName] || {}
            }
            onToggleTickerExpand={onToggleTickerExpand}
            onStartEditDescription={onStartEditDescription}
            onCancelEditDescription={onCancelEditDescription}
            onDraftDescriptionChange={onDraftDescriptionChange}
            onSaveDescription={onSaveDescription}
            editingSubcategoryByTicker={
              editingStockSubcategoryByWatchlist[watchlistName] || {}
            }
            draftSubcategoryByTicker={
              stockSubcategoryDraftByWatchlist[watchlistName] || {}
            }
            onStartEditSubcategory={onStartEditSubcategory}
            onCancelEditSubcategory={onCancelEditSubcategory}
            onDraftSubcategoryChange={onDraftSubcategoryChange}
            onSaveSubcategory={onSaveSubcategory}
          />

          <ManualCustomStocksTable
            watchlistName={watchlistName}
            manualRows={manualRows}
            isAdmin={isAdmin}
            formatValue={formatValue}
            stockDescriptionsByWatchlist={stockDescriptionsByWatchlist}
            stockSubcategoriesByWatchlist={stockSubcategoriesByWatchlist}
            expandedStockByWatchlist={expandedStockByWatchlist}
            editingStockByWatchlist={editingStockByWatchlist}
            stockDescriptionDraftByWatchlist={stockDescriptionDraftByWatchlist}
            editingStockSubcategoryByWatchlist={
              editingStockSubcategoryByWatchlist
            }
            stockSubcategoryDraftByWatchlist={stockSubcategoryDraftByWatchlist}
            onToggleExpand={(_wl, ticker) => onToggleTickerExpand(ticker)}
            onStartEditDescription={(_wl, ticker) =>
              onStartEditDescription(ticker)
            }
            onCancelEditDescription={(_wl, ticker) =>
              onCancelEditDescription(ticker)
            }
            onDraftDescriptionChange={(_wl, ticker, value) =>
              onDraftDescriptionChange(ticker, value)
            }
            onSaveDescription={(_wl, ticker, value) =>
              onSaveDescription(ticker, value)
            }
            onStartEditSubcategory={(_wl, ticker) =>
              onStartEditSubcategory(ticker)
            }
            onCancelEditSubcategory={(_wl, ticker) =>
              onCancelEditSubcategory(ticker)
            }
            onDraftSubcategoryChange={(_wl, ticker, value) =>
              onDraftSubcategoryChange(ticker, value)
            }
            onSaveSubcategory={(_wl, ticker, value) =>
              onSaveSubcategory(ticker, value)
            }
          />
        </>
      )}
    </div>
  );
};

export default WatchlistSection;
