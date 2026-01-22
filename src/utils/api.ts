/**
 * Get the base API URL, ensuring it doesn't have a trailing /api
 */
export const getApiUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_URL || "http://localhost:3001";
  // Remove trailing /api if present
  return envUrl.replace(/\/api\/?$/, "");
};

/**
 * Build a full API endpoint URL
 */
export const getApiEndpoint = (endpoint: string): string => {
  const baseUrl = getApiUrl();
  // Ensure endpoint starts with /
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${baseUrl}${cleanEndpoint}`;
};
