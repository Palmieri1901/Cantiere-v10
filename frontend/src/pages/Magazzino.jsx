import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Building2, Percent, RefreshCw } from "lucide-react";

import ArticoliTab from "./magazzino/ArticoliTab";
import FornitoriTab from "./magazzino/FornitoriTab";
import SpeseTab from "./magazzino/SpeseTab";
import MovimentiTab from "./magazzino/MovimentiTab";

export default function Magazzino() {
  const [tab, setTab] = useState("articoli");
  return (
    <div className="p-4 md:p-6 xl:p-8 w-full max-w-none" data-testid="magazzino-page">
      <div className="mb-6">
        <div className="flex items-center gap-2 label-mini mb-2">
          <Package className="w-3.5 h-3.5" /> Magazzino
        </div>
        <h1 className="font-display text-4xl font-semibold tracking-tight">Accessori & inventario</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl">
          Gestisci gli accessori nautici, i fornitori e i movimenti di magazzino.
          Inserisci articoli manualmente, tramite foto (AI) o importando un DDT.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid grid-cols-4 max-w-2xl">
          <TabsTrigger value="articoli" data-testid="tab-articoli">
            <Package className="w-3.5 h-3.5 mr-1.5" /> Articoli
          </TabsTrigger>
          <TabsTrigger value="fornitori" data-testid="tab-fornitori">
            <Building2 className="w-3.5 h-3.5 mr-1.5" /> Fornitori
          </TabsTrigger>
          <TabsTrigger value="spese" data-testid="tab-spese">
            <Percent className="w-3.5 h-3.5 mr-1.5" /> Spese
          </TabsTrigger>
          <TabsTrigger value="movimenti" data-testid="tab-movimenti">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Movimenti
          </TabsTrigger>
        </TabsList>

        <TabsContent value="articoli" className="mt-6">
          <ArticoliTab />
        </TabsContent>
        <TabsContent value="fornitori" className="mt-6">
          <FornitoriTab />
        </TabsContent>
        <TabsContent value="spese" className="mt-6">
          <SpeseTab />
        </TabsContent>
        <TabsContent value="movimenti" className="mt-6">
          <MovimentiTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
