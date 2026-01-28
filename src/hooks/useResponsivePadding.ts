import { useState, useEffect } from "react";

/**
 * Hook to calculate responsive paddingTop based on viewport height
 * Adjusts padding for different screen sizes (MacBook Air vs Desktop)
 */
export const useResponsivePadding = () => {
  const [paddingTop, setPaddingTop] = useState("140px");

  useEffect(() => {
    const calculatePadding = () => {
      const viewportHeight = window.innerHeight;
      
      // For smaller screens (MacBook Air ~800px height), use much less padding
      if (viewportHeight < 900) {
        setPaddingTop("100px");
      } 
      // For medium screens (standard laptops ~900-1000px)
      else if (viewportHeight < 1100) {
        setPaddingTop("115px");
      }
      // For larger screens (desktop monitors >1100px), use standard padding
      else {
        setPaddingTop("140px");
      }
    };

    // Calculate on mount
    calculatePadding();

    // Recalculate on resize
    window.addEventListener("resize", calculatePadding);
    return () => window.removeEventListener("resize", calculatePadding);
  }, []);

  return paddingTop;
};
