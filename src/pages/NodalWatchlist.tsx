import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import Footer from "../components/Footer";
import { useResponsivePadding } from "../hooks/useResponsivePadding";
import UniversalWatchlist from "../components/NodalWatchlist/UniversalWatchlist";
import CustomWatchlists from "../components/NodalWatchlist/CustomWatchlists";
import AiBuildoutWatchlist from "../components/NodalWatchlist/AiBuildoutWatchlist";
import { verifyToolPassword } from "../utils/adminApi";
import {
  RESOURCE_TAB_AI_BUILDOUT,
  RESOURCE_TAB_WATCHLIST,
  RESOURCE_TAB_AREAS_OF_INTEREST_LABEL,
} from "../utils/watchlistCacheApi";

const NodalWatchlist = () => {
  const navigate = useNavigate();
  const responsivePaddingTop = useResponsivePadding();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(RESOURCE_TAB_WATCHLIST);

  useEffect(() => {
    if (!isAdmin && activeTab === "universal") {
      setActiveTab(RESOURCE_TAB_WATCHLIST);
    }
  }, [isAdmin, activeTab]);

  const handleUnlock = async () => {
    const password = adminPassword.trim();
    if (!password) {
      setPasswordError("Please enter a password.");
      return;
    }

    setUnlocking(true);
    setPasswordError(null);
    try {
      const result = await verifyToolPassword(password);
      if (!result.ok) {
        setPasswordError(result.error || "Incorrect password.");
        return;
      }
      setIsAdmin(true);
      setAdminPassword("");
      setPasswordError(null);
    } catch (e: any) {
      setPasswordError(e?.message || "Failed to validate password.");
    } finally {
      setUnlocking(false);
    }
  };

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

  const getTabStyle = (tab: string) => ({
    ...tabStyle,
    color: activeTab === tab ? "#000000" : "#666666",
    borderBottom:
      activeTab === tab ? "2px solid #000000" : "2px solid transparent",
  });

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
          Resources
        </h1>

        <div
          style={{
            display: "flex",
            gap: "1rem",
            marginBottom: "2rem",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {isAdmin && (
            <button
              onClick={() => setActiveTab("universal")}
              style={getTabStyle("universal")}
            >
              Universal Watchlist
            </button>
          )}
          <button
            onClick={() => setActiveTab(RESOURCE_TAB_WATCHLIST)}
            style={getTabStyle(RESOURCE_TAB_WATCHLIST)}
          >
            {RESOURCE_TAB_AREAS_OF_INTEREST_LABEL}
          </button>
          <button
            onClick={() => setActiveTab(RESOURCE_TAB_AI_BUILDOUT)}
            style={getTabStyle(RESOURCE_TAB_AI_BUILDOUT)}
          >
            AI Buildout
          </button>
        </div>

        {activeTab === "universal" && isAdmin ? (
          <UniversalWatchlist />
        ) : activeTab === RESOURCE_TAB_AI_BUILDOUT ? (
          <AiBuildoutWatchlist isAdmin={isAdmin} />
        ) : (
          <CustomWatchlists
            key={activeTab}
            isAdmin={isAdmin}
            resourceTab={activeTab}
          />
        )}

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

        {!isAdmin && (
          <div
            style={{
              marginTop: "1rem",
              padding: "1.25rem",
              borderRadius: "8px",
              backgroundColor: "#ffffff",
              border: "1px solid #e5e7eb",
              maxWidth: "480px",
              marginInline: "auto",
              width: "100%",
            }}
          >
            <h2
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontSize: "1rem",
                fontWeight: 600,
                marginBottom: "0.5rem",
                textAlign: "center",
              }}
            >
              Admin Tools
            </h2>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => {
                  setAdminPassword(e.target.value);
                  if (passwordError) setPasswordError(null);
                }}
                placeholder="Enter admin password"
                style={{
                  flex: 1,
                  padding: "0.6rem 0.75rem",
                  borderRadius: "4px",
                  border: "1px solid #d1d5db",
                  fontSize: "0.875rem",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleUnlock();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => void handleUnlock()}
                disabled={unlocking}
                style={{
                  padding: "0.6rem 1rem",
                  backgroundColor: "#000000",
                  color: "#ffffff",
                  borderRadius: "6px",
                  border: "none",
                  cursor: unlocking ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  opacity: unlocking ? 0.6 : 1,
                }}
              >
                {unlocking ? "Checking…" : "Unlock"}
              </button>
            </div>
            {passwordError && (
              <p
                style={{
                  margin: "0.75rem 0 0",
                  color: "#dc2626",
                  fontSize: "0.875rem",
                  textAlign: "center",
                }}
              >
                {passwordError}
              </p>
            )}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default NodalWatchlist;
