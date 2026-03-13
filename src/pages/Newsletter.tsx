import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import Footer from "../components/Footer";
import { useResponsivePadding } from "../hooks/useResponsivePadding";

const Watchlist = () => {
  const navigate = useNavigate();
  const responsivePaddingTop = useResponsivePadding();

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

  const comingSoonCardStyle = {
    maxWidth: "760px",
    margin: "0 auto",
    backgroundColor: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    padding: "2rem",
    textAlign: "center" as const,
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
          Newsletter
        </h1>

        <div style={comingSoonCardStyle}>
          <h2
            style={{
              fontFamily: "Montserrat, sans-serif",
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#000000",
              marginBottom: "0.75rem",
            }}
          >
            Coming Soon
          </h2>
          <p
            style={{
              fontFamily: "Montserrat, sans-serif",
              fontSize: "1rem",
              color: "#4b5563",
              lineHeight: 1.6,
              maxWidth: "560px",
              margin: "0 auto",
            }}
          >
            We are building a newsletter experience for market notes, watchlist updates, and periodic insights.
            Check back soon.
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

export default Watchlist;

