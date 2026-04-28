import type { DragEvent, ReactNode } from "react";

type Props = {
  category: string;
  isAdmin: boolean;
  isExpanded: boolean;
  isDragged: boolean;
  isDragOver: boolean;
  isEditingName: boolean;
  renameDraft: string;
  showCreateWatchlist: boolean;
  newWatchlistName: string;
  watchlistsInCategoryCount: number;

  onToggleExpanded: () => void;
  onStartEditName: () => void;
  onRenameDraftChange: (value: string) => void;
  onSaveName: () => void;
  onDelete: () => void;
  onShowCreateWatchlist: () => void;
  onNewWatchlistNameChange: (value: string) => void;
  onCreateWatchlist: () => void;
  onCancelCreateWatchlist: () => void;

  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;

  children?: ReactNode;
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

const primaryButtonStyle = {
  padding: "0.75rem 1rem",
  backgroundColor: "#000000",
  color: "#ffffff",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 600,
};

const cancelButtonStyle = {
  ...primaryButtonStyle,
  backgroundColor: "#6b7280",
};

const CategorySection = ({
  category,
  isAdmin,
  isExpanded,
  isDragged,
  isDragOver,
  isEditingName,
  renameDraft,
  showCreateWatchlist,
  newWatchlistName,
  watchlistsInCategoryCount,
  onToggleExpanded,
  onStartEditName,
  onRenameDraftChange,
  onSaveName,
  onDelete,
  onShowCreateWatchlist,
  onNewWatchlistNameChange,
  onCreateWatchlist,
  onCancelCreateWatchlist,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  children,
}: Props) => {
  return (
    <div
      draggable={isAdmin}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{
        marginBottom: "1.25rem",
        border: isDragOver ? "2px dashed #111827" : "1px solid #e2e8f0",
        borderRadius: "8px",
        padding: "1rem",
        backgroundColor: "#f8fafc",
        opacity: isDragged ? 0.65 : 1,
      }}
    >
      <div
        onClick={onToggleExpanded}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: isExpanded ? "0.75rem" : 0,
          gap: "0.75rem",
          flexWrap: "wrap",
          cursor: "pointer",
        }}
      >
        <div>
          {isAdmin && isEditingName ? (
            <div
              style={{
                display: "flex",
                gap: "0.4rem",
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: "0.25rem",
              }}
            >
              <input
                type="text"
                value={renameDraft}
                onChange={(e) => onRenameDraftChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onSaveName();
                  }
                }}
                style={{
                  padding: "0.35rem 0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                  minWidth: "180px",
                }}
              />
            </div>
          ) : (
            <h2
              onClick={(e) => {
                if (!isAdmin) return;
                e.stopPropagation();
                onStartEditName();
              }}
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontSize: "1.1rem",
                marginBottom: "0.25rem",
              }}
            >
              {category}
            </h2>
          )}

          {isAdmin && isExpanded && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onShowCreateWatchlist();
              }}
              style={{
                marginTop: "0.35rem",
                padding: "0.5rem 0.8rem",
                background: "#ffffff",
                color: "#374151",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: 500,
              }}
            >
              Create Watchlist
            </button>
          )}
        </div>

        {isAdmin && isExpanded && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              style={{
                ...iconButtonBaseStyle,
                color: "#b91c1c",
                border: "1px solid #fecaca",
                fontSize: "1rem",
              }}
              title="Delete category"
              aria-label="Delete category"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {!isExpanded ? null : (
        <>
          {!showCreateWatchlist ? null : (
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: "0.75rem",
              }}
            >
              <input
                type="text"
                value={newWatchlistName}
                onChange={(e) => onNewWatchlistNameChange(e.target.value)}
                placeholder="Watchlist Name"
                style={{
                  padding: "0.75rem",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                  minWidth: "220px",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onCreateWatchlist();
                  }
                }}
              />
              <button type="button" onClick={onCreateWatchlist} style={primaryButtonStyle}>
                Create
              </button>
              <button type="button" onClick={onCancelCreateWatchlist} style={cancelButtonStyle}>
                Cancel
              </button>
            </div>
          )}

          {watchlistsInCategoryCount === 0 ? (
            <div style={{ padding: "0.75rem", color: "#6b7280", fontSize: "0.9rem" }}>
              No watchlists in this category.
            </div>
          ) : null}

          {children}
        </>
      )}
    </div>
  );
};

export default CategorySection;

