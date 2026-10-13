import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import {
  Background,
  ConnectionMode,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
} from "@xyflow/react";
import type {
  Connection,
  Edge,
  EdgeChange,
  NodeChange,
  OnBeforeDelete,
  OnDelete,
  OnNodeDrag,
  XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  createStockConnection,
  deleteStockConnection,
  fetchStockConnections,
  placeStockConnectionNode,
  removeStockConnectionNode,
} from "../../utils/connectionsApi";
import type { StockConnectionNode } from "../../utils/connectionsApi";
import {
  AI_BUILDOUT_WATCHLIST_NAME,
  RESOURCE_TAB_AI_BUILDOUT,
  loadCustomWatchlistsFromDb,
} from "../../utils/watchlistCacheApi";
import TickerNode from "./TickerNode";
import type { TickerNodeType } from "./TickerNode";
import FloatingEdge from "./FloatingEdge";

export const MONEY_FLOW_DESCRIPTION =
  "How money moves between the companies in the AI buildout.";

// Mirrors TICKER_PATTERN in server/src/utils/stockConnections.ts.
const MAP_TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.:-]{0,14}$/;
const TICKER_DRAG_TYPE = "application/x-nodal-ticker";
const NARROW_BREAKPOINT = 768;

const nodeTypes = { ticker: TickerNode };
const edgeTypes = { floating: FloatingEdge };

type Props = {
  isAdmin: boolean;
  adminPassword: string;
};

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const makeEdge = (a: string, b: string): Edge => {
  const [source, target] = a < b ? [a, b] : [b, a];
  return { id: `${source}|${target}`, source, target, type: "floating" };
};

const makeNode = (ticker: string, position: XYPosition): TickerNodeType => ({
  id: ticker,
  type: "ticker",
  position,
  data: { ticker },
});

/**
 * AI Buildout lists market tickers in `tickers` and manually priced stocks as
 * extra `data` rows; both appear in its table, so both belong in the inventory.
 */
