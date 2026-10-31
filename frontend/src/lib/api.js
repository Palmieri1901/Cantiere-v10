import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
  timeout: 30000,
});

// Interceptor: su 401 reindirizza al login (sessione scaduta o mancante)
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err?.response?.status;
    const url = err?.config?.url || "";
    // Evita loop se già sulla pagina di login o su endpoint di auth
    if (status === 401 && !url.includes("/auth/")) {
      const path = window.location.pathname;
      if (!path.startsWith("/login") && !path.startsWith("/forgot-password") && !path.startsWith("/reset-password") && !path.startsWith("/app-dipendente") && !path.startsWith("/recupero-pin")) {
        window.location.replace(`/login?redirect=${encodeURIComponent(path)}`);
      }
    }
    return Promise.reject(err);
  }
);

export const prezzoIvato = (a) => +(Number(a?.prezzo_listino_ivato || 0) || Number(a?.prezzo_listino || 0) * 1.22).toFixed(2);

export const fmtEuro = (n) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n || 0);

export const fmtNum = (n, digits = 1) =>
  new Intl.NumberFormat("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(n || 0);
