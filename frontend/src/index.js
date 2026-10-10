import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));

if ("serviceWorker" in navigator && (window.location.pathname.startsWith("/app-dipendente") || window.location.hostname.startsWith("lavori."))) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
// Errori generici di script esterni (es. proxy/CDN) non devono bloccare l'app con l'overlay di sviluppo
window.addEventListener("error", (e) => {
  if (e.message === "Script error." && !e.filename) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);

root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
