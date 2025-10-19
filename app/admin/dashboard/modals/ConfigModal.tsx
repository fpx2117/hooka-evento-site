"use client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, SlidersHorizontal, Users, Crown } from "lucide-react";
import { TicketsConfig, TableLocation } from "../types";

type VipTableFormRow = {
  location: TableLocation;
  price: number;
  stockLimit: number;
  capacityPerTable: number;
  startNumber?: number | null;
  endNumber?: number | null;
};

export default function ConfigModal({
  open,
  onOpenChange,
  cfg,
  configForm,
  setConfigForm,
  vipTablesForm,
  setVipTablesForm,
  onSubmit,
  isMobile,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cfg: TicketsConfig | null;
  configForm: {
    totalLimitPersons: number;
    genHPrice: number;
    genMPrice: number;
  };
  setConfigForm: (f: {
    totalLimitPersons: number;
    genHPrice: number;
    genMPrice: number;
  }) => void;
  vipTablesForm: VipTableFormRow[];
  setVipTablesForm: (rows: VipTableFormRow[]) => void;
  onSubmit: (e: React.FormEvent) => void;
  isMobile: boolean;
}) {
  const locationLabel = (loc: TableLocation) =>
    loc === "dj"
      ? "Cerca del DJ"
      : loc === "piscina"
        ? "Cerca de la Piscina"
        : "General";

  const modalClass = isMobile
    ? "w-[100vw] h-[100vh] max-w-none rounded-none overflow-y-auto"
    : "sm:max-w-3xl sm:max-h-[90vh] overflow-y-auto";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={modalClass}>
        <DialogHeader className="pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <SlidersHorizontal className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-xl">
                Configurar precios y cupos
              </DialogTitle>
              <DialogDescription>
                Stock TOTAL (personas), precios por género y Mesas VIP por
                ubicación.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-6 pt-4">
          <div className="rounded-xl border border-border/50 p-5 space-y-4 bg-white/50">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-lg">Stock TOTAL (personas)</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cupo total (personas)</Label>
                <Input
                  type="number"
                  min={0}
                  value={configForm.totalLimitPersons}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      totalLimitPersons: Number(e.target.value),
                    })
                  }
                  required
                />
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Vendidos:</span>
                  <b>{cfg?.totals?.soldPersons ?? 0}</b>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-muted-foreground">Restantes:</span>
                  <b>{cfg?.totals?.remainingPersons ?? 0}</b>
                </div>
              </div>
            </div>
          </div>

          {/* General Hombre */}
          <div className="rounded-xl border border-border/50 p-5 space-y-4 bg-white/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Users className="w-4 h-4 text-blue-600" />
              </div>
              <h4 className="font-semibold text-lg">
                Entrada General — Hombre
              </h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Precio (ARS)</Label>
                <Input
                  type="number"
                  min={0}
                  value={configForm.genHPrice}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      genHPrice: Number(e.target.value),
                    })
                  }
                  required
                />
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Vendidos (H):</span>
                  <b>{cfg?.tickets.general.hombre?.sold ?? 0}</b>
                </div>
              </div>
            </div>
          </div>

          {/* General Mujer */}
          <div className="rounded-xl border border-border/50 p-5 space-y-4 bg-white/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-pink-100 flex items-center justify-center">
                <Users className="w-4 h-4 text-pink-600" />
              </div>
              <h4 className="font-semibold text-lg">Entrada General — Mujer</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Precio (ARS)</Label>
                <Input
                  type="number"
                  min={0}
                  value={configForm.genMPrice}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      genMPrice: Number(e.target.value),
                    })
                  }
                  required
                />
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Vendidos (M):</span>
                  <b>{cfg?.tickets.general.mujer?.sold ?? 0}</b>
                </div>
              </div>
            </div>
          </div>

          {/* VIP por ubicación */}
          <div className="rounded-xl border border-amber-200/50 p-5 space-y-4 bg-amber-50/40">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
                <Crown className="w-4 h-4 text-white" />
              </div>
              <h4 className="font-semibold text-lg">Mesas VIP por ubicación</h4>
            </div>

            <div className="space-y-4">
              {vipTablesForm.map((row, idx) => {
                const live = cfg?.vipTables.find(
                  (v) => v.location === row.location
                );
                return (
                  <div
                    key={row.location}
                    className="rounded-lg border border-amber-200/60 p-4 bg-white/60"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-amber-600" />
                        <b>{locationLabel(row.location)}</b>
                      </div>
                      {live ? (
                        <span className="text-xs text-amber-700">
                          Vendidas: <b>{live.sold}</b> · Restantes:{" "}
                          <b>{live.remaining}</b>
                          {Number.isFinite(live.startNumber) &&
                            Number.isFinite(live.endNumber) && (
                              <>
                                {" "}
                                · Rango #{live.startNumber}–{live.endNumber}
                              </>
                            )}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Sin ventas registradas aún
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                      <div className="space-y-2 sm:col-span-1">
                        <Label>Precio por mesa</Label>
                        <Input
                          type="number"
                          min={0}
                          value={row.price}
                          onChange={(e) => {
                            const next = [...vipTablesForm];
                            next[idx] = {
                              ...row,
                              price: Number(e.target.value),
                            };
                            setVipTablesForm(next);
                          }}
                          required
                        />
                      </div>

                      <div className="space-y-2 sm:col-span-1">
                        <Label>Stock de mesas</Label>
                        <Input
                          type="number"
                          min={0}
                          value={row.stockLimit}
                          onChange={(e) => {
                            const next = [...vipTablesForm];
                            next[idx] = {
                              ...row,
                              stockLimit: Number(e.target.value),
                            };
                            setVipTablesForm(next);
                          }}
                          required
                        />
                      </div>

                      <div className="space-y-2 sm:col-span-1">
                        <Label>Capacidad por mesa</Label>
                        <Input
                          type="number"
                          min={1}
                          value={row.capacityPerTable}
                          onChange={(e) => {
                            const next = [...vipTablesForm];
                            next[idx] = {
                              ...row,
                              capacityPerTable: Math.max(
                                1,
                                Number(e.target.value) || 1
                              ),
                            };
                            setVipTablesForm(next);
                          }}
                          required
                        />
                      </div>

                      <div className="space-y-2 sm:col-span-1">
                        <Label>Desde (n° mesa)</Label>
                        <Input
                          type="number"
                          min={1}
                          value={row.startNumber ?? ""}
                          onChange={(e) => {
                            const val =
                              e.target.value === ""
                                ? undefined
                                : Number(e.target.value);
                            const next = [...vipTablesForm];
                            next[idx] = { ...row, startNumber: val };
                            setVipTablesForm(next);
                          }}
                          placeholder="p.ej. 1"
                        />
                      </div>

                      <div className="space-y-2 sm:col-span-1">
                        <Label>Hasta (n° mesa)</Label>
                        <Input
                          type="number"
                          min={1}
                          value={row.endNumber ?? ""}
                          onChange={(e) => {
                            const val =
                              e.target.value === ""
                                ? undefined
                                : Number(e.target.value);
                            const next = [...vipTablesForm];
                            next[idx] = { ...row, endNumber: val };
                            setVipTablesForm(next);
                          }}
                          placeholder="p.ej. 10"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              Guardar configuración
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
