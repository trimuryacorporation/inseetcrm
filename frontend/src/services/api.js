import { resolveApiBaseUrl } from "../utils/apiBaseUrl";
import axios from "axios";
import { useAuth } from "../store/auth";
export const api = axios.create({
  baseURL: resolveApiBaseUrl(import.meta.env.VITE_API_URL),
  withCredentials: true,
});
api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) config.headers.Authorization = "Bearer " + token;
  return config;
});
let refreshing;
export async function restore() {
  if (!refreshing)
    refreshing = api
      .post("/auth/refresh")
      .then((r) => {
        useAuth.getState().setSession(r.data);
        return r.data;
      })
      .finally(() => {
        refreshing = null;
      });
  return refreshing;
}
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const config = error.config;
    if (
      error.response?.status === 401 &&
      !config._retry &&
      !config.url.startsWith("/auth/")
    ) {
      config._retry = true;
      try {
        await restore();
        return api(config);
      } catch {
        useAuth.getState().clear();
      }
    }
    return Promise.reject(error);
  },
);
export const message = (e) =>
  e.response?.data?.message ||
  "Cannot reach the server. Check that the API is running.";
