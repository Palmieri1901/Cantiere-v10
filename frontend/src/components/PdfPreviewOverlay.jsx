import React, { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, X, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { WhatsAppPdfButton } from "@/components/WhatsAppPdfButton";

// Worker locale (copiato in public/) — nessun download automatico del PDF,
// rendering fatto in-browser via canvas.
pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL || ""}/pdf.worker.min.mjs`;

export function PdfPreviewOverlay({ open, onClose, url, filename }) {
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState(() => (typeof window !== "undefined" && window.innerWidth < 640 ? 0.58 : 1.1));
  const [loadErr, setLoadErr] = useState(null);

  const onLoadSuccess = useCallback(({ numPages }) => {
    setNumPages(numPages);
    setPageNum(1);
    setLoadErr(null);
  }, []);

  const onLoadError = useCallback((err) => {
    setLoadErr(err?.message || "Impossibile caricare il PDF");
  }, []);

  if (!open || !url) return null;

  const download = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "documento.pdf";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 200);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-[95vw] w-[95vw] h-[92vh] p-0 gap-0 overflow-hidden flex flex-col"
        data-testid="pdf-preview-overlay"
      >
        <DialogHeader className="px-4 py-3 border-b bg-muted/40 shrink-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <DialogTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> Anteprima documento
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Verifica il PDF, poi scaricalo o invialo su WhatsApp. Chiudi la finestra per tornare all'editor.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {numPages > 0 && (
                <div className="flex items-center gap-1 bg-background rounded-md border px-1.5 py-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                    disabled={pageNum <= 1}
                    data-testid="btn-preview-prev-page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs font-mono tabular-nums px-2 select-none" data-testid="preview-page-indicator">
                    {pageNum} / {numPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
                    disabled={pageNum >= numPages}
                    data-testid="btn-preview-next-page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-1 bg-background rounded-md border px-1.5 py-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setScale((s) => Math.max(0.5, +(s - 0.15).toFixed(2)))}
                  data-testid="btn-preview-zoom-out"
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <span className="text-xs font-mono tabular-nums px-1 select-none min-w-[3ch] text-center">
                  {Math.round(scale * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setScale((s) => Math.min(3, +(s + 0.15).toFixed(2)))}
                  data-testid="btn-preview-zoom-in"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </div>
              <Button variant="outline" onClick={onClose} data-testid="btn-close-preview">
                <X className="w-4 h-4 mr-1.5" /> Chiudi
              </Button>
              <WhatsAppPdfButton url={url} filename={filename || "documento.pdf"} size="default" testId="btn-whatsapp-preview" />
              <Button onClick={download} className="bg-primary hover:bg-primary/90" data-testid="btn-download-preview">
                <Download className="w-4 h-4 mr-1.5" /> Scarica PDF
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto bg-muted/40 flex justify-center py-4" data-testid="pdf-preview-body">
          {loadErr ? (
            <div className="text-sm text-destructive p-6">Errore: {loadErr}</div>
          ) : (
            <Document
              file={url}
              onLoadSuccess={onLoadSuccess}
              onLoadError={onLoadError}
              loading={<div className="text-sm text-muted-foreground p-6">Caricamento PDF…</div>}
              error={<div className="text-sm text-destructive p-6">Impossibile caricare il PDF.</div>}
            >
              <Page
                pageNumber={pageNum}
                scale={scale}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                className="shadow-lg bg-white"
              />
            </Document>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PdfPreviewOverlay;
