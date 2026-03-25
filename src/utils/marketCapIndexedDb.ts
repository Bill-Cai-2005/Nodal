type UniversalTableCacheRecord = {
  id: "universal_table_cache";
  rows: Array<Record<string, unknown>>;
  tickers: { nyse: string[]; nasdaq: string[] };
  updatedAt: string;
};

const DB_NAME = "nodal_market_cap_db";
const DB_VERSION = 2;
const STORE_NAME = "market_caps";

const openMarketCapDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
  });

const runRequest = (request: IDBRequest): Promise<void> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });

export const replaceUniversalTableInIndexedDb = async (
  rows: Array<Record<string, unknown>>,
  tickers: { nyse: string[]; nasdaq: string[] }
) => {
  if (typeof indexedDB === "undefined") return;

  const db = await openMarketCapDb();
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const record: UniversalTableCacheRecord = {
      id: "universal_table_cache",
      rows,
      tickers,
      updatedAt: new Date().toISOString(),
    };
    await runRequest(store.put(record));

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    });
  } finally {
    db.close();
  }
};

export const loadUniversalTableFromIndexedDb = async (): Promise<UniversalTableCacheRecord | null> => {
  if (typeof indexedDB === "undefined") return null;

  const db = await openMarketCapDb();
  try {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const record = await new Promise<UniversalTableCacheRecord | null>((resolve, reject) => {
      const request = store.get("universal_table_cache");
      request.onsuccess = () => resolve((request.result || null) as UniversalTableCacheRecord | null);
      request.onerror = () => reject(request.error || new Error("Failed to read IndexedDB universal table cache"));
    });
    return record;
  } finally {
    db.close();
  }
};
