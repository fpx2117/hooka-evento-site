"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Ticket } from "lucide-react";
import { AddGeneralForm, DiscountCfg, TicketsConfig } from "../types";
import { applyDiscount, pickDiscountRule } from "../utils/discounts";

interface AddGeneralModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cfg: TicketsConfig | null;
  discounts: DiscountCfg[];
  form: AddGeneralForm;
  setForm: React.Dispatch<React.SetStateAction<AddGeneralForm>>; // ✅ CORREGIDO
  onSubmit: (e: React.FormEvent) => void;
  isMobile: boolean;
}

export default function AddGeneralModal({
  open,
  onOpenChange,
  cfg,
  discounts,
  form,
  setForm,
  onSubmit,
  isMobile,
}: AddGeneralModalProps) {
  const [loadingEvent, setLoadingEvent] = useState(true);

  // ✅ Buscar el evento activo automáticamente al abrir el modal
  useEffect(() => {
    const fetchActiveEvent = async () => {
      try {
        const res = await fetch("/api/admin/events/active");
        if (!res.ok) throw new Error("No se pudo obtener el evento activo");
        const data = await res.json();

        if (data?.ok && data?.event?.id) {
          // Actualizar formulario con el ID del evento
          setForm((prev) => ({
            ...prev,
            eventId: data.event.id,
          }));
        } else {
          console.warn("⚠️ No se encontró evento activo.");
        }
      } catch (error) {
        console.error("❌ Error al obtener el evento activo:", error);
      } finally {
        setLoadingEvent(false);
      }
    };

    fetchActiveEvent();
  }, [setForm]);

  // ===========================
  // Cálculos de precios
  // ===========================
  const generalUnitPrice = useMemo(() => {
    if (!cfg) return 0;
    return form.gender === "hombre"
      ? cfg.tickets.general.hombre?.price ?? 0
      : cfg.tickets.general.mujer?.price ?? 0;
  }, [cfg, form.gender]);

  const generalRemaining = useMemo(() => {
    if (!cfg) return 0;
    return form.gender === "hombre"
      ? cfg.tickets.general.hombre?.remaining ?? 0
      : cfg.tickets.general.mujer?.remaining ?? 0;
  }, [cfg, form.gender]);

  const rule = useMemo(
    () => pickDiscountRule(discounts, "general", form.quantity),
    [discounts, form.quantity]
  );

  const totals = useMemo(
    () => applyDiscount(generalUnitPrice, form.quantity, rule),
    [generalUnitPrice, form.quantity, rule]
  );

  const modalClass = isMobile
    ? "w-[100vw] h-[100vh] max-w-none rounded-none overflow-y-auto"
    : "sm:max-w-2xl sm:max-h-[90vh] overflow-y-auto";

  // ===========================
  // Render del modal
  // ===========================
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={modalClass}>
        <DialogHeader className="pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Ticket className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold">
                Agregar Entrada General
              </DialogTitle>
              <DialogDescription>
                El evento se carga automáticamente desde la base de datos.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-6 pt-4">
          {/* ID del evento */}
          <div className="space-y-2">
            <Label>ID del Evento</Label>
            <Input
              value={form.eventId ?? ""}
              disabled
              placeholder={
                loadingEvent
                  ? "Cargando evento..."
                  : form.eventId || "No se encontró evento activo"
              }
              readOnly
            />
          </div>

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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Género</Label>
              <Select
                value={form.gender}
                onValueChange={(v: "hombre" | "mujer") =>
                  setForm({ ...form, gender: v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar género" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hombre">Hombre</SelectItem>
                  <SelectItem value="mujer">Mujer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Método de Pago</Label>
              <Select
                value={form.paymentMethod}
                onValueChange={(
                  v: "efectivo" | "transferencia" | "mercadopago"
                ) => setForm({ ...form, paymentMethod: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar método" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Cantidad</Label>
              <Input
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) =>
                  setForm({
                    ...form,
                    quantity: Math.max(1, Number(e.target.value) || 1),
                  })
                }
                required
              />
              <p className="text-xs text-muted-foreground">
                Disponible: {generalRemaining}
              </p>
            </div>
          </div>

          {/* Totales */}
          <div className="space-y-2">
            {rule && (
              <div className="rounded-xl bg-emerald-50 p-3 text-sm border border-emerald-200/60">
                <div className="flex items-center justify-between">
                  <span>Descuento aplicado</span>
                  <b>
                    {rule.type === "percent"
                      ? `${rule.value}%`
                      : `$ ${rule.value.toLocaleString("es-AR")}`}
                  </b>
                </div>
                <div className="mt-1 text-xs text-emerald-800/80">
                  Desde {rule.minQty} unidades
                </div>
              </div>
            )}
            <div className="rounded-xl bg-muted/50 p-4 flex items-center justify-between">
              <span className="text-sm">Subtotal</span>
              <b className="text-lg">
                ${totals.subtotal.toLocaleString("es-AR")}
              </b>
            </div>
            {totals.discount > 0 && (
              <div className="rounded-xl bg-emerald-100/50 p-4 flex items-center justify-between border border-emerald-200/60">
                <span className="text-sm">Descuento</span>
                <b className="text-lg">
                  - ${totals.discount.toLocaleString("es-AR")}
                </b>
              </div>
            )}
            <div className="rounded-xl bg-blue-50 p-4 flex items-center justify-between border border-blue-200/50">
              <span className="text-base font-semibold">Total a cobrar</span>
              <b className="text-2xl text-blue-600">
                ${totals.total.toLocaleString("es-AR")}
              </b>
            </div>
          </div>

          {/* Botones */}
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
              disabled={!form.eventId || loadingEvent}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {loadingEvent ? "Cargando evento..." : "Guardar Entrada General"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
