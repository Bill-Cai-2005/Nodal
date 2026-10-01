import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  createStockConnection,
  deleteStockConnection,
  fetchStockConnections,
} from "../utils/connectionsApi";
import type { StockConnectionNode } from "../utils/connectionsApi";

interface StockConnectionsManagerProps {
  adminPassword: string;
}

const StockConnectionsManager = ({
  adminPassword,
}: StockConnectionsManagerProps) => {
  const [nodes, setNodes] = useState<StockConnectionNode[]>([]);
  const [sourceTicker, setSourceTicker] = useState("");
  const [targetTicker, setTargetTicker] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadConnections = async () => {
    setLoading(true);
    try {
      setNodes(await fetchStockConnections());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load connections.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConnections();
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const updatedNodes = await createStockConnection(
        sourceTicker,
        targetTicker,
        adminPassword,
      );
      setNodes((current) => mergeNodes(current, updatedNodes));
      setSourceTicker("");
      setTargetTicker("");
      setStatus("Connection added.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to add connection.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (node: StockConnectionNode, connectedTicker: string) => {
    setStatus(null);
    try {
      await deleteStockConnection(node.ticker, connectedTicker, adminPassword);
      await loadConnections();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to remove connection.");
    }
  };

  return (
    <section
      style={{
        marginBottom: "2rem",
        padding: "1.25rem",
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
      }}
    >
      <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.1rem" }}>
        Stock connections
      </h2>
      <p style={{ margin: "0 0 1rem", color: "#666", fontSize: "0.875rem" }}>
        Add a relationship between two ticker nodes. Each ticker stores the
        list of tickers it is connected to.
      </p>
      <form
        onSubmit={(event) => void handleSubmit(event)}
        style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}
      >
        <input
          value={sourceTicker}
          onChange={(event) => setSourceTicker(event.target.value)}
          placeholder="Source ticker"
          aria-label="Source ticker"
          maxLength={10}
          required
          style={inputStyle}
        />
        <input
          value={targetTicker}
          onChange={(event) => setTargetTicker(event.target.value)}
          placeholder="Target ticker"
          aria-label="Target ticker"
          maxLength={10}
          required
          style={inputStyle}
        />
        <button type="submit" disabled={saving} style={buttonStyle}>
          {saving ? "Adding…" : "Add connection"}
        </button>
      </form>
      {status && <p style={{ margin: "0.75rem 0 0", color: "#555" }}>{status}</p>}
      <div style={{ marginTop: "1rem" }}>
        {loading ? (
          <p>Loading connections…</p>
        ) : nodes.length === 0 ? (
          <p style={{ color: "#666" }}>No stock connections have been added.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
            {nodes.map((node) => (
              <li key={node._id} style={{ marginBottom: "0.4rem" }}>
                <strong>{node.ticker}</strong>:{" "}
                {node.connectedTickers.map((connectedTicker) => (
                  <span key={connectedTicker} style={{ marginRight: "0.5rem" }}>
                    {connectedTicker}
                    <button
                      type="button"
                      onClick={() => void handleDelete(node, connectedTicker)}
                      style={removeButtonStyle}
                    >
                      Remove
                    </button>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

function mergeNodes(
  current: StockConnectionNode[],
  updated: StockConnectionNode[],
): StockConnectionNode[] {
  const byTicker = new Map(current.map((node) => [node.ticker, node]));
  updated.forEach((node) => byTicker.set(node.ticker, node));
  return [...byTicker.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
}

const inputStyle = {
  flex: "1 1 140px",
  minWidth: "120px",
  padding: "0.6rem 0.75rem",
  border: "1px solid #d1d5db",
  borderRadius: "4px",
  textTransform: "uppercase" as const,
};

const buttonStyle = {
  padding: "0.6rem 1rem",
  backgroundColor: "#000000",
  color: "#ffffff",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 600,
};

const removeButtonStyle = {
  marginLeft: "0.5rem",
  padding: "0.2rem 0.45rem",
  border: "1px solid #d1d5db",
  borderRadius: "4px",
  background: "#fff",
  cursor: "pointer",
};

export default StockConnectionsManager;
