import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import Footer from "../components/Footer";
import { useResponsivePadding } from "../hooks/useResponsivePadding";

const About = () => {
  const navigate = useNavigate();
  const responsivePaddingTop = useResponsivePadding();

  // Shared styles
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

  const linkStyle = {
    color: "#8B0000",
    textDecoration: "underline",
    textDecorationColor: "#8B0000",
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
          <p style={paragraphStyle} className="about-paragraph">
            Nodal is an equity research collective.
          </p>
          <p style={paragraphStyle} className="about-paragraph">
            We commit 1.2 Million USD of internal capital to our research.
          </p>
          <p style={paragraphStyle} className="about-paragraph mobile-marble-note">
            We were previously {" "}
            <a
              href="https://www.marbleinvestments.ca/"
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              Marble-Investments
            </a>
            .
          </p>
          <h1 style={sectionTitleStyle} className="about-section-title founder-note">A note from the founder</h1>
          <p style={paragraphStyle} className="about-paragraph founder-note">
            At 18 I started {" "}
            <a
              href="https://www.marbleinvestments.ca/"
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              Marble-Investments
            </a>
            {" "}to prove myself to the world.
          </p>
          <p style={paragraphStyle} className="about-paragraph founder-note">
            In 3 years Marble grew to 1.2 Million USD averaging 70% returns.
          </p>
          <p style={paragraphStyle} className="about-paragraph founder-note">
            Looking back these numbers don't really mean anything.
          </p>
          <p style={paragraphStyle} className="about-paragraph founder-note">
            I'm dedicating my next few years to sharing the absolute best research time can buy.
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

export default About;
