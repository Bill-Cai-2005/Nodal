import type { CSSProperties } from "react";

export const primaryActionButtonStyle: CSSProperties = {
  padding: "0.75rem 1.5rem",
  minWidth: "240px",
  minHeight: "44px",
  backgroundColor: "#000000",
  color: "#ffffff",
  border: "none",
  borderRadius: "6px",
  fontSize: "0.875rem",
  fontWeight: 600,
  fontFamily: "Montserrat, sans-serif",
  boxSizing: "border-box",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

export const compactActionButtonStyle: CSSProperties = {
  padding: "0.75rem 1rem",
  backgroundColor: "#000000",
  color: "#ffffff",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 600,
  fontFamily: "Montserrat, sans-serif",
};

export const refreshWatchlistsToolbarStyle: CSSProperties = {
  display: "flex",
  gap: "1rem",
  justifyContent: "center",
  flexWrap: "wrap",
  marginBottom: "1rem",
  minHeight: "44px",
  alignItems: "center",
};
