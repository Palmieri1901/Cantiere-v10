import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, Link, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, Grid3x3, Settings2, Sailboat, Building2, Home as HomeIcon, FileBarChart, FileSignature, LogOut, User, Package, Ship, ChevronDown, List, SlidersHorizontal, LifeBuoy, Truck, Smartphone, HardHat, FileBadge, Anchor, CalendarDays, BookUser, Wrench, ClipboardList, Crosshair, BadgeEuro } from "lucide-react";
import HallGestionale from "@/components/hall/HallGestionale";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import YearSelector from "@/components/YearSelector";
import { Button } from "@/components/ui/button";

const nav = [
  {
    label: "Rimessaggio",
    icon: Users,
    testId: "nav-rimessaggio",
    children: [
      { to: "/clienti", label: "Elenco clienti", icon: List, testId: "nav-clienti" },
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testId: "nav-dashboard" },
      { to: "/posti-barca", label: "Posti Barca", icon: Grid3x3, testId: "nav-posti-barca" },
      { to: "/report", label: "Report rimessaggio", icon: FileBarChart, testId: "nav-report" },
      { to: "/contratti", label: "Contratti", icon: FileSignature, testId: "nav-contratti" },
      { to: "/tariffe", label: "Tariffe", icon: Settings2, testId: "nav-tariffe" },
      { to: "/rimessaggio/impostazioni", label: "Impostazioni", icon: SlidersHorizontal, testId: "nav-imp-rimessaggio" },
    ],
  },
  { to: "/anagrafica", label: "Anagrafica generale", icon: BookUser, testId: "nav-anagrafica" },
  { section: "Officina" },
  { to: "/magazzino", label: "Magazzino", icon: Package, testId: "nav-magazzino" },
  { to: "/dipendenti", label: "Lavori dal cantiere", icon: Smartphone, testId: "nav-dipendenti", badge: "pending" },
  { to: "/esterni", label: "Lavorazioni esterne", icon: HardHat, testId: "nav-esterni" },
  { to: "/officina", label: "Assistente officina", icon: Wrench, testId: "nav-officina" },
  { to: "/lavagna", label: "Lavagna", icon: ClipboardList, testId: "nav-lavagna" },
  { to: "/laser", label: "LaserLogo", icon: Crosshair, testId: "nav-laser" },
  { to: "/valutazioni", label: "Valutazioni usato", icon: BadgeEuro, testId: "nav-valutazioni" },
  { section: "Vendita" },
  { to: "/tubolari", label: "Tubolari", icon: Ship, testId: "nav-tubolari" },
  { to: "/suzuki", label: "Suzuki", icon: Sailboat, testId: "nav-suzuki" },
  { to: "/gommoni", label: "Gommoni GEB", icon: LifeBuoy, testId: "nav-gommoni" },
  { section: "Documenti" },
  { to: "/ddt", label: "DDT & Destinazione", icon: Truck, testId: "nav-ddt" },
  { to: "/servizio", label: "Banca & Privacy", icon: FileBadge, testId: "nav-servizio" },
  { to: "/capitaneria", label: "Comunicazione Capitaneria", icon: Anchor, testId: "nav-capitaneria" },
  { to: "/mezzi", label: "Consumi e ricavi mezzi", icon: Truck, testId: "nav-mezzi" },
  { to: "/calendario", label: "Calendario", icon: CalendarDays, testId: "nav-calendario" },
  { to: "/impostazioni", label: "Impostazione dati cantiere", icon: Building2, testId: "nav-impostazioni" },
];

// Flatten per la barra mobile
const mobileFlat = [
  { to: "/", label: "Home", icon: HomeIcon, testId: "nav-home-mobile" },
  { to: "/clienti", label: "Rimessaggio", icon: Users, testId: "nav-clienti-mobile" },
  { to: "/magazzino", label: "Magazzino", icon: Package, testId: "nav-magazzino-mobile" },
  { to: "/officina", label: "Officina", icon: Wrench, testId: "nav-officina-mobile" },
  { to: "/tubolari", label: "Tubolari", icon: Ship, testId: "nav-tubolari-mobile" },
  { to: "/suzuki", label: "Suzuki", icon: Sailboat, testId: "nav-suzuki-mobile" },
  { to: "/gommoni", label: "Gommoni", icon: LifeBuoy, testId: "nav-gommoni-mobile" },
];

