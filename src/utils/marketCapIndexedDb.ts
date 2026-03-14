type MarketCapRecord = {
  ticker: string;
  marketCap: number;
  updatedAt: string;
};

const DB_NAME = "nodal_market_cap_db";
const DB_VERSION = 1;
const STORE_NAME = "market_caps";

const openMarketCapDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "ticker" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
  });

const runRequest = (request: IDBRequest): Promise<void> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });

export const replaceMarketCapsInIndexedDb = async (rows: Array<{ Ticker: string; "Market Cap": number | null }>) => {
  if (typeof indexedDB === "undefined") return;

  const db = await openMarketCapDb();
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    await runRequest(store.clear());

    const updatedAt = new Date().toISOString();
    for (const row of rows) {
      if (row["Market Cap"] === null) continue;
      const record: MarketCapRecord = {
        ticker: row.Ticker,
        marketCap: row["Market Cap"],
        updatedAt,
      };
      await runRequest(store.put(record));
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    });
  } finally {
    db.close();
  }
};

export const loadMarketCapsFromIndexedDb = async (): Promise<Record<string, number>> => {
  if (typeof indexedDB === "undefined") return {};

  const db = await openMarketCapDb();
  try {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    const records = await new Promise<MarketCapRecord[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve((request.result || []) as MarketCapRecord[]);
      request.onerror = () => reject(request.error || new Error("Failed to read IndexedDB market caps"));
    });

    return Object.fromEntries(records.map((r) => [r.ticker, r.marketCap]));
  } finally {
    db.close();
  }
};
