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
import { Crown } from "lucide-react";
import {
  AddVipForm,
  VipTableConfig,
  VipLocation,
  VipAvailability,
  TicketsConfig,
} from "../types";
import TablesModal from "./TablesModal";

// ============================================================
// ✅ Tipado de Props (sin hardcode)
// ============================================================
interface AddVipModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: AddVipForm & { vipTableNumber: number | null }; // ✅ no opcional
  setForm: React.Dispatch<
    React.SetStateAction<AddVipForm & { vipTableNumber: number | null }>
  >; // ✅ igual que useState en Page.tsx
  configs: VipTableConfig[];
  locations: VipLocation[];
  cfg: TicketsConfig | null;
  onSubmit: (e: React.FormEvent) => Promise<void> | void;
  isMobile: boolean;
}

// ============================================================
// 🧩 Componente principal
// ============================================================
export default function AddVipModal({
  open,
  onOpenChange,
  form,
  setForm,
  configs,
  locations,
  cfg,
  onSubmit,
  isMobile,
}: AddVipModalProps) {
  // ============================================================
  // 🧠 Combinar ubicaciones con sus precios desde configs
  // ============================================================
  const locationOptions = useMemo(() => {
    if (!Array.isArray(locations) || !Array.isArray(configs)) return [];
    return locations.map((loc) => {
      const cfgItem = configs.find((c) => c.vipLocationId === loc.id);
      return {
        id: loc.id,
        name: loc.name,
        price: cfgItem?.price ?? 0,
        available: Math.max(
          0,
          (cfgItem?.stockLimit ?? 0) - (cfgItem?.soldCount ?? 0)
        ),
        capacity: cfgItem?.capacityPerTable ?? 0,
      };
    });
  }, [configs, locations]);

  const selectedLocation = useMemo(
    () => locationOptions.find((l) => l.id === form.vipLocationId),
    [form.vipLocationId, locationOptions]
  );

  const totalPrice = selectedLocation?.price ?? 0;

  // ============================================================
  // 🪟 Estado del modal de mesas VIP
  // ============================================================
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [availError, setAvailError] = useState<string | null>(null);
  const [availableNumbers, setAvailableNumbers] = useState<number[]>([]);

  // ============================================================
  // 🔌 Fetch de disponibilidad desde API real
  // ============================================================
  const fetchVipAvailability = async (locationId: string) => {
    try {
      setLoadingAvail(true);
      setAvailError(null);

      const res = await fetch(
        `/api/vip-tables/availability?vipLocationId=${locationId}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("No se pudo obtener la disponibilidad de mesas.");

      const data: VipAvailability = await res.json();
      const total = data.limit ?? 0;
      const ocupadas = new Set(data.taken ?? []);
      const libres = Array.from({ length: total }, (_, i) => i + 1).filter(
        (n) => !ocupadas.has(n)
      );

      setAvailableNumbers(libres);
    } catch (err: any) {
      console.error("[AddVipModal] Error al obtener disponibilidad:", err);
      setAvailError(err.message || "Error al obtener disponibilidad de mesas.");
    } finally {
      setLoadingAvail(false);
    }
  };

  const handlePickTable = () => {
    if (!form.vipLocationId) {
      alert("Primero seleccioná una ubicación VIP");
      return;
    }
    fetchVipAvailability(form.vipLocationId);
    setTableModalOpen(true);
  };

  const handleRefresh = () => {
    if (form.vipLocationId) fetchVipAvailability(form.vipLocationId);
  };

  // Cerrar modal al seleccionar mesa
  useEffect(() => {
    if (form.vipTableNumber) {
      console.log("[AddVipModal] Mesa confirmada:", form.vipTableNumber);
      setTableModalOpen(false);
    }
  }, [form.vipTableNumber]);

  // ============================================================
  // 🎨 Estilos del modal principal
  // ============================================================
  const modalClass = isMobile
    ? "w-[100vw] h-[100vh] max-w-none rounded-none overflow-y-auto"
    : "sm:max-w-2xl sm:max-h-[90vh] overflow-y-auto";

  const noLocations = !locations.length;

  // ============================================================
  // 🧩 Render principal
  // ============================================================
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={modalClass}>
          <DialogHeader className="pb-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
                <Crown className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold">
                  Agregar VIP
                </DialogTitle>
                <DialogDescription>
                  Seleccioná ubicación y mesa disponible
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {noLocations ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No hay ubicaciones VIP configuradas para este evento.
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-6 pt-4">
              {/* Datos del cliente */}
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

              {/* Ubicación VIP */}
              <div className="space-y-2">
                <Label>Ubicación</Label>
                <Select
                  value={form.vipLocationId || ""}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      vipLocationId: v,
                      vipTableNumber: null,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Elegí la ubicación" />
                  </SelectTrigger>
                  <SelectContent>
                    {locationOptions.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name} — ${loc.price.toLocaleString("es-AR")} ·{" "}
                        {loc.available} mesas libres
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Mesa VIP */}
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  {form.vipTableNumber ? (
                    <>
                      Mesa seleccionada:{" "}
                      <b className="text-amber-700">
                        #{form.vipTableNumber}
                      </b>
                    </>
                  ) : (
                    <>No seleccionaste la mesa todavía</>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePickTable}
                  className="border-border/50"
                >
                  Ver / Elegir mesa
                </Button>
              </div>

              {/* Total */}
              <div className="rounded-xl bg-amber-50 p-4 flex items-center justify-between border border-amber-200/50">
                <span className="text-base font-semibold text-amber-900">
                  Total a cobrar
                </span>
                <b className="text-2xl text-amber-600">
                  ${totalPrice.toLocaleString("es-AR")}
                </b>
              </div>

              {/* Acciones */}
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
          )}
        </DialogContent>
      </Dialog>

      {/* ✅ Modal de mesas reales */}
      <TablesModal
        open={tableModalOpen}
        onOpenChange={setTableModalOpen}
        loading={loadingAvail}
        error={availError}
        availableNumbers={availableNumbers}
        selectedTable={form.vipTableNumber ?? null}
        setSelectedTable={(num) => setForm({ ...form, vipTableNumber: num })}
        cfg={cfg}                      // ✅ ahora usa la config real del evento
        currentLocation={form.vipLocationId}
        onRefresh={handleRefresh}
        isMobile={isMobile}
      />
    </>
  );
}
