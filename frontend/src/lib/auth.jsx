import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import AppLock from "@/components/AppLock";
import { isMobile, resetSblocco } from "@/lib/passkey";

const AuthCtx = createContext(null);
const PC_KEY = "geb_pc_sessione"; // su PC la password va reinserita a ogni apertura del browser/scheda

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=checking, false=guest, obj=authed
  const [loading, setLoading] = useState(true);

  const check = async () => {
    try {
      if (!isMobile() && !sessionStorage.getItem(PC_KEY)) {
        try { await api.post("/auth/logout"); } catch {}
        setUser(false);
        return;
      }
      const r = await api.get("/auth/me");
      setUser(r.data);
    } catch {
      setUser(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (window.location.pathname.startsWith("/app-dipendente")) { setUser(false); setLoading(false); } else check(); }, []);

  const login = async (password) => {
    const r = await api.post("/auth/login", { password });
    sessionStorage.setItem(PC_KEY, "1");
    setUser({ id: r.data.id, email: r.data.email, nome: r.data.nome, role: r.data.role });
    return r.data;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    sessionStorage.removeItem(PC_KEY);
    resetSblocco();
    setUser(false);
  };

  const inner = user && user !== false && !window.location.pathname.startsWith("/app-dipendente")
    ? <AppLock client={api} base="/webauthn" onPassword={logout} passwordLabel="Esci e usa la password">{children}</AppLock>
    : children;

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, refresh: check }}>
      {inner}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
