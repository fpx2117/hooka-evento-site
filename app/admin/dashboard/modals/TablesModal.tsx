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
import { TicketsConfig } from "../types";

interface TablesModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loading: boolean;
  error: string | null;
  availableNumbers: number[];
  selectedTable: number | null;
  setSelectedTable: (n: number | null) => void;
  cfg: TicketsConfig | null;
  currentLocation: string | null;
  onRefresh: () => void;
  isMobile: boolean;
}

export default function TablesModal({
  open,
  onOpenChange,
  loading: parentLoading,
  error: parentError,
  availableNumbers: parentAvailable,
  selectedTable,
  setSelectedTable,
  cfg,
  currentLocation,
  onRefresh,
  isMobile,
}: TablesModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableNumbers, setAvailableNumbers] = useState<number[]>([]);

  /* =========================
     Cargar mesas disponibles
  ========================== */
  useEffect(() => {
    // 🔸 Evitamos ejecutar si no está abierto o faltan datos
    if (!open || !currentLocation || !cfg?.eventId) return;

    const loadTables = async () => {
      try {
        setLoading(true);
        setError(null);

        const url = `/api/vip-tables/availability?eventId=${cfg.eventId}&vipLocationId=${currentLocation}`;
        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json();

        console.log("[TablesModal][API RESPONSE]", data);

        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Error al cargar mesas");
        }

        // 🔸 Manejo flexible de estructura según el backend
        const numbers = Array.isArray(data.availableTables)
          ? data.availableTables.map((t: any) => t.tableNumber)
          : Array.isArray(data.tables)
          ? data.tables
              .filter(
                (t: any) => t.available || t.status === "available"
              )
              .map((t: any) => t.tableNumber)
          : [];

        console.log("[TablesModal][Mesas libres]", numbers);

        setAvailableNumbers(numbers);
      } catch (err: any) {
        console.error("[TablesModal][ERROR]", err);
        setError("No se pudo obtener la disponibilidad de mesas.");
        setAvailableNumbers([]);
      } finally {
        setLoading(false);
      }
    };

    loadTables();
  }, [open, currentLocation, cfg?.eventId]);

  /* =========================
     Etiqueta de la ubicación
  ========================== */
  const label =
    cfg?.vipConfigs?.find(
      (v) => v.vipLocationId === currentLocation
    )?.vipLocation?.name || "Ubicación VIP";

  const modalClass = isMobile
    ? "w-[100vw] h-[100vh] max-w-none rounded-none overflow-y-auto"
    : "sm:max-w-2xl sm:max-h-[90vh] overflow-y-auto";

  /* =========================
     Confirmar selección
  ========================== */
  const handleConfirm = () => {
    if (!selectedTable) {
      alert("Debes seleccionar una mesa antes de confirmar.");
      return;
    }

    console.log("✅ Mesa confirmada:", selectedTable);
    setSelectedTable(selectedTable);
    onOpenChange(false);
  };

  /* =========================
     Refrescar manualmente
  ========================== */
  const handleRefresh = async () => {
    if (!currentLocation || !cfg?.eventId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/vip-tables/availability?eventId=${cfg.eventId}&vipLocationId=${currentLocation}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      const numbers = Array.isArray(data.availableTables)
        ? data.availableTables.map((t: any) => t.tableNumber)
        : Array.isArray(data.tables)
        ? data.tables
            .filter(
              (t: any) => t.available || t.status === "available"
            )
            .map((t: any) => t.tableNumber)
        : [];
      setAvailableNumbers(numbers);
    } catch {
      setError("Error al actualizar la disponibilidad.");
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     Render principal
  ========================== */
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={modalClass}>
        <DialogHeader className="pb-2">
          <DialogTitle>Seleccionar mesa — {label}</DialogTitle>
          <DialogDescription>
            Elegí exactamente una mesa disponible.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loading || parentLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="inline-block w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : error || parentError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
              {error || parentError}
            </div>
          ) : availableNumbers.length === 0 &&
            parentAvailable.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              No hay mesas libres en esta ubicación.
            </span>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {(availableNumbers.length > 0
                  ? availableNumbers
                  : parentAvailable
                ).map((n) => {
                  const active = selectedTable === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        console.log("✅ Mesa seleccionada:", n);
                        setSelectedTable(n);
                      }}
                      className={`px-3 py-1.5 rounded-md border text-sm transition ${
                        active
                          ? "bg-amber-600 text-white border-amber-700"
                          : "bg-white border-border/60 hover:bg-amber-50"
                      }`}
                      title={active ? "Mesa seleccionada" : "Seleccionar mesa"}
                    >
                      #{n}
                    </button>
                  );
                })}
              </div>

              <div className="text-xs text-muted-foreground">
                Mesa seleccionada:{" "}
                {selectedTable ? (
                  <span className="font-medium text-amber-700">
                    #{selectedTable}
                  </span>
                ) : (
                  "ninguna"
                )}
              </div>

              <div className="flex flex-wrap gap-2 justify-end pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-border/50"
                  onClick={() => {
                    setSelectedTable(null);
                    onOpenChange(false);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirm}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  Confirmar selección
                </Button>
                <Button type="button" variant="outline" onClick={handleRefresh}>
                  Actualizar
                </Button>
              </div>
            </>
          )}
        </div>

        {/* 🔍 Depuración rápida */}
        <div className="mt-3 text-[11px] text-muted-foreground text-center border-t border-border/50 pt-2">
          debug → open: {String(open)} | loc: {currentLocation || "null"} | event:{" "}
          {cfg?.eventId || "null"} | mesas: {availableNumbers.length || parentAvailable.length}
        </div>
      </DialogContent>
    </Dialog>
  );
}
