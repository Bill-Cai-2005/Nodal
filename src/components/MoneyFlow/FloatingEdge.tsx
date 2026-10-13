import { BaseEdge, getStraightPath, useInternalNode } from "@xyflow/react";
import type { EdgeProps, InternalNode } from "@xyflow/react";

/**
 * Point where the line from `node`'s center toward `other`'s center leaves
 * `node`'s box. Edges attach there instead of at a fixed handle, so a
 * connection looks right whichever way the two tickers are arranged.
 */
function getBoxIntersection(node: InternalNode, other: InternalNode) {
  const halfWidth = (node.measured.width ?? 0) / 2;
  const halfHeight = (node.measured.height ?? 0) / 2;
  const centerX = node.internals.positionAbsolute.x + halfWidth;
  const centerY = node.internals.positionAbsolute.y + halfHeight;
  const otherX =
    other.internals.positionAbsolute.x + (other.measured.width ?? 0) / 2;
  const otherY =
    other.internals.positionAbsolute.y + (other.measured.height ?? 0) / 2;

  if (halfWidth === 0 || halfHeight === 0) return { x: centerX, y: centerY };

  const xx = (otherX - centerX) / (2 * halfWidth) - (otherY - centerY) / (2 * halfHeight);
  const yy = (otherX - centerX) / (2 * halfWidth) + (otherY - centerY) / (2 * halfHeight);
  const scale = 1 / (Math.abs(xx) + Math.abs(yy) || 1);
  return {
    x: halfWidth * (scale * xx + scale * yy) + centerX,
    y: halfHeight * (-scale * xx + scale * yy) + centerY,
  };
}

const FloatingEdge = ({ id, source, target, style, markerEnd, selected }: EdgeProps) => {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const start = getBoxIntersection(sourceNode, targetNode);
  const end = getBoxIntersection(targetNode, sourceNode);
  const [path] = getStraightPath({
    sourceX: start.x,
    sourceY: start.y,
    targetX: end.x,
    targetY: end.y,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={{
        stroke: selected ? "#000000" : "#6b7280",
        strokeWidth: selected ? 2.5 : 1.5,
        ...style,
      }}
    />
  );
};

export default FloatingEdge;
