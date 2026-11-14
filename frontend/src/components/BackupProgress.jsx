import { Loader2 } from "lucide-react";

export function BackupProgress({ msg }) {
  if (!msg) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2" role="status" aria-live="polite" data-testid="backup-progress">
      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
      <span>{msg}</span>
      <span className="relative h-1 w-24 overflow-hidden rounded-full bg-muted">
        <span className="absolute inset-y-0 w-1/3 rounded-full bg-primary animate-[backup-slide_1.2s_ease-in-out_infinite]" />
      </span>
      <style>{`@keyframes backup-slide { 0% { left: -33%; } 100% { left: 100%; } }`}</style>
    </div>
  );
}
