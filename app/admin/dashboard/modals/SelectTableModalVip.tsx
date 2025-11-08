"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface SelectTableModalVipProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vipLocationId: string | null;
  onSelect: (tableNumber: number) => void;
}

interface VipTable {
  id: string;
  tableNumber: number;
  status: string;
  price: number;
}

export default function SelectTableModalVip({
  open,
  onOpenChange,
  vipLocationId,
  onSelect,
}: SelectTableModalVipProps) {
  const [loading, setLoading] = useState(false);
  const [tables, setTables] = useState<VipTable[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log("[VIP MODAL] open:", open, "vipLocationId:", vipLocationId);

    if (!open) return;
    if (!vipLocationId) {
      setError("Falta el ID de ubicación VIP");
      setTables([]);
      return;
    }

    const loadTables = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/vip-tables/availability?vipLocationId=${vipLocationId}`);
        const data = await res.json();

        console.log("[VIP][API RESPONSE]", data);

        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Error al cargar mesas");
        }

        const available = Array.isArray(data.availableTables)
          ? data.availableTables.filter((t: any) => t.status?.toLowerCase() === "available")
          : [];

        setTables(available);
        console.log("[VIP][Mesas disponibles]", available.length);
      } catch (err: any) {
        console.error("[VIP][ERROR]", err);
        setError("No se pudo obtener la disponibilidad de mesas.");
        setTables([]);
      } finally {
        setLoading(false);
      }
    };

    loadTables();
  }, [vipLocationId, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Seleccionar mesa disponible</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Cargando mesas...
          </p>
        ) : error ? (
          <p className="text-sm text-red-600 text-center py-6">{error}</p>
        ) : tables.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No hay mesas libres en esta ubicación.
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 py-4">
            {tables.map((t) => (
              <Button
                key={t.id}
                variant="outline"
                onClick={() => {
                  console.log("[VIP][Seleccionada]", t.tableNumber);
                  onSelect(t.tableNumber);
                  onOpenChange(false);
                }}
                className="hover:bg-amber-50 border-amber-300 text-amber-900 font-medium"
              >
                #{t.tableNumber}
              </Button>
            ))}
          </div>
        )}

        {/* Depuración visual */}
        <div className="mt-4 text-[11px] text-muted-foreground text-center border-t border-border/50 pt-2">
          debug → open: {String(open)} | vipLocationId:{" "}
          {vipLocationId || "null"} | mesas: {tables.length}
        </div>
      </DialogContent>
    </Dialog>
  );
}