function NavGroup({ item, currentPath }) {
  const anyChildActive = item.children.some((c) => currentPath === c.to || currentPath.startsWith(c.to + "/"));
  const [open, setOpen] = useState(anyChildActive);
  useEffect(() => { if (anyChildActive) setOpen(true); }, [anyChildActive]);

  const Icon = item.icon;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={item.testId}
        aria-expanded={open}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
          anyChildActive ? "text-primary font-semibold" : "text-foreground/70 hover:bg-muted hover:text-foreground"
        )}
      >
        <Icon className="w-4 h-4" strokeWidth={2} />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open ? "rotate-180" : "")} />
      </button>
      {open && (
        <div className="mt-1 ml-3 pl-3 border-l border-border/60 space-y-0.5">
          {item.children.map((c) => {
            const CIcon = c.icon;
            return (
              <NavLink
                key={c.to}
                to={c.to}
                data-testid={c.testId}
                className={({ isActive }) => cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-foreground/70 hover:bg-muted hover:text-foreground"
                )}
              >
                {CIcon && <CIcon className="w-3.5 h-3.5" strokeWidth={2} />}
                {c.label}
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [c, setC] = useState(null);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    api.get("/cantiere").then((r) => setC(r.data)).catch(() => {});
  }, []);
  useEffect(() => {
    const load = () => api.get("/lavori-pending/count").then((r) => setPending(r.data.count)).catch(() => {});
    load();
    window.addEventListener("pending-changed", load);
    window.addEventListener("focus", load);
    return () => { window.removeEventListener("pending-changed", load); window.removeEventListener("focus", load); };
  }, [loc.pathname]);

  const brandName = c?.nome || "Gestionale GEBnautica";

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border/60 bg-card">
        <Link to="/" className="px-6 py-7 border-b border-border/60 hover:bg-muted/30 transition-colors" data-testid="brand-link">
          <div className="flex items-center gap-2.5">
            {c?.logo_base64 ? (
              <img src={c.logo_base64} alt="Logo" className="w-9 h-9 object-contain rounded-md" />
            ) : (
              <div className="w-9 h-9 rounded-md bg-primary text-primary-foreground grid place-items-center">
                <Sailboat className="w-5 h-5" strokeWidth={2.2} />
              </div>
            )}
            <div className="min-w-0">
              <div className="font-display text-lg font-semibold leading-none truncate">{brandName}</div>
              <div className="label-mini mt-1">Gestione Cantiere</div>
            </div>
          </div>
        </Link>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <YearSelector />
          <div className="pt-2" />
          <NavLink to="/" end data-testid="nav-home" className={({ isActive }) => cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
            isActive ? "bg-primary/10 text-primary font-semibold" : "text-foreground/70 hover:bg-muted hover:text-foreground"
          )}>
            <HomeIcon className="w-4 h-4" strokeWidth={2} />
            Home
          </NavLink>
          {nav.map((n) => {
            if (n.section) {
              return <div key={n.section} className="label-mini px-3 pt-4 pb-1">{n.section}</div>;
            }
            if (n.children) {
              return <NavGroup key={n.label} item={n} currentPath={loc.pathname} />;
            }
            const Icon = n.icon;
            const badge = n.badge === "pending" ? pending : 0;
            return (
              <NavLink
                key={n.to}
                to={n.to}
                data-testid={n.testId}
                className={({ isActive }) => cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-foreground/70 hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" strokeWidth={2} />
                <span className="flex-1">{n.label}</span>
                {badge > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] font-bold grid place-items-center" data-testid="nav-pending-badge">{badge}</span>}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border/60 space-y-3">
          {user && user !== false && (
            <div className="flex items-center gap-2 text-xs" data-testid="sidebar-user">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary grid place-items-center shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{user.nome || user.email}</div>
                <div className="text-muted-foreground truncate text-[11px]">{user.email}</div>
              </div>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-xs"
            onClick={handleLogout}
            data-testid="btn-logout"
          >
            <LogOut className="w-3.5 h-3.5 mr-2" />
            Esci
          </Button>
          <div>
            <div className="label-mini mb-1">Capacità</div>
            <div className="font-mono-num text-2xl font-semibold">200</div>
            <div className="text-xs text-muted-foreground">posti barca totali</div>
          </div>
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border/60 z-30" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} data-testid="mobile-nav">
        <div className="flex overflow-x-auto no-scrollbar">
          {mobileFlat.map((n) => {
            const Icon = n.icon;
            const active = loc.pathname === n.to || (n.to !== "/" && loc.pathname.startsWith(n.to));
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                data-testid={n.testId}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-[10px] shrink-0 w-[20%] min-w-[64px]",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="truncate max-w-full px-0.5">{n.label}</span>
              </NavLink>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 min-w-0 pb-[4.5rem] md:pb-0">
        <div className="md:hidden px-5 py-4 border-b border-border/60 bg-card flex items-center gap-2">
          {c?.logo_base64 ? (
            <img src={c.logo_base64} alt="Logo" className="w-8 h-8 object-contain rounded-md" />
          ) : (
            <div className="w-8 h-8 rounded-md bg-primary text-primary-foreground grid place-items-center">
              <Sailboat className="w-4 h-4" />
            </div>
          )}
          <div className="font-display text-base font-semibold">{brandName}</div>
        </div>
        <Outlet />
      </main>
      <HallGestionale />
    </div>
  );
}
