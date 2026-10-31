import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { ConfirmHost } from "@/components/ConfirmDialog";
import { YearProvider } from "@/lib/year";
import { AuthProvider } from "@/lib/auth";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Clienti from "@/pages/Clienti";
import Tariffe from "@/pages/Tariffe";
import PostiBarca from "@/pages/PostiBarca";
import Impostazioni from "@/pages/Impostazioni";
import ImpostazioniRimessaggio from "@/pages/ImpostazioniRimessaggio";
import Report from "@/pages/Report";
import Contratti from "@/pages/Contratti";
import Magazzino from "@/pages/Magazzino";
import Tubolari from "@/pages/Tubolari";
import Suzuki from "@/pages/Suzuki";
import Gommoni from "@/pages/Gommoni";
import Ddt from "@/pages/Ddt";
import Dipendenti from "@/pages/Dipendenti";
import LavorazioniEsterne from "@/pages/LavorazioniEsterne";
import DocumentiServizio from "@/pages/DocumentiServizio";
import AppDipendente from "@/pages/AppDipendente";
import Login from "@/pages/Login";
import RecuperoPin from "@/pages/RecuperoPin";
import Capitaneria from "@/pages/Capitaneria";
import LavagnaPage from "@/pages/LavagnaPage";
import LaserLogo from "@/pages/laser/LaserLogo";
import Mezzi from "@/pages/Mezzi";
import Calendario from "@/pages/Calendario";
import Anagrafica from "@/pages/Anagrafica";
import Officina from "@/pages/Officina";
import ValutazioniUsato from "@/pages/ValutazioniUsato";
import { isAppDipendentiHost } from "@/lib/appHost";

function App() {
  if (isAppDipendentiHost()) {
    return (
      <div className="App">
        <BrowserRouter>
          <Routes>
            <Route path="*" element={<AppDipendente />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
        <ConfirmHost />
      </div>
    );
  }
  return (
    <div className="App">
      <AuthProvider>
        <YearProvider>
          <BrowserRouter>
            <Routes>
              {/* Rotte pubbliche */}
              <Route path="/login" element={<Login />} />
              <Route path="/recupero-pin" element={<RecuperoPin />} />
              <Route path="/app-dipendente" element={<AppDipendente />} />
              <Route path="/forgot-password" element={<Navigate to="/recupero-pin" replace />} />
              <Route path="/reset-password" element={<Navigate to="/recupero-pin" replace />} />

              {/* Rotte protette */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Home />
                  </ProtectedRoute>
                }
              />
              <Route
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/clienti" element={<Clienti />} />
                <Route path="/anagrafica" element={<Anagrafica />} />
                <Route path="/officina" element={<Officina />} />
                <Route path="/valutazioni" element={<ValutazioniUsato />} />
                <Route path="/posti-barca" element={<PostiBarca />} />
                <Route path="/tariffe" element={<Tariffe />} />
                <Route path="/impostazioni" element={<Impostazioni />} />
                <Route path="/rimessaggio/impostazioni" element={<ImpostazioniRimessaggio />} />
                <Route path="/report" element={<Report />} />
                <Route path="/contratti" element={<Contratti />} />
                <Route path="/magazzino" element={<Magazzino />} />
                <Route path="/tubolari" element={<Tubolari />} />
                <Route path="/suzuki" element={<Suzuki />} />
                <Route path="/gommoni" element={<Gommoni />} />
                <Route path="/ddt" element={<Ddt />} />
                <Route path="/dipendenti" element={<Dipendenti />} />
                <Route path="/esterni" element={<LavorazioniEsterne />} />
                <Route path="/servizio" element={<DocumentiServizio />} />
                <Route path="/capitaneria" element={<Capitaneria />} />
                <Route path="/lavagna" element={<LavagnaPage />} />
                <Route path="/laser" element={<LaserLogo />} />
                <Route path="/mezzi" element={<Mezzi />} />
                <Route path="/calendario" element={<Calendario />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </YearProvider>
      </AuthProvider>
      <Toaster position="top-right" richColors />
      <ConfirmHost />
    </div>
  );
}

export default App;
