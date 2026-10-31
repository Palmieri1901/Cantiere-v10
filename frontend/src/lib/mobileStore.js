import axios from "axios";

const KEYS = { key: "pm_mobile_key", nome: "pm_mobile_nome", clienti: "pm_mobile_clienti", articoli: "pm_mobile_articoli", coda: "pm_mobile_coda", url: "pm_mobile_url", funzioni: "pm_mobile_funzioni" };

const read = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

export const mobileStore = {
  getKey: () => localStorage.getItem(KEYS.key) || "",
  getNome: () => localStorage.getItem(KEYS.nome) || "",
  getFunzioni: () => read(KEYS.funzioni, null),
  setFunzioni: (v) => write(KEYS.funzioni, v),
  puo: (f) => { const l = read(KEYS.funzioni, null); return l === null || l.includes(f); },
  getUrl: () => localStorage.getItem(KEYS.url) || (window.location.hostname.startsWith("lavori.") ? window.location.origin : process.env.REACT_APP_BACKEND_URL),
  login: (key, nome, url) => { localStorage.setItem(KEYS.key, key); localStorage.setItem(KEYS.nome, nome); if (url) localStorage.setItem(KEYS.url, url); },
  logout: () => Object.values(KEYS).forEach((k) => localStorage.removeItem(k)),
  clienti: () => read(KEYS.clienti, []),
  articoli: () => read(KEYS.articoli, []),
  coda: () => read(KEYS.coda, []),
  setClienti: (v) => write(KEYS.clienti, v),
  setArticoli: (v) => write(KEYS.articoli, v),
  setCoda: (v) => write(KEYS.coda, v),
};

export const mobileApi = () => axios.create({
  baseURL: `${mobileStore.getUrl()}/api/mobile`,
  headers: { "X-Api-Key": mobileStore.getKey() },
  timeout: 20000,
});

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
