import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import Footer from "../components/Footer";
import { useResponsivePadding } from "../hooks/useResponsivePadding";

const Newsletter = () => {
  const navigate = useNavigate();
  const responsivePaddingTop = useResponsivePadding();

  const logoStyle = {
    marginBottom: "3rem",
    marginLeft: "auto",
    marginRight: "auto",
    display: "block",
    maxWidth: "150px",
    width: "auto",
    height: "auto",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f5f5",
        padding: "2rem",
        paddingTop: responsivePaddingTop,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
      }}
      className="about-container"
    >
      <PageHeader />
      <div style={{ maxWidth: "900px", margin: "0 auto", width: "100%" }}>
        <div className="container" style={{ marginTop: "100px" }}>
          <img 
            src="/NodalLogo.png" 
            alt="Nodal" 
            style={{...logoStyle, cursor: "pointer"}}
            onClick={() => navigate("/")}
          />

          <div style={{ width: "100%" }}>
            <div
              style={{
                background: "#ffffff",
                padding: "2rem",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
                display: "flex",
                flexDirection: "column",
                width: "100%",
                maxWidth: "900px",
                margin: "0 auto",
              }}
            >
              <h2
                style={{
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: "#000000",
                  textAlign: "center",
                }}
              >
                Newsletter - Coming Soon
              </h2>
            </div>
          </div>
          <div
            onClick={() => navigate("/")}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              backgroundColor: "#000000",
              cursor: "pointer",
              margin: "2rem auto",
              display: "block",
              transition: "opacity 0.2s ease, transform 0.2s ease",
            }}
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
      <Footer />
    </div>
  );
};

export default Newsletter;

