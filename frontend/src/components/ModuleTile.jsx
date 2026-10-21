import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

export function ModuleTile({ to, icon: Icon, title, desc, stat, statLabel, badge, accent = false, testId }) {
  return (
    <Link
      to={to}
      data-testid={testId}
      className={`group relative flex flex-col h-full min-h-[190px] rounded-xl border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
        accent ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20" : "bg-card border-border/70 hover:border-primary/40"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className={`w-11 h-11 rounded-lg grid place-items-center ${accent ? "bg-white/15" : "bg-primary/10 text-primary"}`}>
          <Icon className="w-5 h-5" strokeWidth={2} />
        </div>
        {badge > 0 && (
          <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-amber-500 text-white text-xs font-bold shadow" data-testid={`${testId}-badge`}>
            {badge}
          </span>
        )}
        <ArrowUpRight className={`w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${accent ? "text-white/70" : "text-muted-foreground"} ${badge > 0 ? "hidden" : ""}`} />
      </div>
      <div className="mt-4 font-display text-lg font-semibold leading-tight line-clamp-1">{title}</div>
      <div className={`mt-1 text-xs leading-relaxed line-clamp-2 min-h-[2.6em] ${accent ? "text-white/80" : "text-muted-foreground"}`}>{desc}</div>
      <div className="mt-auto pt-3 border-t border-current/10 flex items-baseline gap-1.5 min-h-[2.75rem]">
        {stat !== undefined ? (
          <>
            <span className="font-mono-num text-2xl font-semibold">{stat}</span>
            <span className={`text-[11px] uppercase tracking-wider ${accent ? "text-white/75" : "text-muted-foreground"}`}>{statLabel}</span>
          </>
        ) : (
          <span className={`text-[11px] uppercase tracking-wider ${accent ? "text-white/75" : "text-muted-foreground"}`}>{statLabel || "Apri"}</span>
        )}
      </div>
    </Link>
  );
}
