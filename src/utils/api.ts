/**
 * Get the base API URL
 * For Render backend: Set VITE_API_URL=https://your-app.onrender.com
 * For local dev: defaults to http://localhost:3001
 */
export const getApiUrl = (): string => {
  return import.meta.env.VITE_API_URL || "http://localhost:3001";
};

/**
 * Build a full API endpoint URL
 * The endpoint should already include /api (e.g., "/api/blogs")
 * This function just combines baseUrl + endpoint
 */
export const getApiEndpoint = (endpoint: string): string => {
  const baseUrl = getApiUrl();
  // Ensure endpoint starts with /
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  
  // Remove trailing slash from baseUrl if present
  const cleanBaseUrl = baseUrl.replace(/\/$/, "");
  
  return `${cleanBaseUrl}${cleanEndpoint}`;
};
