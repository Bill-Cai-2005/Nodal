import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import Footer from "../components/Footer";
import { useResponsivePadding } from "../hooks/useResponsivePadding";

const Newsletter = () => {
  const navigate = useNavigate();
  const responsivePaddingTop = useResponsivePadding();

  const containerStyle = {
    minHeight: "100vh",
    background: "#f5f5f5",
    padding: "2rem",
    paddingTop: responsivePaddingTop, // Responsive padding based on screen height
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
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
  };

  const contentWrapperStyle = {
    maxWidth: "700px",
    margin: "0 auto 3rem",
    textAlign: "center" as const,
    width: "100%",
  };

  const titleStyle = {
    fontFamily: "Montserrat, sans-serif",
    fontSize: "2.5rem",
    fontWeight: 700,
    color: "#000000",
    marginBottom: "2rem",
    textAlign: "center" as const,
  };

  const paragraphStyle = {
    fontFamily: "Montserrat, sans-serif",
    fontSize: "1.25rem",
    lineHeight: "1.8",
    color: "#333333",
    marginBottom: "1.5rem",
    fontWeight: 400,
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
      <div className="container" style={{ marginTop: "100px" }}>
        <img 
          src="/NodalLogo.png" 
          alt="Nodal" 
          style={{...logoStyle, cursor: "pointer"}}
          onClick={() => navigate("/")}
        />
        <div style={contentWrapperStyle} className="about-content">
          <h1 style={titleStyle} className="newsletter-title">Newsletter</h1>
          <p style={paragraphStyle}>
            Coming soon.
          </p>
        </div>
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

export default Newsletter;
