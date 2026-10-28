import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import { condividiPdfWhatsApp } from "@/lib/whatsappPdf";

// Tasto "WhatsApp" per qualsiasi PDF (url API o blob). size: "sm" | "icon" | default
export function WhatsAppPdfButton({ url, filename, testo, size = "sm", label = "WhatsApp", className = "", testId = "btn-whatsapp-pdf" }) {
  const [busy, setBusy] = useState(false);
  const go = async (e) => { e?.stopPropagation?.(); setBusy(true); try { await condividiPdfWhatsApp(url, filename, testo); } finally { setBusy(false); } };
  if (size === "icon") {
    return <Button variant="ghost" size="icon" className={`h-8 w-8 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 ${className}`} title="Invia PDF su WhatsApp" onClick={go} disabled={busy} data-testid={testId}><MessageCircle className="w-4 h-4" /></Button>;
  }
  return (
    <Button variant="outline" size={size} className={`border-emerald-500 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 ${className}`} onClick={go} disabled={busy} data-testid={testId}>
      <MessageCircle className="w-4 h-4 mr-1.5" /> {busy ? "Preparo…" : label}
    </Button>
  );
}
