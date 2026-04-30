export type MarkdownSelectionUpdate = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

/**
 * Toggles `**bold**` around the current selection.
 * - If the selection is already wrapped in `**`, it removes the wrapping.
 * - If there's no selection, it inserts `****` and places the cursor in-between.
 */
export function toggleMarkdownBold(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): MarkdownSelectionUpdate {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(0, Math.min(selectionEnd, value.length));
  const left = Math.min(start, end);
  const right = Math.max(start, end);

  if (left === right) {
    const nextValue = `${value.slice(0, left)}****${value.slice(right)}`;
    const cursor = left + 2;
    return { value: nextValue, selectionStart: cursor, selectionEnd: cursor };
  }

  const hasLeftMarker = left >= 2 && value.slice(left - 2, left) === "**";
  const hasRightMarker =
    right + 2 <= value.length && value.slice(right, right + 2) === "**";

  if (hasLeftMarker && hasRightMarker) {
    const nextValue = `${value.slice(0, left - 2)}${value.slice(
      left,
      right,
    )}${value.slice(right + 2)}`;
    return {
      value: nextValue,
      selectionStart: left - 2,
      selectionEnd: right - 2,
    };
  }

  const nextValue = `${value.slice(0, left)}**${value.slice(
    left,
    right,
  )}**${value.slice(right)}`;
  return {
    value: nextValue,
    selectionStart: left + 2,
    selectionEnd: right + 2,
  };
}

