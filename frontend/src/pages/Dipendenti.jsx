import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Inbox, Users, Archive } from "lucide-react";
import PendingTab from "@/pages/dipendenti/PendingTab";
import DipendentiTab from "@/pages/dipendenti/DipendentiTab";
import ArchivioTab from "@/pages/dipendenti/ArchivioTab";

export default function Dipendenti() {
  const [count, setCount] = useState(0);
  const refreshCount = () => api.get("/lavori-pending/count").then((r) => { setCount(r.data.count); window.dispatchEvent(new Event("pending-changed")); }).catch(() => {});
  useEffect(() => { refreshCount(); }, []);

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-6xl" data-testid="dipendenti-page">
      <div className="label-mini flex items-center gap-1.5 mb-2"><Smartphone className="w-3.5 h-3.5" /> App dipendenti</div>
      <h1 className="font-display text-3xl sm:text-5xl font-semibold mb-2">Lavori dal cantiere</h1>
      <p className="text-muted-foreground text-sm md:text-lg mb-6 md:mb-8 max-w-2xl">
        I dipendenti registrano i lavori dall'app sul telefono; qui li approvi e finiscono nella scheda del cliente.
        <span className="hidden sm:inline"> Ricezione via internet oppure offline con QR code.</span>
      </p>
      <Tabs defaultValue="pending">
        <TabsList className="mb-6 h-auto flex-wrap justify-start gap-1 w-full sm:w-auto">
          <TabsTrigger value="pending" data-testid="tab-pending" className="gap-2">
            <Inbox className="w-4 h-4" /> Da approvare
            {count > 0 && <Badge className="ml-1 bg-primary text-primary-foreground" data-testid="pending-count">{count}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="archivio" data-testid="tab-archivio" className="gap-2"><Archive className="w-4 h-4" /> Archivio report</TabsTrigger>
          <TabsTrigger value="dipendenti" data-testid="tab-dipendenti" className="gap-2"><Users className="w-4 h-4" /> Dipendenti e chiavi</TabsTrigger>
        </TabsList>
        <TabsContent value="pending"><PendingTab onChange={refreshCount} /></TabsContent>
        <TabsContent value="archivio"><ArchivioTab onChange={refreshCount} /></TabsContent>
        <TabsContent value="dipendenti"><DipendentiTab /></TabsContent>
      </Tabs>
    </div>
  );
}
