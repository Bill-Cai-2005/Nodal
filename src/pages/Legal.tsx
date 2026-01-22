import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";

const Legal = () => {
  const navigate = useNavigate();

  // Shared styles
  const containerStyle = {
    minHeight: "100vh",
    background: "#f5f5f5",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
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
    textAlign: "left" as const,
    width: "100%",
  };

  const paragraphStyle = {
    fontFamily: "Montserrat, sans-serif",
    fontSize: "1.25rem",
    lineHeight: "1.8",
    color: "#333333",
    marginBottom: "1.5rem",
    fontWeight: 400,
  };

  const sectionTitleStyle = {
    fontFamily: "Montserrat, sans-serif",
    fontSize: "1.5rem",
    fontWeight: 500,
    color: "#000000",
    marginBottom: "1.5rem",
    textAlign: "left" as const,
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
          style={logoStyle}
        />
        <div style={contentWrapperStyle} className="about-content">
          <h1 style={sectionTitleStyle}>Legal Disclaimer: Nodal Research</h1>
          
          <h2 style={sectionTitleStyle}>1. General Information & Non-Advisory Nature</h2>
          <p style={paragraphStyle}>
            All content provided by Nodal Research (the "Collective") is for informational and educational purposes only. Nodal Research is a private research collective, not a registered investment advisor, portfolio manager, or broker-dealer in Canada, the United States, or any other jurisdiction. No content published by the Collective constitutes a recommendation to buy, sell, or hold any security.
          </p>

          <h2 style={sectionTitleStyle}>2. Disclosure of Positions & Conflicts of Interest</h2>
          <p style={paragraphStyle}>
            Nodal Research manages a long-only thematic fund with approximately $1.2M USD in Assets Under Management (AUM). The Collective and its members actively deploy their own capital into the securities discussed in our research.
          </p>
          <p style={paragraphStyle}>
            <strong>Conflict of Interest:</strong> Readers should assume that Nodal Research and/or its members hold a long position in any security mentioned and stand to profit from an increase in the price of those securities.
          </p>
          <p style={paragraphStyle}>
            <strong>Trading Policy:</strong> We may buy or sell securities at any time without notice. We do not guarantee that we will update our research if our position in a security changes.
          </p>

          <h2 style={sectionTitleStyle}>3. Risk Disclosure & US Equities</h2>
          <p style={paragraphStyle}>
            Investing in US equities involves significant risks, including market volatility and currency exchange fluctuations (CAD/USD). Past performance is no guarantee of future results. The $1.2M AUM figure is a reflection of current capital deployed and is not an endorsement of future performance. You are solely responsible for your own investment decisions.
          </p>

          <h2 style={sectionTitleStyle}>4. No Solicitation</h2>
          <p style={paragraphStyle}>
            This research is not an offer to sell or a solicitation of an offer to buy any security. Nodal Research does not manage outside capital or offer investment services to the public.
          </p>

          <h2 style={sectionTitleStyle}>5. Accuracy of Information</h2>
          <p style={paragraphStyle}>
            While Nodal Research seeks to provide high-quality, data-driven analysis, all information is provided "as is." We make no representations as to the accuracy, completeness, or timeliness of the information provided.
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
    </div>
  );
};

export default Legal;
