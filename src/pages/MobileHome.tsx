import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";

const MobileHome = () => {
  const navigate = useNavigate();

  const containerStyle = {
    minHeight: "100vh",
    width: "100%",
    background: "#f5f5f5",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    padding: "2rem 1rem",
    paddingTop: "140px",
    position: "relative" as const,
  };

  const logoStyle = {
    marginBottom: "3rem",
    marginLeft: "auto",
    marginRight: "auto",
    display: "block",
    maxWidth: "150px",
    width: "auto",
    height: "auto",
    marginTop: "20px",
  };

  const nodeStyle = {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    cursor: "pointer",
    marginBottom: "2rem",
    transition: "opacity 0.2s ease, transform 0.2s ease",
  };

  const nodesContainerStyle = {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "2rem",
    marginTop: "2rem",
  };

  const footerStyle = {
    position: "fixed" as const,
    bottom: 0,
    left: 0,
    right: 0,
    padding: "1rem",
    textAlign: "center" as const,
    backgroundColor: "#8B0000",
    borderTop: "1px solid #e0e0e0",
    fontFamily: "Montserrat, sans-serif",
    fontSize: "0.875rem",
  };

  const footerLinkStyle = {
    color: "#ffffff",
    textDecoration: "underline",
    cursor: "pointer",
  };

  return (
    <div style={containerStyle}>
      <PageHeader />
      <img 
        src="/NodalLogo.png" 
        alt="Nodal" 
        style={logoStyle}
      />
      <div style={nodesContainerStyle}>
        <div
          onClick={() => navigate("/blogs")}
          style={{...nodeStyle, backgroundColor: "#000000"}}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.7";
            e.currentTarget.style.transform = "scale(1.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
            e.currentTarget.style.transform = "scale(1)";
          }}
        />
        <div
          onClick={() => navigate("/about")}
          style={{...nodeStyle, backgroundColor: "#8B0000"}}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.7";
            e.currentTarget.style.transform = "scale(1.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
            e.currentTarget.style.transform = "scale(1)";
          }}
        />
      </div>
      <div className="mobile-footer" style={footerStyle}>
        <span
          onClick={() => navigate("/legal")}
          style={footerLinkStyle}
        >
          Legal Disclaimer
        </span>
      </div>
    </div>
  );
};

export default MobileHome;
