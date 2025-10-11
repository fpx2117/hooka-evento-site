"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Percent,
  DollarSign,
  Plus,
  Trash2,
  RefreshCw,
  Tag,
} from "lucide-react";

type DiscountRule = {
  id?: string;
  ticketType: "general" | "vip";
  minQty: number;
  type: "percent" | "amount";
  value: number | string;
  priority?: number;
  isActive: boolean;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function DiscountsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [rules, setRules] = React.useState<DiscountRule[]>([]);

  const [form, setForm] = React.useState<DiscountRule>({
    ticketType: "general",
    minQty: 4,
    type: "percent",
    value: 10,
    priority: 0,
    isActive: true,
  });

  const sorted = React.useMemo(() => {
    const copy = rules.slice();
    copy.sort((a, b) => {
      const va = Number(a.value) || 0;
      const vb = Number(b.value) || 0;
      if (a.type !== b.type) return a.type === "percent" ? -1 : 1;
      if (vb !== va) return vb - va;
      return (b.priority ?? 0) - (a.priority ?? 0);
    });
    return copy;
  }, [rules]);

  const fetchConfig = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/tickets/discounts", {
        cache: "no-store",
      });
      if (!r.ok) {
        setRules([]);
        return;
      }
      const data = await r.json();
      setRules(Array.isArray(data?.rules) ? data.rules : []);
    } catch {
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const createDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const payload = {
        ticketType: form.ticketType,
        minQty: Math.max(1, Number(form.minQty) || 1),
        type: form.type,
        value: Number(form.value) || 0,
        priority: Number(form.priority) || 0,
        isActive: !!form.isActive,
      };
      const r = await fetch("/api/admin/tickets/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert(err?.error || "No se pudo crear el descuento.");
        return;
      }
      setForm((f) => ({ ...f, minQty: 4, value: 10, priority: 0 }));
      await fetchConfig();
    } catch {
      alert("Ocurrió un error creando el descuento.");
    } finally {
      setCreating(false);
    }
  };

  const deleteDiscount = async (id: string) => {
    if (!id) return;
    if (!confirm("¿Eliminar esta regla de descuento?")) return;
    setDeletingId(id);
    try {
      const r = await fetch(
        `/api/admin/tickets/discounts?id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert(err?.error || "No se pudo eliminar la regla.");
        return;
      }
      await fetchConfig();
    } catch {
      alert("Ocurrió un error eliminando la regla.");
    } finally {
      setDeletingId(null);
    }
  };

  React.useEffect(() => {
    if (open) fetchConfig();
  }, [open, fetchConfig]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 bg-background border-border">
        <DialogHeader className="px-8 py-6 border-b border-border">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 shrink-0 rounded-lg bg-success/10 flex items-center justify-center">
              <Tag className="w-6 h-6 text-success" />
            </div>
            <div className="space-y-2 flex-1">
              <DialogTitle className="text-2xl font-semibold tracking-tight text-foreground">
                Descuentos por cantidad
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
                Configurá reglas de descuento basadas en tipo de entrada,
                cantidad mínima y valor. El sistema aplica automáticamente la
                mejor regla disponible para cada compra.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-8 py-6 space-y-8">
          <section>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-7 h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
                1
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                Crear nueva regla
              </h3>
            </div>

            <form onSubmit={createDiscount} className="space-y-6">
              <div className="rounded-lg border border-border bg-card p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {/* Tipo de entrada */}
                  <div className="space-y-2.5">
                    <Label className="text-sm font-medium text-foreground">
                      Tipo de entrada
                    </Label>
                    <Select
                      value={form.ticketType}
                      onValueChange={(v: "general" | "vip") =>
                        setForm((f) => ({ ...f, ticketType: v }))
                      }
                    >
                      <SelectTrigger className="h-11 bg-background border-input text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="vip">VIP</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Tipo de entrada al que aplica
                    </p>
                  </div>

                  {/* Cantidad mínima */}
                  <div className="space-y-2.5">
                    <Label className="text-sm font-medium text-foreground">
                      Cantidad mínima
                    </Label>
                    <Input
                      className="h-11 bg-background border-input text-foreground"
                      type="number"
                      min={1}
                      value={form.minQty}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          minQty: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Entradas requeridas para aplicar
                    </p>
                  </div>

                  {/* Tipo de descuento */}
                  <div className="space-y-2.5">
                    <Label className="text-sm font-medium text-foreground whitespace-nowrap">
                      Tipo
                    </Label>
                    <Select
                      value={form.type}
                      onValueChange={(v: "percent" | "amount") =>
                        setForm((f) => ({ ...f, type: v }))
                      }
                    >
                      <SelectTrigger className="h-11 bg-background border-input text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">
                          <div className="flex items-center gap-2">
                            <Percent className="w-4 h-4" />
                            Porcentaje
                          </div>
                        </SelectItem>
                        <SelectItem value="amount">
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4" />
                            Monto fijo
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Cómo se calcula el descuento
                    </p>
                  </div>

                  {/* Valor */}
                  <div className="space-y-2.5">
                    <Label className="text-sm font-medium text-foreground">
                      Valor {form.type === "percent" ? "(%)" : "(ARS)"}
                    </Label>
                    <Input
                      className="h-11 bg-background border-input text-foreground"
                      type="number"
                      min={0}
                      step={form.type === "percent" ? 1 : 100}
                      value={form.value}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          value: Math.max(0, Number(e.target.value) || 0),
                        }))
                      }
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      {form.type === "percent"
                        ? "Porcentaje a descontar"
                        : "Monto a descontar"}
                    </p>
                  </div>

                  {/* Prioridad */}
                  <div className="space-y-2.5">
                    <Label className="text-sm font-medium text-foreground">
                      Prioridad
                    </Label>
                    <Input
                      className="h-11 bg-background border-input text-foreground"
                      type="number"
                      value={form.priority ?? 0}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          priority: Number(e.target.value) || 0,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Mayor valor = mayor prioridad
                    </p>
                  </div>

                  {/* Estado */}
                  <div className="space-y-2.5">
                    <Label className="text-sm font-medium text-foreground">
                      Estado
                    </Label>
                    <Select
                      value={String(form.isActive)}
                      onValueChange={(v: "true" | "false") =>
                        setForm((f) => ({ ...f, isActive: v === "true" }))
                      }
                    >
                      <SelectTrigger className="h-11 bg-background border-input text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Activa</SelectItem>
                        <SelectItem value="false">Inactiva</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Solo las activas se aplican
                    </p>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    className="h-11 px-6 bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={creating}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {creating ? "Creando regla..." : "Crear regla"}
                  </Button>
                </div>
              </div>
            </form>
          </section>

          <section>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
                  2
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  Reglas configuradas
                </h3>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 px-4 border-border text-foreground bg-transparent"
                onClick={fetchConfig}
                disabled={loading}
              >
                <RefreshCw
                  className={cn("w-4 h-4 mr-2", loading && "animate-spin")}
                />
                Actualizar
              </Button>
            </div>

            {loading ? (
              <div className="rounded-lg border border-dashed border-border bg-card/50 p-12 text-center">
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Cargando reglas...
                </div>
              </div>
            ) : sorted.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-card/50 p-12 text-center">
                <Tag className="w-8 h-8 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No hay reglas configuradas todavía
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Creá tu primera regla usando el formulario de arriba
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sorted.map((d) => (
                  <div
                    key={
                      d.id ||
                      `${d.ticketType}-${d.minQty}-${d.value}-${d.priority}`
                    }
                    className="rounded-lg border border-border bg-card p-5 hover:border-border/80 transition-colors"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-secondary text-secondary-foreground">
                          {d.ticketType === "vip" ? "VIP" : "General"}
                        </span>

                        <div className="flex items-center gap-2 text-sm text-foreground">
                          <span className="text-muted-foreground">Desde</span>
                          <span className="font-semibold">{d.minQty}</span>
                          <span className="text-muted-foreground">
                            {d.minQty === 1 ? "entrada" : "entradas"}
                          </span>
                        </div>

                        <span className="text-muted-foreground">•</span>

                        <div className="flex items-center gap-2 text-sm">
                          {d.type === "percent" ? (
                            <Percent className="w-3.5 h-3.5 text-success" />
                          ) : (
                            <DollarSign className="w-3.5 h-3.5 text-success" />
                          )}
                          <span className="font-semibold text-success">
                            {d.type === "percent"
                              ? `-${d.value}%`
                              : `-$${Number(d.value).toLocaleString("es-AR")}`}
                          </span>
                        </div>

                        <span className="text-muted-foreground">•</span>

                        <span className="text-xs text-muted-foreground">
                          Prioridad:{" "}
                          <span className="font-medium">{d.priority ?? 0}</span>
                        </span>

                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                            d.isActive
                              ? "bg-success/10 text-success"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {d.isActive ? "Activa" : "Inactiva"}
                        </span>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => d.id && deleteDiscount(d.id)}
                        disabled={!d.id || deletingId === d.id}
                        className="h-11 px-4 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        {deletingId === d.id ? "Eliminando..." : "Eliminar"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="px-8 py-6 border-t border-border bg-card/50">
          <Button
            type="button"
            variant="outline"
            className="w-full h-11 border-border text-foreground hover:bg-accent bg-transparent"
            onClick={() => onOpenChange(false)}
          >
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
