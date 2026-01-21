import { useMemo, useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "./PageHeader";

// Define a basic interface for our graph data
interface Node {
  id: number;
  name: string;
  sectionId: string;
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
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [ForceGraph2D, setForceGraph2D] = useState<any>(null);
  const [resetKey, setResetKey] = useState(0);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);

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

    return () => {
      window.removeEventListener("resize", updateDimensions);
    };
  }, []);

  const sectionNames = [
    { name: "Performance", sectionId: "performance" },
    { name: "Portfolio", sectionId: "portfolio" },
    { name: "Team", sectionId: "team" },
    { name: "Blog", sectionId: "blog" },
    { name: "ULTRACHAOS", sectionId: "ultra-chaos" },
    { name: "Join", sectionId: "join" },
  ];

  const data = useMemo(() => {
    const nodes: Node[] = [...Array(6).keys()].map((i) => ({
      id: i,
      name: sectionNames[i].name,
      sectionId: sectionNames[i].sectionId,
    }));
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

  const handleNodeClick = (node: Node, event?: MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    if (node.sectionId === "ultra-chaos") {
      navigate("/ultra-chaos");
    } else {
      // All black nodes navigate to blogs page
      navigate("/blogs");
    }
  };

  const handleContainerClick = () => {
    resetNodes();
  };

  const handleNodeHover = (node: Node | null) => {
    setHoveredNode(node);
  };

  if (!ForceGraph2D || dimensions.width === 0) {
    return (
      <div
        ref={containerRef}
        style={{
          background: "#f5f5f5",
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
      onClick={handleContainerClick}
      style={{
        background: "#f5f5f5",
        height: "100vh",
        width: "100%",
        position: "absolute",
        top: 0,
        left: 0,
        cursor: hoveredNode ? "pointer" : "default",
        zIndex: 0,
      }}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <PageHeader />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: "60px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          fontSize: "0.875rem",
          color: "#666666",
          fontFamily: "Montserrat, sans-serif",
          pointerEvents: "none",
        }}
      >
        click anywhere to reset
      </div>
      <ForceGraph2D
        key={resetKey}
        graphData={data}
        width={dimensions.width}
        height={dimensions.height}
        nodeRelSize={8}
        nodeColor={(node: Node) =>
          node.sectionId === "ultra-chaos" ? "#8B0000" : "#000000"
        }
        linkColor={() => "#444"}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.005}
        d3VelocityDecay={0.3}
        enableZoomInteraction={false}
        enablePanInteraction={false}
        nodeLabel={() => ""}
        onNodeClick={(node: Node, event?: MouseEvent) => {
          if (event) {
            event.stopPropagation();
          }
          handleNodeClick(node, event);
        }}
        onNodeHover={(node: Node | null) => {
          if (node) {
            handleNodeHover(node);
          } else {
            setHoveredNode(null);
          }
        }}
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
