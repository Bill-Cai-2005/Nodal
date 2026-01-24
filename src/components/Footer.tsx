import { useNavigate } from "react-router-dom";

const Footer = () => {
  const navigate = useNavigate();

  return (
    <div
      className="desktop-footer"
      style={{
        position: "fixed",
        bottom: "40px",
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 10,
      }}
    >
      <span
        onClick={() => navigate("/legal")}
        style={{
          fontFamily: "Montserrat, sans-serif",
          fontSize: "0.875rem",
          color: "#333333",
          textDecoration: "underline",
          cursor: "pointer",
          transition: "opacity 0.2s ease",
        }}
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
  );
};

export default Footer;
