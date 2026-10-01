import { getApiEndpoint } from "./api";

export interface StockConnectionNode {
  _id: string;
  ticker: string;
  connectedTickers: string[];
  createdAt: string;
}

interface ConnectionsResponse {
  nodes: StockConnectionNode[];
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (typeof payload?.error === "string") return payload.error;
  } catch {
    // Use the status below when the server does not return JSON.
  }
  return `Request failed (${response.status})`;
}

export async function fetchStockConnections(): Promise<StockConnectionNode[]> {
  const response = await fetch(getApiEndpoint("/api/connections"));
  if (!response.ok) throw new Error(await readError(response));
  const payload = (await response.json()) as ConnectionsResponse;
  return payload.nodes;
}

export async function createStockConnection(
  sourceTicker: string,
  targetTicker: string,
  adminPassword: string,
): Promise<StockConnectionNode[]> {
  const response = await fetch(getApiEndpoint("/api/connections"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": adminPassword,
    },
    body: JSON.stringify({ sourceTicker, targetTicker }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const payload = (await response.json()) as { nodes: StockConnectionNode[] };
  return payload.nodes;
}

export async function deleteStockConnection(
  sourceTicker: string,
  targetTicker: string,
  adminPassword: string,
): Promise<void> {
  const response = await fetch(getApiEndpoint("/api/connections"), {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": adminPassword,
    },
    body: JSON.stringify({ sourceTicker, targetTicker }),
  });
  if (!response.ok) throw new Error(await readError(response));
}
