"use client";

import { useEffect, useState } from "react";
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
import axios from "axios";
import { toast } from "sonner";
import { VipLocation, VipTableConfig } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  vipLocations: VipLocation[];
  editLocation?: VipLocation | null;
  onSuccess: () => void;
  isMobile?: boolean;
}

export default function CreateVipTablesModal({
  open,
  onOpenChange,
  eventId,
  vipLocations,
  editLocation = null,
  onSuccess,
  isMobile = false,
}: Props) {
  const [form, setForm] = useState({
    vipLocationId: "",
    startNumber: 1,
    endNumber: 10,
    price: 0,
    capacityPerTable: 10,
    status: "available" as "available" | "reserved" | "sold" | "blocked",
  });

  const [loading, setLoading] = useState(false);
  const [vipConfig, setVipConfig] = useState<VipTableConfig | null>(null);

  const modalClass = isMobile
    ? "w-[100vw] h-[100vh] max-w-none rounded-none overflow-y-auto"
    : "sm:max-w-lg sm:max-h-[90vh] overflow-y-auto";

  // 🔹 Cargar datos actuales si se está editando una ubicación
  useEffect(() => {
    if (editLocation && eventId) {
      setForm((prev) => ({
        ...prev,
        vipLocationId: editLocation.id,
      }));

      // Traer configuración actual de esa ubicación
      axios
        .get(`/api/vip-tables/config?eventId=${eventId}`)
        .then(({ data }) => {
          if (data.ok && data.configs?.length > 0) {
            const found = data.configs.find(
              (c: VipTableConfig) => c.vipLocationId === editLocation.id
            );
            if (found) {
              setVipConfig(found);
              setForm((prev) => ({
                ...prev,
                price: Number(found.price) || 0,
                capacityPerTable: found.capacityPerTable || 10,
              }));
            }
          }
        })
        .catch((err) =>
          console.error("Error cargando configuración VIP:", err)
        );
    } else {
      setVipConfig(null);
      setForm({
        vipLocationId: "",
        startNumber: 1,
        endNumber: 10,
        price: 0,
        capacityPerTable: 10,
        status: "available",
      });
    }
  }, [editLocation, eventId, open]);

  // ✅ Crear o actualizar mesas VIP
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!eventId) {
      toast.error("No se encontró el ID del evento.");
      return;
    }
    if (!form.vipLocationId) {
      toast.error("Debes seleccionar una ubicación VIP.");
      return;
    }
    if (form.startNumber > form.endNumber) {
      toast.error("El número inicial no puede ser mayor al final.");
      return;
    }

    try {
      setLoading(true);

      // Crear o actualizar configuración
      const configRes = await axios.post(
        "/api/vip-tables/config",
        {
          eventId,
          vipLocationId: form.vipLocationId,
          price: form.price,
          stockLimit: form.endNumber - form.startNumber + 1,
          capacityPerTable: form.capacityPerTable,
        },
        { headers: { "Content-Type": "application/json" } }
      );

      const vipTableConfigId = configRes.data?.config?.id;
      if (!vipTableConfigId) {
        toast.error("Error al crear configuración VIP.");
        return;
      }

      // Crear o actualizar mesas
      const res = await axios.post(
        "/api/vip-tables/tables",
        {
          eventId,
          vipLocationId: form.vipLocationId,
          vipTableConfigId,
          startNumber: form.startNumber,
          endNumber: form.endNumber,
          price: form.price,
          capacityPerTable: form.capacityPerTable,
          status: form.status,
        },
        { headers: { "Content-Type": "application/json" } }
      );

      if (res.data.ok) {
        const locName =
          vipLocations.find((v) => v.id === form.vipLocationId)?.name ||
          "Ubicación";
        toast.success(
          editLocation
            ? `✅ Mesas en "${locName}" actualizadas correctamente.`
            : `✅ Se crearon mesas en "${locName}".`
        );
        onSuccess();
        onOpenChange(false);
      } else {
        toast.error(res.data.error || "Error al guardar las mesas.");
      }
    } catch (err: any) {
      console.error("Error creando/actualizando mesas VIP:", err);
      toast.error(
        err.response?.data?.error ||
          "Ocurrió un error al guardar las mesas VIP."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={modalClass}>
        <DialogHeader className="pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold">
                {editLocation
                  ? `Editar Mesas VIP — ${editLocation.name}`
                  : "Crear Mesas VIP"}
              </DialogTitle>
              <DialogDescription>
                {editLocation
                  ? "Modificá el precio, capacidad o rango de mesas existentes."
                  : "Generá un rango de mesas por ubicación con precio y capacidad."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          {/* Ubicación VIP */}
          {!editLocation && (
            <div className="space-y-2">
              <Label>Ubicación</Label>
              <Select
                value={form.vipLocationId}
                onValueChange={(v) => setForm({ ...form, vipLocationId: v })}
                disabled={!vipLocations?.length || loading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      vipLocations?.length
                        ? "Seleccionar ubicación"
                        : "No hay ubicaciones disponibles"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {vipLocations?.length > 0 ? (
                    vipLocations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        <MapPin className="w-3 h-3 inline mr-1 text-amber-600" />
                        {loc.name}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-sm text-muted-foreground">
                      No hay ubicaciones disponibles
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Rango de mesas */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>N° desde</Label>
              <Input
                type="number"
                min={1}
                value={form.startNumber}
                onChange={(e) =>
                  setForm({ ...form, startNumber: Number(e.target.value) })
                }
                disabled={loading}
              />
            </div>
            <div>
              <Label>hasta</Label>
              <Input
                type="number"
                min={form.startNumber}
                value={form.endNumber}
                onChange={(e) =>
                  setForm({ ...form, endNumber: Number(e.target.value) })
                }
                disabled={loading}
              />
            </div>
          </div>

          {/* Precio y capacidad */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Precio por mesa</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.price}
                onChange={(e) =>
                  setForm({ ...form, price: Number(e.target.value) })
                }
                disabled={loading}
              />
            </div>
            <div>
              <Label>Capacidad por mesa</Label>
              <Input
                type="number"
                min={1}
                value={form.capacityPerTable}
                onChange={(e) =>
                  setForm({
                    ...form,
                    capacityPerTable: Number(e.target.value),
                  })
                }
                disabled={loading}
              />
            </div>
          </div>

          {/* Estado inicial */}
          <div className="space-y-2">
            <Label>Estado inicial</Label>
            <Select
              value={form.status}
              onValueChange={(v) =>
                setForm({
                  ...form,
                  status: v as "available" | "reserved" | "sold" | "blocked",
                })
              }
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Disponible</SelectItem>
                <SelectItem value="reserved">Reservada</SelectItem>
                <SelectItem value="sold">Vendida</SelectItem>
                <SelectItem value="blocked">Bloqueada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Botones */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
              disabled={
                loading ||
                !form.vipLocationId ||
                form.startNumber > form.endNumber
              }
            >
              {loading
                ? "Guardando..."
                : editLocation
                ? "Actualizar mesas"
                : "Crear mesas"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
