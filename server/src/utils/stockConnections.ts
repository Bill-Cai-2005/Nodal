export const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,9}$/;

export interface LegacyConnectionPair {
  sourceTicker?: unknown;
  targetTicker?: unknown;
}

export interface NormalizedConnectionPair {
  sourceTicker: string;
  targetTicker: string;
}

export interface GroupedStockConnection {
  ticker: string;
  connectedTickers: string[];
}

export function normalizeTicker(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

export function normalizePair(
  source: unknown,
  target: unknown,
): NormalizedConnectionPair | null {
  const sourceTicker = normalizeTicker(source);
  const targetTicker = normalizeTicker(target);

  if (
    !TICKER_PATTERN.test(sourceTicker) ||
    !TICKER_PATTERN.test(targetTicker) ||
    sourceTicker === targetTicker
  ) {
    return null;
  }

  return { sourceTicker, targetTicker };
}

export function groupConnectionPairs(
  pairs: LegacyConnectionPair[],
): GroupedStockConnection[] {
  const connectedByTicker = new Map<string, Set<string>>();

  for (const pair of pairs) {
    const normalized = normalizePair(pair.sourceTicker, pair.targetTicker);
    if (!normalized) continue;

    if (!connectedByTicker.has(normalized.sourceTicker)) {
      connectedByTicker.set(normalized.sourceTicker, new Set());
    }
    if (!connectedByTicker.has(normalized.targetTicker)) {
      connectedByTicker.set(normalized.targetTicker, new Set());
    }
    connectedByTicker.get(normalized.sourceTicker)!.add(normalized.targetTicker);
    connectedByTicker.get(normalized.targetTicker)!.add(normalized.sourceTicker);
  }

  return [...connectedByTicker.entries()].map(([ticker, connectedTickers]) => ({
    ticker,
    connectedTickers: [...connectedTickers],
  }));
}
