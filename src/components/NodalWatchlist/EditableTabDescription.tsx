import { parseStockDescriptionRichText } from "../../utils/stockDescriptionRichText";
import { toggleMarkdownBold } from "../../utils/markdownBoldToggle";

type Props = {
  description: string;
  isAdmin?: boolean;
  isEditing: boolean;
  draft: string;
  onStartEdit: () => void;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

const containerStyle = {
  maxWidth: "720px",
  margin: "0 auto 1.5rem",
  textAlign: "center" as const,
  color: "#4b5563",
  fontSize: "1rem",
  lineHeight: 1.6,
};

const EditableTabDescription = ({
  description,
  isAdmin = false,
  isEditing,
  draft,
  onStartEdit,
  onDraftChange,
  onSave,
  onCancel,
}: Props) => {
  if (!isAdmin) {
    return (
      <p style={containerStyle}>
        {description ? parseStockDescriptionRichText(description) : null}
      </p>
    );
  }

  if (!isEditing) {
    return (
      <div style={containerStyle}>
        <div style={{ whiteSpace: "pre-wrap" }}>
          {description
            ? parseStockDescriptionRichText(description)
            : "No description yet."}
        </div>
        <button
          type="button"
          onClick={onStartEdit}
          style={{
            marginTop: "0.65rem",
            padding: "0.4rem 0.75rem",
            borderRadius: "6px",
            border: "1px solid #d1d5db",
            background: "#ffffff",
            cursor: "pointer",
            fontSize: "0.85rem",
            fontWeight: 600,
          }}
        >
          Edit Tab Description
        </button>
      </div>
    );
  }

  return (
    <div style={{ ...containerStyle, textAlign: "left" }}>
      <textarea
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if (!(e.ctrlKey || e.metaKey)) return;
          if (e.key.toLowerCase() !== "b") return;
          e.preventDefault();
          const target = e.currentTarget;
          const update = toggleMarkdownBold(
            draft,
            target.selectionStart ?? 0,
            target.selectionEnd ?? 0,
          );
          onDraftChange(update.value);
          requestAnimationFrame(() => {
            target.setSelectionRange(update.selectionStart, update.selectionEnd);
          });
        }}
        rows={3}
        placeholder="Describe this tab..."
        style={{
          width: "100%",
          minHeight: "84px",
          padding: "0.6rem",
          borderRadius: "6px",
          border: "1px solid #d1d5db",
          resize: "vertical",
          fontSize: "1rem",
          lineHeight: 1.6,
          boxSizing: "border-box",
        }}
      />
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          justifyContent: "center",
          marginTop: "0.65rem",
        }}
      >
        <button
          type="button"
          onClick={onSave}
          style={{
            padding: "0.5rem 0.8rem",
            borderRadius: "6px",
            border: "none",
            background: "#000000",
            color: "#ffffff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "0.5rem 0.8rem",
            borderRadius: "6px",
            border: "none",
            background: "#6b7280",
            color: "#ffffff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default EditableTabDescription;
