import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Camera, X } from "lucide-react";
import { toast } from "sonner";

const MAX = 4;

// Ridimensiona a max 1280px e comprime in JPEG per non appesantire la richiesta
export function comprimiFoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Immagine non leggibile")); };
    img.src = url;
  });
}

export function FotoPicker({ foto, onChange, testId }) {
  const ref = useRef(null);
  const aggiungi = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    if (foto.length + files.length > MAX) toast.info(`Massimo ${MAX} foto`);
    const nuove = [];
    for (const f of files.slice(0, MAX - foto.length)) {
      try { nuove.push(await comprimiFoto(f)); } catch { toast.error(`Foto non valida: ${f.name}`); }
    }
    onChange([...foto, ...nuove]);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {foto.map((f, i) => (
          <div key={i} className="relative w-16 h-16 rounded-md overflow-hidden border" data-testid={`${testId}-thumb-${i}`}>
            <img src={f} alt="" className="w-full h-full object-cover" />
            <button type="button" onClick={() => onChange(foto.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 bg-background/90 rounded-full p-0.5" aria-label="Rimuovi foto" data-testid={`${testId}-del-${i}`}><X className="w-3 h-3" /></button>
          </div>
        ))}
        {foto.length < MAX && (
          <Button type="button" variant="outline" size="sm" className="h-16 w-16 flex-col gap-1 text-[10px]" onClick={() => ref.current?.click()} data-testid={`${testId}-add`}>
            <Camera className="w-4 h-4" /> Foto
          </Button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={aggiungi} data-testid={`${testId}-input`} />
      <div className="text-[11px] text-muted-foreground">Fino a {MAX} foto (facoltative): l'AI valuta lo stato reale visibile.</div>
    </div>
  );
}
