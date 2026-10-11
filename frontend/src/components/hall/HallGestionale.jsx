import { useCallback } from "react";
import { api } from "@/lib/api";
import HallWidget from "./HallWidget";

export default function HallGestionale() {
  const interpreta = useCallback((testo, storia) => api.post("/assistente/interpreta", { testo, storia }).then((r) => r.data), []);
  const esegui = useCallback((azione, parametri) => api.post("/assistente/esegui", { azione, parametri }).then((r) => r.data), []);
  return <HallWidget interpreta={interpreta} esegui={esegui} />;
}
