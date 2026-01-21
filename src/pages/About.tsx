import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";

const About = () => {
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
      <div className="container">
        <img 
          src="/NodalLogo.png" 
          alt="Nodal" 
          style={logoStyle}
        />
        <div style={contentWrapperStyle} className="about-content">
          <p style={paragraphStyle}>
            Nodal is an equity research collective.
          </p>
          <p style={paragraphStyle}>
            We manage a portfolio of 1.2 Million USD to invest in our research.
          </p>
          <h1 style={sectionTitleStyle}>A note from the founder</h1>
          <p style={paragraphStyle}>
            I bought my first stock at 13 in 2018.
            I immediately fell in love. Not with the money, but with the game.
          </p>
          <p style={paragraphStyle}>
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
          <p style={paragraphStyle}>
            Marble has since grown to 1.2 Million USD averaging 70% over 3 years
          </p>
          <p style={paragraphStyle}>
            Looking back these numbers don't really mean anything.
          </p>
          <p style={paragraphStyle}>
            I'm dedicating my next few years to craftng a killer team and sharing the absolute best research time can buy.
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

export default About;
