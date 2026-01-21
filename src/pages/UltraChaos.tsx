import { useNavigate } from "react-router-dom";
import { useEffect, useRef } from "react";
import PageHeader from "../components/PageHeader";

const UltraChaos = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Mouse position tracking
    let mouseX = canvas.width / 2;
    let mouseY = canvas.height / 2;
    let mouseActive = false;

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      connectionPhase: number;
    }> = [];

    // Create chaotic particles
    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        size: Math.random() * 3 + 1,
        color: `rgba(139, 0, 0, ${Math.random() * 0.5 + 0.2})`,
        connectionPhase: Math.random() * Math.PI * 2,
      });
    }

    let frameCount = 0;

    const animate = () => {
      frameCount++;
      ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Update connection phases for dynamic connections (slower = longer lasting)
      particles.forEach((particle) => {
        particle.connectionPhase += 0.01 + Math.random() * 0.005;
      });

      particles.forEach((particle, i) => {
        // Mouse attraction
        if (mouseActive) {
          const dx = mouseX - particle.x;
          const dy = mouseY - particle.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance > 0) {
            // Attraction force (stronger when closer)
            const attractionStrength = 0.15;
            const force = attractionStrength / (distance / 100 + 1);
            particle.vx += (dx / distance) * force;
            particle.vy += (dy / distance) * force;
          }
        }

        // Update position
        particle.x += particle.vx;
        particle.y += particle.vy;

        // Add some chaos to velocity (reduced when mouse is active)
        const chaosAmount = mouseActive ? 0.2 : 0.5;
        particle.vx += (Math.random() - 0.5) * chaosAmount;
        particle.vy += (Math.random() - 0.5) * chaosAmount;

        // Limit velocity
        particle.vx = Math.max(-5, Math.min(5, particle.vx));
        particle.vy = Math.max(-5, Math.min(5, particle.vy));

        // Bounce off edges
        if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;

        // Keep particles in bounds
        particle.x = Math.max(0, Math.min(canvas.width, particle.x));
        particle.y = Math.max(0, Math.min(canvas.height, particle.y));

        // Draw particle
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.fill();

        // Draw connections with dynamic threshold
        particles.slice(i + 1).forEach((other) => {
          const dx = particle.x - other.x;
          const dy = particle.y - other.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // Dynamic connection threshold that pulses
          const baseThreshold = 200;
          const thresholdVariation = 80;
          const phase1 = Math.sin(particle.connectionPhase) * 0.5 + 0.5;
          const phase2 = Math.sin(other.connectionPhase) * 0.5 + 0.5;
          const dynamicThreshold = baseThreshold + (phase1 + phase2) * thresholdVariation;

          // Random connection chance based on distance and phase (higher chance = longer lasting)
          const connectionChance = Math.sin((particle.connectionPhase + other.connectionPhase) / 2) * 0.3 + 0.7;
          const shouldConnect = distance < dynamicThreshold && Math.random() < connectionChance;

          if (shouldConnect && distance < baseThreshold + thresholdVariation) {
            // Fade opacity based on distance and phase
            const phaseOpacity = (Math.sin(particle.connectionPhase) + Math.sin(other.connectionPhase)) / 4 + 0.5;
            const distanceOpacity = 1 - distance / (baseThreshold + thresholdVariation);
            const opacity = Math.max(0, Math.min(1, phaseOpacity * distanceOpacity * 0.4));

            ctx.beginPath();
            ctx.moveTo(particle.x, particle.y);
            ctx.lineTo(other.x, other.y);
            ctx.strokeStyle = `rgba(139, 0, 0, ${opacity})`;
            ctx.lineWidth = 2 + Math.sin(particle.connectionPhase) * 0.5;
            ctx.stroke();
          }
        });
      });

      requestAnimationFrame(animate);
    };

    animate();

    // Mouse event handlers
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
      mouseActive = true;
    };

    const handleMouseLeave = () => {
      mouseActive = false;
    };

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("resize", handleResize);

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#000000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 0,
        }}
      />
      <PageHeader researchColor="#ffffff" zIndex={2} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <h1 className="ultrachaos-title">
        ULTRACHAOS
      </h1>
      <p
        style={{
          fontSize: "1.5rem",
          color: "#ffffff",
          marginBottom: "1.5rem",
          textAlign: "center",
        }}
      >
        Incoming 2026
      </p>
      <button
        onClick={() => navigate("/")}
        style={{
          padding: "0.75rem 1.5rem",
          backgroundColor: "#8B0000",
          color: "#ffffff",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
          fontSize: "0.875rem",
          fontWeight: 600,
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
          transition: "all 0.2s ease",
          display: "block",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#333333";
          e.currentTarget.style.transform = "translateY(-2px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "#8B0000";
          e.currentTarget.style.transform = "translateY(0)";
        }}
      >
        Back to Nodes
      </button>
      </div>
    </div>
  );
};

export default UltraChaos;
