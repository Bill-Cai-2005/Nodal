import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import Footer from "../components/Footer";
import { useResponsivePadding } from "../hooks/useResponsivePadding";
import UniversalWatchlist from "../components/NodalWatchlist/UniversalWatchlist";
import CustomWatchlists from "../components/NodalWatchlist/CustomWatchlists";
import { verifyToolPassword } from "../utils/adminApi";

const REQUIRE_ADMIN_PASSCODE = true;
const NodalWatchlist = () => {
  const navigate = useNavigate();
  const responsivePaddingTop = useResponsivePadding();
  const [isAdmin, setIsAdmin] = useState<boolean>(!REQUIRE_ADMIN_PASSCODE);
  const [adminPassword, setAdminPassword] = useState("");
  const [activeTab, setActiveTab] = useState<"universal" | "custom">("custom");
  const hasAccess = !REQUIRE_ADMIN_PASSCODE || isAdmin;
  const canViewUniversal = hasAccess;

  useEffect(() => {
    if (!canViewUniversal) {
      setActiveTab("custom");
    }
  }, [canViewUniversal]);

  const handleUnlock = async () => {
    if (!adminPassword.trim()) {
      alert("Please enter a password");
      return;
    }

    try {
      const result = await verifyToolPassword(adminPassword.trim());
      if (!result.ok) {
        alert(result.error || "Incorrect password");
        return;
      }
      setIsAdmin(true);
      setAdminPassword("");
    } catch (e: any) {
      alert(e?.message || "Failed to validate password");
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

  const getTabStyle = (tab: "universal" | "custom") => ({
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
          Watchlist
        </h1>

        <>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              marginBottom: "2rem",
              justifyContent: "center",
            }}
          >
            {canViewUniversal && (
              <button onClick={() => setActiveTab("universal")} style={getTabStyle("universal")}>
                Universal Watchlist
              </button>
            )}
            <button onClick={() => setActiveTab("custom")} style={getTabStyle("custom")}>
              Custom Watchlists
            </button>
          </div>

          {activeTab === "universal" ? (
            <UniversalWatchlist />
          ) : (
            <CustomWatchlists isAdmin={hasAccess} />
          )}
        </>

        {REQUIRE_ADMIN_PASSCODE && !hasAccess && (
          <div
            style={{
              textAlign: "center",
              color: "#666666",
              marginBottom: "1.5rem",
            }}
          >
            Enter the admin password to access tools.
          </div>
        )}

        {REQUIRE_ADMIN_PASSCODE && !hasAccess && (
          <div
            style={{
              marginTop: "2rem",
              marginBottom: "1.5rem",
              padding: "1rem 1.25rem",
              borderRadius: "8px",
              backgroundColor: "#ffffff",
              border: "1px solid #e5e7eb",
              maxWidth: "420px",
              marginInline: "auto",
            }}
          >
            <h2
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontSize: "1rem",
                fontWeight: 600,
                marginBottom: "0.75rem",
              }}
            >
              Admin Tools
            </h2>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Enter admin password"
                style={{
                  flex: 1,
                  padding: "0.5rem 0.75rem",
                  borderRadius: "4px",
                  border: "1px solid #d1d5db",
                  fontSize: "0.875rem",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleUnlock();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleUnlock}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "#000000",
                  color: "#ffffff",
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                Unlock
              </button>
            </div>
          </div>
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
      </div>
      <Footer />
    </div>
  );
};

export default NodalWatchlist;
