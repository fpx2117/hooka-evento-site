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
import { AdminForm } from "../types";

export default function EditTicketModal({
  open,
  onOpenChange,
  form,
  setForm,
  onSubmit,
  isMobile,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: AdminForm;
  setForm: (f: AdminForm) => void;
  onSubmit: (e: React.FormEvent) => void;
  isMobile: boolean;
}) {
  const modalClass = isMobile
    ? "w-[100vw] h-[100vh] max-w-none rounded-none overflow-y-auto"
    : "sm:max-w-2xl sm:max-h-[90vh] overflow-y-auto";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={modalClass}>
        <DialogHeader className="pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Edit className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-xl">Editar Entrada</DialogTitle>
              <DialogDescription>
                Modifica los datos de la entrada
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5 pt-4">
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Entrada</Label>
              <Select
                value={form.ticketType}
                onValueChange={(v: any) => setForm({ ...form, ticketType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="vip">VIP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.ticketType === "general" && (
              <div className="space-y-2">
                <Label>Género</Label>
                <Select
                  value={form.gender || "hombre"}
                  onValueChange={(v: any) => setForm({ ...form, gender: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hombre">Hombre</SelectItem>
                    <SelectItem value="mujer">Mujer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Método de Pago</Label>
              <Select
                value={form.paymentMethod}
                onValueChange={(v: any) =>
                  setForm({ ...form, paymentMethod: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Precio Total</Label>
              <Input
                type="number"
                value={form.totalPrice}
                onChange={(e) =>
                  setForm({ ...form, totalPrice: Number(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                El servidor usa el precio de BD cuando haya configuración
              </p>
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
              Guardar Cambios
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
