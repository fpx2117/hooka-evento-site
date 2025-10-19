"use client";
import { useMemo } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Crown, MapPin } from "lucide-react";
import { AddVipForm, TicketsConfig, TableLocation } from "../types";
import { applyDiscount } from "../utils/discounts";

export default function AddVipModal({
  open,
  onOpenChange,
  form,
  setForm,
  cfg,
  selectedTable,
  onPickTable,
  onSubmit,
  isMobile,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: AddVipForm;
  setForm: (f: AddVipForm) => void;
  cfg: TicketsConfig | null;
  selectedTable: number | null;
  onPickTable: () => void;
  onSubmit: (e: React.FormEvent) => void;
  isMobile: boolean;
}) {
  const vipOptions = useMemo(() => cfg?.vipTables || [], [cfg]);

  const selectedVipCfg = useMemo(() => {
    if (!cfg) return null;
    return cfg.vipTables.find((v) => v.location === form.tableLocation) || null;
  }, [cfg, form.tableLocation]);

  const vipUnitPrice = useMemo(
    () => (selectedVipCfg ? selectedVipCfg.price : 0),
    [selectedVipCfg]
  );
  const vipTotalInfo = useMemo(
    () => applyDiscount(vipUnitPrice, 1, null),
    [vipUnitPrice]
  );

  const locationLabel = (loc: TableLocation) =>
    loc === "dj"
      ? "Cerca del DJ"
      : loc === "piscina"
        ? "Cerca de la Piscina"
        : "General";

  const modalClass = isMobile
    ? "w-[100vw] h-[100vh] max-w-none rounded-none overflow-y-auto"
    : "sm:max-w-2xl sm:max-h-[90vh] overflow-y-auto";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={modalClass}>
        <DialogHeader className="pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl">Agregar VIP</DialogTitle>
              <DialogDescription>
                Precio por mesa según ubicación desde la base de datos
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-6 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nombre Completo</Label>
              <Input
                value={form.customerName}
                onChange={(e) =>
                  setForm({ ...form, customerName: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label>DNI</Label>
              <Input
                value={form.customerDni}
                onChange={(e) =>
                  setForm({ ...form, customerDni: e.target.value })
                }
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.customerEmail}
                onChange={(e) =>
                  setForm({ ...form, customerEmail: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input
                value={form.customerPhone}
                onChange={(e) =>
                  setForm({ ...form, customerPhone: e.target.value })
                }
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ubicación</Label>
            <Select
              value={form.tableLocation}
              onValueChange={(v: any) => setForm({ ...form, tableLocation: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Elegí la ubicación" />
              </SelectTrigger>
              <SelectContent>
                {(vipOptions || []).map((opt) => (
                  <SelectItem key={opt.location} value={opt.location}>
                    {locationLabel(opt.location)} — $
                    {opt.price.toLocaleString("es-AR")} · {opt.remaining} mesas
                    {Number.isFinite(opt.startNumber) &&
                      Number.isFinite(opt.endNumber) && (
                        <>
                          {" "}
                          · #{opt.startNumber}–{opt.endNumber}
                        </>
                      )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Precio por mesa según ubicación.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {selectedTable ? (
                <>
                  Mesa seleccionada: <b>#{selectedTable}</b>
                </>
              ) : (
                <>No seleccionaste la mesa todavía</>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={onPickTable}
              className="border-border/50"
            >
              Ver / Elegir mesa
            </Button>
          </div>

          <div className="rounded-xl bg-amber-50 p-4 flex items-center justify-between border border-amber-200/50">
            <span className="text-base font-semibold text-amber-900">
              Total a cobrar
            </span>
            <b className="text-2xl text-amber-600">
              ${vipTotalInfo.total.toLocaleString("es-AR")}
            </b>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
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
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
            >
              Guardar VIP
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
