import { Handle, Position } from "@xyflow/react";
import type { Node, NodeProps } from "@xyflow/react";

export type TickerNodeData = { ticker: string };
export type TickerNodeType = Node<TickerNodeData, "ticker">;

// Edges float between node borders (see FloatingEdge), so these handles are
// only grab points for drawing a new connection. Any handle can start or end one.
const HANDLE_POSITIONS = [Position.Top, Position.Right, Position.Bottom, Position.Left];

const TickerNode = ({ data, selected, isConnectable }: NodeProps<TickerNodeType>) => (
  <div
    style={{
      padding: "0.5rem 0.9rem",
      background: "#ffffff",
      border: `${selected ? 2 : 1.5}px solid ${selected ? "#000000" : "#374151"}`,
      borderRadius: "6px",
      boxShadow: selected ? "0 2px 8px rgba(0, 0, 0, 0.18)" : "0 1px 2px rgba(0, 0, 0, 0.08)",
      fontFamily: "Montserrat, sans-serif",
      fontWeight: 700,
      fontSize: "0.875rem",
      color: "#000000",
      whiteSpace: "nowrap",
    }}
  >
    {HANDLE_POSITIONS.map((position) => (
      <Handle
        key={position}
        id={position}
        type="source"
        position={position}
        isConnectable={isConnectable}
        style={{
          width: 8,
          height: 8,
          background: "#000000",
          border: "2px solid #ffffff",
          opacity: isConnectable ? 1 : 0,
        }}
      />
    ))}
    {data.ticker}
  </div>
);

export default TickerNode;
