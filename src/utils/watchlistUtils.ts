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

export const formatPercentChange = (
  value: number | null | undefined,
): string => {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return `${value.toFixed(2)}%`;
};

export const percentChangeColor = (
  value: number | null | undefined,
): string => {
  if (typeof value !== "number" || Number.isNaN(value)) return "#374151";
  return value >= 0 ? "#008000" : "#dc2626";
};

export const formatMarketValue = (value: number | null): string => {
  if (value === null) return "N/A";
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  if (typeof value === "number") return value.toFixed(2);
  return String(value);
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
