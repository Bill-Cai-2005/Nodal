import React, { useMemo, useRef, useEffect, useState } from "react";

// Define a basic interface for our graph data
interface Node {
  id: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface Link {
  source: number;
  target: number;
}

const ToyGraph = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [ForceGraph2D, setForceGraph2D] = useState<any>(null);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    // Only import on the client side
    // We import specifically the 2D version to avoid Three.js/AFRAME bloat
    import("react-force-graph-2d").then((module) => {
      setForceGraph2D(() => module.default);
    });

    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };

    window.addEventListener("resize", updateDimensions);
    updateDimensions(); // Initial call

    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  const data = useMemo(() => {
    const nodes: Node[] = [...Array(6).keys()].map((i) => ({ id: i }));
    const links: Link[] = [];

    // Ensure all nodes are connected by creating a connected graph
    // First, create a chain connecting all nodes
    for (let i = 0; i < nodes.length - 1; i++) {
      links.push({ source: i, target: i + 1 });
    }

    // Add a few additional random connections to make it more interesting
    // while ensuring the graph remains connected
    const additionalLinks = 3;
    for (let i = 0; i < additionalLinks; i++) {
      const source = Math.floor(Math.random() * nodes.length);
      let target = Math.floor(Math.random() * nodes.length);
      // Make sure we don't create self-loops or duplicate links
      while (
        target === source ||
        links.some(
          (link) =>
            (link.source === source && link.target === target) ||
            (link.source === target && link.target === source)
        )
      ) {
        target = Math.floor(Math.random() * nodes.length);
      }
      links.push({ source, target });
    }

    return { nodes, links };
  }, []);

  const resetNodes = () => {
    // Clear all fixed positions to let nodes float freely
    data.nodes.forEach((node: Node) => {
      node.fx = null;
      node.fy = null;
    });
    // Force re-render by updating the key
    setResetKey((prev) => prev + 1);
  };

  if (!ForceGraph2D || dimensions.width === 0) {
    return (
      <div
        ref={containerRef}
        style={{
          background: "#ffffff",
          height: "100vh",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#00d4ff",
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        background: "#ffffff",
        height: "100vh",
        width: "100%",
        position: "relative",
      }}
    >
      <button
        onClick={resetNodes}
        style={{
          position: "absolute",
          top: "20px",
          right: "20px",
          zIndex: 10,
          padding: "0.75rem 1.5rem",
          backgroundColor: "#000000",
          color: "#ffffff",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
          fontSize: "0.875rem",
          fontWeight: 600,
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#333333";
          e.currentTarget.style.transform = "translateY(-2px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "#000000";
          e.currentTarget.style.transform = "translateY(0)";
        }}
      >
        Reset
      </button>
      <ForceGraph2D
        key={resetKey}
        graphData={data}
        width={dimensions.width}
        height={dimensions.height}
        nodeRelSize={8}
        nodeColor={() => "#000000"}
        linkColor={() => "#444"}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.005}
        d3VelocityDecay={0.3}
        enableZoomInteraction={false}
        enablePanInteraction={false}
        onNodeDragEnd={(node: Node) => {
          // This "pins" the node in place after dragging
          node.fx = node.x;
          node.fy = node.y;
        }}
      />
    </div>
  );
};

export default ToyGraph;
