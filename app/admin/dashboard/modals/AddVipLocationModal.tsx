"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";

export default function AddVipLocationModal({
  open,
  onOpenChange,
  eventId,
  onSuccess,
  isMobile,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  onSuccess?: () => void;
  isMobile: boolean;
}) {
  const [form, setForm] = useState({ name: "", order: 0 });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }

    try {
      setLoading(true);
      const { data } = await axios.post("/api/vip-tables/locations", {
        eventId,
        name: form.name.trim(),
        order: Number(form.order) || 0,
      });

      if (!data.ok) {
        toast.error(data.error || "Error al crear ubicación");
        return;
      }

      toast.success(`Ubicación "${form.name}" creada correctamente ✅`);
      setForm({ name: "", order: 0 });
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error(err);
      toast.error("Error al crear ubicación");
    } finally {
      setLoading(false);
    }
  };

  const modalClass = isMobile
    ? "w-[100vw] h-[100vh] max-w-none rounded-none overflow-y-auto"
    : "sm:max-w-md sm:max-h-[80vh] overflow-y-auto";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={modalClass}>
        <DialogHeader className="pb-2 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <DialogTitle>Nueva ubicación VIP</DialogTitle>
              <DialogDescription>
                Creá una nueva zona o sector VIP para asignar mesas.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej. Terraza Norte"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Orden de visualización</Label>
            <Input
              type="number"
              value={form.order}
              onChange={(e) =>
                setForm({ ...form, order: Number(e.target.value) })
              }
              placeholder="Ej. 1"
            />
          </div>

          <div className="flex gap-3 pt-3">
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
              disabled={loading}
            >
              {loading ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
