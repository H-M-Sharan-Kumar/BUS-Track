import axios from "axios";

// In production (served from Express), use relative URLs
// In dev (Vite proxy), also use relative URLs
// VITE_API_URL can override for external deployments
const BASE = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({ baseURL: BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
