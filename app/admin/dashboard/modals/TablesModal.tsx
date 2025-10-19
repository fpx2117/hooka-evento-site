"use client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TicketsConfig, TableLocation, VipAvailability } from "../types";

export default function TablesModal({
  open,
  onOpenChange,
  loading,
  error,
  availableNumbers,
  selectedTable,
  setSelectedTable,
  cfg,
  currentLocation,
  onRefresh,
  isMobile,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loading: boolean;
  error: string | null;
  availableNumbers: number[];
  selectedTable: number | null;
  setSelectedTable: (n: number | null) => void;
  cfg: TicketsConfig | null;
  currentLocation: TableLocation;
  onRefresh: () => void;
  isMobile: boolean;
}) {
  const sec = cfg?.vipTables.find((v) => v.location === currentLocation);
  const label =
    currentLocation === "dj"
      ? "Cerca del DJ"
      : currentLocation === "piscina"
        ? "Cerca de la Piscina"
        : "General";
  const modalClass = isMobile
    ? "w-[100vw] h-[100vh] max-w-none rounded-none overflow-y-auto"
    : "sm:max-w-2xl sm:max-h-[90vh] overflow-y-auto";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={modalClass}>
        <DialogHeader className="pb-2">
          <DialogTitle>Seleccionar mesa — {label}</DialogTitle>
          <DialogDescription>
            Elegí exactamente 1 mesa disponible.
            {sec?.startNumber != null && sec?.endNumber != null && (
              <>
                {" "}
                (rango: #{sec.startNumber}–{sec.endNumber})
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="inline-block w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
              {error}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {availableNumbers.length === 0 ? (
                  <span className="text-sm text-muted-foreground">
                    No hay mesas libres en esta ubicación.
                  </span>
                ) : (
                  availableNumbers.map((n) => {
                    const active = selectedTable === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setSelectedTable(n)}
                        className={`px-3 py-1.5 rounded-md border text-sm transition ${
                          active
                            ? "bg-amber-600 text-white border-amber-700"
                            : "bg-white border-border/60 hover:bg-amber-50"
                        }`}
                        title={active ? "Seleccionada" : "Seleccionar"}
                      >
                        #{n}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="text-xs text-muted-foreground">
                Seleccionada: {selectedTable ? `#${selectedTable}` : "ninguna"}
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-border/50"
                  onClick={() => onOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  Confirmar selección
                </Button>
                <Button type="button" variant="outline" onClick={onRefresh}>
                  Actualizar
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
