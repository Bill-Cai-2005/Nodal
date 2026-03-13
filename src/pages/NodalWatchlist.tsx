import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import Footer from "../components/Footer";
import { useResponsivePadding } from "../hooks/useResponsivePadding";
import UniversalWatchlist from "../components/NodalWatchlist/UniversalWatchlist";
import CustomWatchlists from "../components/NodalWatchlist/CustomWatchlists";

const NodalWatchlist = () => {
  const navigate = useNavigate();
  const responsivePaddingTop = useResponsivePadding();
  const [activeTab, setActiveTab] = useState<"universal" | "custom">("universal");

  const containerStyle = {
    minHeight: "100vh",
    background: "#f5f5f5",
    padding: "2rem",
    paddingTop: responsivePaddingTop,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    position: "relative" as const,
  };

  const contentWrapperStyle = {
    maxWidth: "1400px",
    margin: "0 auto",
    width: "100%",
  };

  const tabStyle = {
    padding: "0.75rem 1.5rem",
    backgroundColor: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    cursor: "pointer",
    fontSize: "1rem",
    fontFamily: "Montserrat, sans-serif",
    fontWeight: 600,
    color: "#666666",
    transition: "all 0.2s ease",
  };

  const activeTabStyle = {
    ...tabStyle,
    color: "#000000",
    borderBottomColor: "#000000",
  };

  const nodeStyle = {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    backgroundColor: "#000000",
    cursor: "pointer",
    margin: "2rem auto",
    display: "block" as const,
    transition: "opacity 0.2s ease, transform 0.2s ease",
  };

  return (
    <div style={containerStyle} className="about-container">
      <PageHeader />
      <div style={contentWrapperStyle}>
        <h1
          style={{
            fontFamily: "Montserrat, sans-serif",
            fontSize: "2.5rem",
            fontWeight: 700,
            color: "#000000",
            marginBottom: "2rem",
            textAlign: "center",
          }}
        >
          Nodal Watchlist Tool
        </h1>

        <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem", justifyContent: "center" }}>
          <button
            onClick={() => setActiveTab("universal")}
            style={activeTab === "universal" ? activeTabStyle : tabStyle}
          >
            Universal Watchlist
          </button>
          <button
            onClick={() => setActiveTab("custom")}
            style={activeTab === "custom" ? activeTabStyle : tabStyle}
          >
            Custom Watchlists
          </button>
        </div>

        {activeTab === "universal" ? <UniversalWatchlist /> : <CustomWatchlists />}

        <div
          onClick={() => navigate("/")}
          style={nodeStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.7";
            e.currentTarget.style.transform = "scale(1.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
            e.currentTarget.style.transform = "scale(1)";
          }}
        />
      </div>
      <Footer />
    </div>
  );
};

export default NodalWatchlist;
