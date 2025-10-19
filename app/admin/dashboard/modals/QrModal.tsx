"use client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QrCode } from "lucide-react";
import { useEffect, useState } from "react";
import { buildValidateUrl, makeQrDataUrl } from "../utils/qr";

export default function QrModal({
  open,
  onOpenChange,
  code,
  isMobile,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  code: string | null;
  isMobile: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!open || !code) return setSrc(null);
      try {
        const dataUrl = await makeQrDataUrl(code, 8);
        if (active) setSrc(dataUrl);
      } catch {
        if (active) setSrc(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, code]);

  const modalClass = isMobile
    ? "w-[100vw] h-[100vh] max-w-none rounded-none overflow-y-auto"
    : "sm:max-w-md sm:max-h-[90vh] overflow-y-auto";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={modalClass}>
        <DialogHeader className="pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <QrCode className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-xl">QR de validación</DialogTitle>
              <DialogDescription>
                Escaneá este QR para abrir la verificación
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-6">
          {code && (
            <code className="text-sm bg-muted/60 px-3 py-2 rounded-lg font-mono border border-border/50 break-all">
              {code}
            </code>
          )}
          {src ? (
            <a
              href={code ? buildValidateUrl(code) : "#"}
              target="_blank"
              rel="noreferrer"
              className="block group"
            >
              <img
                src={src || "/placeholder.svg"}
                alt="QR grande"
                className="rounded-2xl border-2 border-border shadow-lg w-72 h-72 object-contain group-hover:shadow-xl transition-shadow"
              />
            </a>
          ) : (
            <div className="w-72 h-72 rounded-2xl border-2 border-dashed border-border flex items-center justify-center">
              <div className="text-center">
                <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-muted-foreground text-sm">Generando QR…</p>
              </div>
            </div>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full border-border/50"
          >
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
