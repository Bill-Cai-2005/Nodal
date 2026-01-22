import { useNavigate } from "react-router-dom";

interface PageHeaderProps {
  researchColor?: string;
  zIndex?: number;
}

const PageHeader = ({ researchColor = "#000000", zIndex = 10 }: PageHeaderProps) => {
  const navigate = useNavigate();

  return (
    <div
      className="page-header-container"
      style={{
        position: "absolute",
        top: "40px",
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        paddingLeft: "40px",
        paddingRight: "40px",
        zIndex: zIndex,
      }}
    >
      <div
        onClick={() => navigate("/")}
        className="page-header-title"
        style={{
          fontFamily: "Montserrat, sans-serif",
          fontWeight: 700,
          fontSize: "2rem",
          cursor: "pointer",
          transition: "opacity 0.2s ease",
          lineHeight: 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "0.7";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "1";
        }}
      >
        <span style={{ color: "#8B0000" }}>Nodal</span>{" "}
        <span style={{ color: researchColor }}>Research</span>
      </div>
      <div
        onClick={() => navigate("/legal")}
        className="header-red-node"
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          backgroundColor: "#8B0000",
          cursor: "pointer",
          transition: "opacity 0.2s ease, transform 0.2s ease",
        }}
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
  );
};

export default PageHeader;
