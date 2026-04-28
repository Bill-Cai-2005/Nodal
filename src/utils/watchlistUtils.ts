export const removeKeys = <T extends Record<string, any>>(
  source: T,
  keys: string[],
): T => {
  if (keys.length === 0) return source;
  const keySet = new Set(keys);
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !keySet.has(key)),
  ) as T;
};

export const renameKey = <T extends Record<string, any>>(
  source: T,
  fromKey: string,
  toKey: string,
): T => {
  if (
    !Object.prototype.hasOwnProperty.call(source, fromKey) ||
    fromKey === toKey
  )
    return source;
  const next = { ...source } as T;
  (next as any)[toKey] = (next as any)[fromKey];
  delete (next as any)[fromKey];
  return next;
};

export const parseNumberInput = (raw: string): number | null => {
  const s = String(raw || "").trim().toUpperCase();
  if (!s) return null;
  const match = s.match(/^(-?\d+(\.\d+)?)([KMB])?$/);
  if (!match) return null;
  const base = parseFloat(match[1]);
  if (isNaN(base)) return null;
  const suffix = match[3];
  const mult =
    suffix === "K" ? 1e3 : suffix === "M" ? 1e6 : suffix === "B" ? 1e9 : 1;
  return base * mult;
};

export const normalizeTickerInputLocal = (raw: string): string => {
  const input = String(raw || "").trim();
  if (!input) return "";
  const upper = input.toUpperCase();

  const yahooKorea = upper.match(/^([0-9A-Z.\-]+)\.(KS|KQ)$/);
  if (yahooKorea) return `${yahooKorea[1]}:XKRX`;

  const exchPrefixed = upper.match(/^([A-Z]{2,10})\s*:\s*([0-9A-Z.\-]+)$/);
  if (exchPrefixed) {
    const exch = exchPrefixed[1];
    const symbol = exchPrefixed[2];
    const mic =
      exch === "KRX" || exch === "KOSPI" || exch === "KOSDAQ" ? "XKRX" : exch;
    return `${symbol}:${mic}`;
  }

  return upper;
};

