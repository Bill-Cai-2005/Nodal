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

  const footerStyle = {
    position: "fixed" as const,
    bottom: "40px",
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  };

  const footerLinkStyle = {
    fontFamily: "Montserrat, sans-serif",
    fontSize: "0.875rem",
    color: "#333333",
    textDecoration: "underline",
    cursor: "pointer",
    transition: "opacity 0.2s ease",
  };

  return (
    <div style={containerStyle}>
      <PageHeader />
      <img 
        src="/NodalLogo.png" 
        alt="Nodal" 
        style={logoStyle}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column" as const,
          alignItems: "center",
          gap: "1.5rem",
          marginTop: "2rem",
        }}
      >
        <div
          onClick={() => navigate("/blogs")}
          style={{
            fontFamily: "Montserrat, sans-serif",
            fontSize: "1.25rem",
            color: "#000000",
            cursor: "pointer",
            textDecoration: "none",
            transition: "opacity 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.7";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
        >
          Research
        </div>
        <div
          onClick={() => navigate("/about")}
          style={{
            fontFamily: "Montserrat, sans-serif",
            fontSize: "1.25rem",
            color: "#8B0000",
            cursor: "pointer",
            textDecoration: "none",
            transition: "opacity 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.7";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
        >
          About
        </div>
        <div
          onClick={() => navigate("/newsletter")}
          style={{
            fontFamily: "Montserrat, sans-serif",
            fontSize: "1.25rem",
            color: "#000000",
            cursor: "pointer",
            textDecoration: "none",
            transition: "opacity 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.7";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
        >
          Newsletter
        </div>
      </div>
      <div className="mobile-footer" style={footerStyle}>
        <span
          onClick={() => navigate("/legal")}
          style={footerLinkStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.7";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
        >
          Legal Disclaimer
        </span>
      </div>
    </div>
  );
};

export default MobileHome;
