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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Edit } from "lucide-react";
import { FormEvent } from "react";
import { AdminForm, VipLocation } from "../types";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: AdminForm;
  setForm: (f: AdminForm) => void;
  onSubmit: (e: FormEvent) => void;
  isMobile: boolean;
  vipLocations?: VipLocation[];
};

export default function EditTicketModal({
  open,
  onOpenChange,
  form,
  setForm,
  onSubmit,
  isMobile,
  vipLocations = [],
}: Props) {
  const modalClass = isMobile
    ? "w-[100vw] h-[100vh] max-w-none rounded-none overflow-y-auto"
    : "sm:max-w-2xl sm:max-h-[90vh] overflow-y-auto";

  const handleNumber = (v: string): number | null => {
    if (v.trim() === "") return null;
    const num = Number(v);
    return Number.isFinite(num) ? num : null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={modalClass}>
        <DialogHeader className="pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Edit className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold">
                Editar Entrada
              </DialogTitle>
              <DialogDescription>
                Modificá los datos del ticket general o VIP.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-6 pt-4">
          {/* === Datos del cliente === */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nombre Completo</Label>
              <Input
                value={form.customerName}
                onChange={(e) =>
                  setForm({ ...form, customerName: e.target.value })
                }
                required
              />
            </div>
            <div>
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

          {/* === Contacto === */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
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
            <div>
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

          {/* === Tipo de entrada === */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Tipo de Entrada</Label>
              <Select
                value={form.ticketType}
                onValueChange={(v: "general" | "vip") =>
                  setForm({
                    ...form,
                    ticketType: v,
                    gender: v === "vip" ? "" : form.gender,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="vip">VIP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.ticketType === "general" && (
              <div>
                <Label>Género</Label>
                <Select
                  value={form.gender || ""}
                  onValueChange={(v: "hombre" | "mujer" | "") =>
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
            )}
          </div>

          {/* === Campos VIP === */}
          {form.ticketType === "vip" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Ubicación VIP</Label>
                <Select
                  value={form.vipLocationId ?? ""}
                  onValueChange={(v: string) =>
                    setForm({ ...form, vipLocationId: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar ubicación" />
                  </SelectTrigger>
                  <SelectContent>
                    {vipLocations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Número de Mesa</Label>
                <Input
                  type="number"
                  value={
                    form.vipTableNumber !== null &&
                    form.vipTableNumber !== undefined
                      ? form.vipTableNumber
                      : ""
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      vipTableNumber: handleNumber(e.target.value),
                    })
                  }
                  placeholder="Ej: 5"
                  min={1}
                />
              </div>
            </div>
          )}

          {/* === Pago === */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
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

            <div>
              <Label>Precio Total</Label>
              <Input
                type="number"
                value={Number.isFinite(form.totalPrice) ? form.totalPrice : 0}
                onChange={(e) =>
                  setForm({
                    ...form,
                    totalPrice: Number(e.target.value) || 0,
                  })
                }
                min={0}
              />
              <p className="text-xs text-muted-foreground mt-1">
                El servidor ajustará el precio según la configuración vigente.
              </p>
            </div>
          </div>

          {/* === Acciones === */}
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
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              Guardar Cambios
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
