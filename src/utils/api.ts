/**
 * Get the base API URL, ensuring it doesn't have a trailing /api
 * For Vercel deployments, use relative paths when VITE_API_URL is not set
 */
export const getApiUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;
  
  // If VITE_API_URL is not set, assume same domain (Vercel deployment)
  if (!envUrl) {
    return ""; // Relative path - same domain
  }
  
  // Remove trailing /api if present
  return envUrl.replace(/\/api\/?$/, "");
};

/**
 * Build a full API endpoint URL
 */
export const getApiEndpoint = (endpoint: string): string => {
  const baseUrl = getApiUrl();
  // Ensure endpoint starts with /api
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const apiPath = cleanEndpoint.startsWith("/api") ? cleanEndpoint : `/api${cleanEndpoint}`;
  
  // If baseUrl is empty (relative path), just return the API path
  if (!baseUrl) {
    return apiPath;
  }
  
  return `${baseUrl}${apiPath}`;
};
