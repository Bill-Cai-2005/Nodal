export const normalizeTagKey = (tag: string): string =>
  String(tag || "").trim().toLowerCase();

export const normalizeTagLabel = (tag: string): string =>
  String(tag || "").trim();

export const parseTagsInput = (raw: string): string[] =>
  raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

export const stockMatchesTags = (
  stockTags: string[],
  selectedTags: string[],
): boolean => {
  if (selectedTags.length === 0) return true;
  const normalizedStockTags = stockTags.map(normalizeTagKey);
  return selectedTags.every((tag) =>
    normalizedStockTags.includes(normalizeTagKey(tag)),
  );
};

export const collectAllTags = (
  tagsByTicker: Record<string, string[]>,
): string[] => {
  const seen = new Map<string, string>();
  for (const tags of Object.values(tagsByTicker)) {
    for (const tag of tags || []) {
      const label = normalizeTagLabel(tag);
      if (!label) continue;
      const key = normalizeTagKey(label);
      if (!seen.has(key)) seen.set(key, label);
    }
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
};

export const mergeUniqueTags = (
  existing: string[],
  incoming: string[],
): string[] => {
  const seen = new Map<string, string>();
  for (const tag of [...existing, ...incoming]) {
    const label = normalizeTagLabel(tag);
    if (!label) continue;
    seen.set(normalizeTagKey(label), label);
  }
  return Array.from(seen.values());
};

export const getTagDescription = (
  tagDescriptions: Record<string, string>,
  tag: string,
): string => {
  const key = normalizeTagKey(tag);
  for (const [label, description] of Object.entries(tagDescriptions)) {
    if (normalizeTagKey(label) === key) return description;
  }
  return "";
};

export const setTagDescription = (
  tagDescriptions: Record<string, string>,
  tag: string,
  description: string,
): Record<string, string> => {
  const label = normalizeTagLabel(tag);
  if (!label) return tagDescriptions;
  const key = normalizeTagKey(label);
  const next = { ...tagDescriptions };
  for (const existingLabel of Object.keys(next)) {
    if (normalizeTagKey(existingLabel) === key) {
      delete next[existingLabel];
    }
  }
  if (description.trim()) {
    next[label] = description.trim();
  }
  return next;
};

export const isKeyTag = (keyTags: string[], tag: string): boolean =>
  keyTags.some((keyTag) => normalizeTagKey(keyTag) === normalizeTagKey(tag));

export const toggleKeyTag = (keyTags: string[], tag: string): string[] => {
  const label = normalizeTagLabel(tag);
  if (!label) return keyTags;
  const key = normalizeTagKey(label);
  if (isKeyTag(keyTags, label)) {
    return keyTags.filter((keyTag) => normalizeTagKey(keyTag) !== key);
  }
  return [...keyTags, label];
};

export const sortTagsWithKeysFirst = (
  tags: string[],
  keyTags: string[],
): string[] => {
  const keys = new Set(keyTags.map(normalizeTagKey));
  return [...tags].sort((a, b) => {
    const aKey = keys.has(normalizeTagKey(a));
    const bKey = keys.has(normalizeTagKey(b));
    if (aKey !== bKey) return aKey ? -1 : 1;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
};

export const getTagPillStyle = (
  isKey: boolean,
  active = false,
  compact = false,
): {
  padding: string;
  borderRadius: string;
  border: string;
  backgroundColor: string;
  color: string;
  fontSize: string;
  fontWeight: number;
  whiteSpace: "nowrap";
  boxShadow?: string;
} => {
  const padding = compact ? "0.2rem 0.55rem" : "0.4rem 0.85rem";
  const fontSize = compact ? "0.75rem" : "0.8rem";

  if (active) {
    return {
      padding,
      borderRadius: "9999px",
      border: isKey ? "2px solid #000000" : "1px solid #000000",
      backgroundColor: "#000000",
      color: "#ffffff",
      fontSize,
      fontWeight: isKey ? 700 : 600,
      whiteSpace: "nowrap",
      boxShadow: isKey ? "0 0 0 1px #ffffff inset" : undefined,
    };
  }

  if (isKey) {
    return {
      padding,
      borderRadius: "9999px",
      border: "2px solid #000000",
      backgroundColor: "#f5f5f5",
      color: "#000000",
      fontSize,
      fontWeight: 700,
      whiteSpace: "nowrap",
    };
  }

  return {
    padding,
    borderRadius: "9999px",
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    color: "#374151",
    fontSize,
    fontWeight: 500,
    whiteSpace: "nowrap",
  };
};
