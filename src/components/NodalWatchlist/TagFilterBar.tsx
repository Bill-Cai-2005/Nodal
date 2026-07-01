import { useEffect, useState } from "react";
import {
  collectAllTags,
  getTagDescription,
  getTagPillStyle,
  isKeyTag,
  normalizeTagKey,
  sortTagsWithKeysFirst,
} from "../../utils/tagUtils";

type Props = {
  tagsByTicker: Record<string, string[]>;
  tagDescriptions: Record<string, string>;
  keyTags: string[];
  selectedTags: string[];
  searchQuery: string;
  isAdmin?: boolean;
  onSearchQueryChange: (value: string) => void;
  onToggleTag: (tag: string) => void;
  onToggleKeyTag: (tag: string) => void;
  onClearTags: () => void;
  onSaveTagDescription: (tag: string, description: string) => void;
};

const fontFamily = "Montserrat, sans-serif";

const TagFilterBar = ({
  tagsByTicker,
  tagDescriptions,
  keyTags,
  selectedTags,
  searchQuery,
  isAdmin = false,
  onSearchQueryChange,
  onToggleTag,
  onToggleKeyTag,
  onClearTags,
  onSaveTagDescription,
}: Props) => {
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [draftDescription, setDraftDescription] = useState("");

  const allTags = sortTagsWithKeysFirst(collectAllTags(tagsByTicker), keyTags);
  const query = searchQuery.trim().toLowerCase();
  const visibleTags = sortTagsWithKeysFirst(
    query
      ? allTags.filter((tag) => {
          const description = getTagDescription(tagDescriptions, tag);
          return (
            normalizeTagKey(tag).includes(query) ||
            description.toLowerCase().includes(query)
          );
        })
      : allTags,
    keyTags,
  );

  const isTagSelected = (tag: string) =>
    selectedTags.some(
      (selected) => normalizeTagKey(selected) === normalizeTagKey(tag),
    );

  const pillTags = sortTagsWithKeysFirst(
    Array.from(
      new Set([
        ...selectedTags,
        ...visibleTags.filter(
          (tag) =>
            !selectedTags.some(
              (selected) => normalizeTagKey(selected) === normalizeTagKey(tag),
            ),
        ),
      ]),
    ),
    keyTags,
  );

  const selectedForDescriptions = sortTagsWithKeysFirst(
    [...selectedTags],
    keyTags,
  );

  const startEditing = (tag: string) => {
    if (!isAdmin) return;
    setEditingTag(tag);
    setDraftDescription(getTagDescription(tagDescriptions, tag));
  };

  const commitDescription = (tag: string) => {
    onSaveTagDescription(tag, draftDescription);
    setEditingTag(null);
    setDraftDescription("");
  };

  useEffect(() => {
    if (editingTag && !isTagSelected(editingTag)) {
      setEditingTag(null);
      setDraftDescription("");
    }
  }, [editingTag, selectedTags]);

  const renderTagPill = (tag: string) => {
    const active = isTagSelected(tag);
    const isKey = isKeyTag(keyTags, tag);

    return (
      <button
        key={tag}
        type="button"
        onClick={() => onToggleTag(tag)}
        style={{
          ...getTagPillStyle(isKey, active),
          fontFamily,
          cursor: "pointer",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        {isKey ? `★ ${tag}` : tag}
      </button>
    );
  };

  const renderSelectedDetail = (tag: string) => {
    const isKey = isKeyTag(keyTags, tag);
    const description = getTagDescription(tagDescriptions, tag);
    const isEditing = editingTag === tag;

    return (
      <div
        key={`detail-${tag}`}
        style={{
          padding: "0.85rem 1rem",
          borderRadius: "6px",
          backgroundColor: "#f5f5f5",
          border: isKey ? "2px solid #000000" : "1px solid #e5e7eb",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            marginBottom: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontFamily,
              fontWeight: 700,
              fontSize: "0.9rem",
              color: "#000000",
            }}
          >
            {isKey ? `★ ${tag}` : tag}
          </span>
          {isAdmin && (
            <button
              type="button"
              onClick={() => onToggleKeyTag(tag)}
              title={isKey ? "Remove key theme" : "Mark as key theme"}
              aria-label={isKey ? "Remove key theme" : "Mark as key theme"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.35rem 0.65rem",
                borderRadius: "9999px",
                border: isKey ? "1px solid #000000" : "1px solid #d1d5db",
                backgroundColor: isKey ? "#000000" : "#ffffff",
                color: isKey ? "#ffffff" : "#666666",
                cursor: "pointer",
                fontFamily,
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            >
              {isKey ? "★ Key theme" : "☆ Mark key theme"}
            </button>
          )}
        </div>

        {isEditing ? (
          <textarea
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            onBlur={() => commitDescription(tag)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setEditingTag(null);
                setDraftDescription("");
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                commitDescription(tag);
              }
            }}
            autoFocus
            placeholder="Describe what this tag covers..."
            rows={2}
            style={{
              width: "100%",
              padding: "0.5rem 0.65rem",
              borderRadius: "4px",
              border: "1px solid #d1d5db",
              fontSize: "0.85rem",
              lineHeight: 1.45,
              resize: "vertical",
              fontFamily,
              boxSizing: "border-box",
              backgroundColor: "#ffffff",
            }}
          />
        ) : description ? (
          <div
            onClick={() => startEditing(tag)}
            style={{
              color: "#374151",
              fontSize: "0.85rem",
              lineHeight: 1.5,
              cursor: isAdmin ? "text" : "default",
              whiteSpace: "pre-wrap",
              fontFamily,
            }}
            title={isAdmin ? "Click to edit description" : undefined}
          >
            {description}
          </div>
        ) : isAdmin ? (
          <button
            type="button"
            onClick={() => startEditing(tag)}
            style={{
              color: "#666666",
              fontSize: "0.85rem",
              fontStyle: "italic",
              cursor: "pointer",
              background: "none",
              border: "none",
              padding: 0,
              fontFamily,
            }}
          >
            Add description…
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div style={{ marginBottom: "1.25rem", fontFamily }}>
      <div
        style={{
          backgroundColor: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            alignItems: "center",
            flexWrap: "wrap",
            padding: "0.75rem 1rem",
            borderBottom: "1px solid #e5e7eb",
            backgroundColor: "#f5f5f5",
          }}
        >
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Search tags…"
            style={{
              flex: "1 1 220px",
              minWidth: "200px",
              padding: "0.6rem 0.75rem",
              borderRadius: "4px",
              border: "1px solid #d1d5db",
              fontSize: "0.9rem",
              backgroundColor: "#ffffff",
              fontFamily,
            }}
          />
          {selectedTags.length > 0 && (
            <button
              type="button"
              onClick={onClearTags}
              style={{
                padding: "0.55rem 0.9rem",
                borderRadius: "4px",
                border: "1px solid #000000",
                backgroundColor: "#000000",
                color: "#ffffff",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: 600,
                fontFamily,
              }}
            >
              Clear ({selectedTags.length})
            </button>
          )}
        </div>

        <div style={{ padding: "0.85rem 1rem" }}>
          {allTags.length === 0 ? (
            <div style={{ color: "#666666", fontSize: "0.875rem" }}>
              No tags yet. Add tags to stocks to filter by theme.
            </div>
          ) : pillTags.length === 0 ? (
            <div style={{ color: "#666666", fontSize: "0.875rem" }}>
              No tags match your search.
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexWrap: "nowrap",
                gap: "0.5rem",
                alignItems: "center",
                overflowX: "auto",
                paddingBottom: "0.25rem",
              }}
            >
              {pillTags.map((tag) => renderTagPill(tag))}
            </div>
          )}

          {selectedForDescriptions.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.65rem",
                marginTop: "1rem",
                paddingTop: "1rem",
                borderTop: "1px solid #e5e7eb",
              }}
            >
              {selectedForDescriptions.map((tag) => renderSelectedDetail(tag))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TagFilterBar;