async function loadAiBuildoutTickers(): Promise<string[]> {
  const response = await loadCustomWatchlistsFromDb(RESOURCE_TAB_AI_BUILDOUT);
  const watchlist = response.watchlists?.find(
    (w) => w.name === AI_BUILDOUT_WATCHLIST_NAME,
  );
  if (!watchlist) return [];
  const manualTickers = (watchlist.data || []).map((row) => row?.Ticker);
  return Array.from(
    new Set(
      [...(watchlist.tickers || []), ...manualTickers]
        .map((ticker) => String(ticker || "").trim().toUpperCase())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

/**
 * Only AI Buildout tickers are drawn. A ticker removed from AI Buildout keeps
 * its saved position and connections, so adding it back restores it.
 */
function buildFlow(aiTickers: string[], graph: StockConnectionNode[]) {
  const visible = new Set(aiTickers);
  const placed = graph.filter((node) => node.position && visible.has(node.ticker));
  const placedTickers = new Set(placed.map((node) => node.ticker));

  const nodes = placed.map((node) => makeNode(node.ticker, node.position!));
  const edges: Edge[] = [];
  for (const node of placed) {
    for (const connected of node.connectedTickers) {
      // Each pair is stored on both tickers; draw it once.
      if (placedTickers.has(connected) && node.ticker < connected) {
        edges.push(makeEdge(node.ticker, connected));
      }
    }
  }
  return { nodes, edges };
}

function useIsNarrow() {
  const [isNarrow, setIsNarrow] = useState(
    () => window.innerWidth < NARROW_BREAKPOINT,
  );
  useEffect(() => {
    const update = () => setIsNarrow(window.innerWidth < NARROW_BREAKPOINT);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return isNarrow;
}

const MoneyFlowCanvas = ({ isAdmin, adminPassword }: Props) => {
  const { screenToFlowPosition } = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);
  const isNarrow = useIsNarrow();
  const [aiTickers, setAiTickers] = useState<string[]>([]);
  const [nodes, setNodes] = useState<TickerNodeType[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const canEdit = isAdmin && Boolean(adminPassword);

  const load = useCallback(async () => {
    try {
      const [tickers, graph] = await Promise.all([
        loadAiBuildoutTickers(),
        fetchStockConnections(),
      ]);
      const flow = buildFlow(tickers, graph);
      setAiTickers(tickers);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setLoadError(null);
    } catch (error) {
      setLoadError(errorMessage(error, "Failed to load the money flow map."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A failed save reloads from the server so the map never shows unsaved work.
  const handleSaveError = useCallback(
    (error: unknown, fallback: string) => {
      setStatus(errorMessage(error, fallback));
      void load();
    },
    [load],
  );

  const placedTickers = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const inventory = useMemo(() => {
    const query = search.trim().toUpperCase();
    return aiTickers.filter(
      (ticker) => !placedTickers.has(ticker) && (!query || ticker.includes(query)),
    );
  }, [aiTickers, placedTickers, search]);

  const placeTicker = useCallback(
    async (ticker: string, position: XYPosition) => {
      if (!canEdit || placedTickers.has(ticker)) return;
      setStatus(null);
      setNodes((current) => [...current, makeNode(ticker, position)]);
      try {
        await placeStockConnectionNode(ticker, position, adminPassword);
      } catch (error) {
        handleSaveError(error, `Failed to place ${ticker}.`);
      }
    },
    [canEdit, placedTickers, adminPassword, handleSaveError],
  );

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const ticker = event.dataTransfer.getData(TICKER_DRAG_TYPE);
    if (!ticker) return;
    void placeTicker(
      ticker,
      screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    );
  };

  // Tapping a ticker places it mid-canvas, for touch screens without drag and drop.
  const placeAtCenter = (ticker: string) => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const nudge = (nodes.length % 5) * 24;
    void placeTicker(
      ticker,
      screenToFlowPosition({
        x: bounds.left + bounds.width / 2 + nudge,
        y: bounds.top + bounds.height / 2 + nudge,
      }),
    );
  };

  const onNodesChange = useCallback(
    (changes: NodeChange<TickerNodeType>[]) =>
      setNodes((current) => applyNodeChanges(changes, current)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((current) => applyEdgeChanges(changes, current)),
    [],
  );

  const onNodeDragStop: OnNodeDrag<TickerNodeType> = (_event, _node, movedNodes) => {
    if (!canEdit) return;
    void Promise.all(
      movedNodes.map((node) =>
        placeStockConnectionNode(node.id, node.position, adminPassword),
      ),
    ).catch((error) => handleSaveError(error, "Failed to save the new position."));
  };

  const onConnect = async ({ source, target }: Connection) => {
    if (!canEdit || !source || !target || source === target) return;
    const edge = makeEdge(source, target);
    if (edges.some((existing) => existing.id === edge.id)) return;
    setStatus(null);
    setEdges((current) => [...current, edge]);
    try {
      await createStockConnection(source, target, adminPassword);
    } catch (error) {
      handleSaveError(error, `Failed to connect ${source} and ${target}.`);
    }
  };

  const onBeforeDelete: OnBeforeDelete<TickerNodeType> = async ({ nodes: doomed }) => {
    if (!canEdit) return false;
    if (doomed.length === 0) return true;
    const names = doomed.map((node) => node.id).join(", ");
    return window.confirm(
      `Remove ${names} from the map? Their connections will be deleted too.`,
    );
  };

  const onDelete: OnDelete<TickerNodeType> = ({ nodes: removed, edges: removedEdges }) => {
    setStatus(null);
    const removedTickers = new Set(removed.map((node) => node.id));
    // Removing a ticker already deletes its connections on the server.
    const standaloneEdges = removedEdges.filter(
      (edge) => !removedTickers.has(edge.source) && !removedTickers.has(edge.target),
    );
    void Promise.all([
      ...removed.map((node) => removeStockConnectionNode(node.id, adminPassword)),
      ...standaloneEdges.map((edge) =>
        deleteStockConnection(edge.source, edge.target, adminPassword),
      ),
    ]).catch((error) => handleSaveError(error, "Failed to delete from the map."));
  };

  if (loading) return <p style={messageStyle}>Loading the money flow map…</p>;
  if (loadError) return <p style={{ ...messageStyle, color: "#dc2626" }}>{loadError}</p>;

  return (
    <div>
      <p style={descriptionStyle}>{MONEY_FLOW_DESCRIPTION}</p>
      <p style={hintStyle}>
        {canEdit
          ? "Drag tickers from the inventory onto the map (or tap one to drop it in the middle). Drag between the dots on two tickers to connect them. Select a ticker or connection and press Delete to remove it."
          : "Drag to pan and scroll to zoom. Unlock admin tools below to edit the map."}
      </p>
      {status && <p style={{ ...hintStyle, color: "#dc2626" }}>{status}</p>}

      <div
        style={{
          display: "flex",
          flexDirection: isNarrow ? "column" : "row",
          gap: "1rem",
        }}
      >
        <aside
          style={{
            ...cardStyle,
            flex: isNarrow ? "0 0 auto" : "0 0 220px",
            maxHeight: isNarrow ? "220px" : "640px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ padding: "0.75rem", borderBottom: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.5rem" }}>
              Inventory{" "}
              <span style={{ color: "#6b7280", fontWeight: 500 }}>
                ({aiTickers.length - placedTickers.size} of {aiTickers.length})
              </span>
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tickers"
              aria-label="Search inventory tickers"
              style={searchStyle}
            />
          </div>
          <div
            style={{
              overflowY: "auto",
              padding: "0.5rem",
              display: "flex",
              flexWrap: "wrap",
              alignContent: "flex-start",
              gap: "0.4rem",
            }}
          >
            {aiTickers.length === 0 ? (
              <p style={emptyStyle}>No tickers in AI Buildout yet.</p>
            ) : inventory.length === 0 ? (
              <p style={emptyStyle}>
                {search ? "No matching tickers." : "Every ticker is on the map."}
              </p>
            ) : (
              inventory.map((ticker) => {
                const placeable = canEdit && MAP_TICKER_PATTERN.test(ticker);
                return (
                  <button
                    key={ticker}
                    type="button"
                    draggable={placeable}
                    disabled={!placeable}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(TICKER_DRAG_TYPE, ticker);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => placeAtCenter(ticker)}
                    title={
                      !canEdit
                        ? "Unlock admin tools to add tickers to the map"
                        : placeable
                          ? `Drag ${ticker} onto the map`
                          : `${ticker} can't be placed: unsupported ticker format`
                    }
                    style={{
                      ...chipStyle,
                      cursor: placeable ? "grab" : "default",
                      opacity: canEdit && !placeable ? 0.4 : 1,
                    }}
                  >
                    {ticker}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <div
          ref={canvasRef}
          style={{ ...cardStyle, flex: "1 1 auto", height: isNarrow ? "480px" : "640px" }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={handleDrop}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            onConnect={(connection) => void onConnect(connection)}
            onBeforeDelete={onBeforeDelete}
            onDelete={onDelete}
            connectionMode={ConnectionMode.Loose}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
            fitView
            fitViewOptions={{ maxZoom: 1.25, padding: 0.2 }}
            minZoom={0.2}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} color="#e5e7eb" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
};

const MoneyFlowMap = (props: Props) => (
  <ReactFlowProvider>
    <MoneyFlowCanvas {...props} />
  </ReactFlowProvider>
);

const descriptionStyle: CSSProperties = {
  maxWidth: "720px",
  margin: "0 auto 0.75rem",
  textAlign: "center",
  color: "#4b5563",
  fontSize: "1rem",
  lineHeight: 1.6,
};

const hintStyle: CSSProperties = {
  maxWidth: "720px",
  margin: "0 auto 1rem",
  textAlign: "center",
  color: "#6b7280",
  fontSize: "0.8125rem",
  lineHeight: 1.5,
};

const messageStyle: CSSProperties = {
  padding: "3rem 1.5rem",
  textAlign: "center",
  color: "#4b5563",
};

const cardStyle: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  backgroundColor: "#ffffff",
  overflow: "hidden",
  boxSizing: "border-box",
};

const searchStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.45rem 0.6rem",
  border: "1px solid #d1d5db",
  borderRadius: "4px",
  fontSize: "0.8125rem",
};

const chipStyle: CSSProperties = {
  padding: "0.35rem 0.6rem",
  background: "#ffffff",
  border: "1px solid #374151",
  borderRadius: "4px",
  fontFamily: "Montserrat, sans-serif",
  fontWeight: 600,
  fontSize: "0.75rem",
  color: "#000000",
};

const emptyStyle: CSSProperties = {
  margin: "0.5rem",
  color: "#6b7280",
  fontSize: "0.8125rem",
};

export default MoneyFlowMap;
