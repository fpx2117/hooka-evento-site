"use client";

import * as React from "react";
import { DownloadCloud, FileSpreadsheet, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format as fmt } from "date-fns";

type Format = "excel" | "pdf";
type EventOption = { id: string; name: string; isActive?: boolean };

const EVENTS_URL = "/api/admin/events";

export function ExportModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  // ÚNICA opción: Tickets totales
  const DATASET_LABEL = "Tickets totales";
  const DATASET_VALUE = "tickets"; // se envía al backend para compatibilidad

  const [formatType, setFormatType] = React.useState<Format>("excel");

  // Eventos (por nombre)
  const [events, setEvents] = React.useState<EventOption[]>([]);
  const [eventsLoading, setEventsLoading] = React.useState(false);
  const [eventsError, setEventsError] = React.useState<string | null>(null);
  const [eventId, setEventId] = React.useState<string>("");

  const [dateFrom, setDateFrom] = React.useState<string>("");
  const [dateTo, setDateTo] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);

  // Cargar eventos al abrir
  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setEventsLoading(true);
      setEventsError(null);
      try {
        const res = await fetch(`${EVENTS_URL}?active=1`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("No se pudieron cargar los eventos");
        const data = await res.json();
        const list: EventOption[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.events)
            ? data.events
            : [];
        if (!alive) return;
        setEvents(list);
        if (list.length === 1) setEventId(list[0].id);
      } catch (e: any) {
        if (!alive) return;
        setEventsError(e?.message || "Error cargando eventos");
      } finally {
        if (alive) setEventsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  const handleExport = async () => {
    setLoading(true);
    try {
      const payload = {
        dataset: DATASET_VALUE, // única opción
        format: formatType,
        filters: {
          eventId: eventId || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
      };

      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "No se pudo generar el archivo");
      }

      const blob = await res.blob();
      const stamp = fmt(new Date(), "yyyyMMdd_HHmm");
      const fname = `tickets_totales_${stamp}.${formatType === "excel" ? "xlsx" : "pdf"}`;

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = fname;
      document.body.appendChild(link);
      link.click();
      link.remove();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Error al exportar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DownloadCloud className="w-5 h-5" />
            Exportar datos
          </DialogTitle>
          <DialogDescription>
            Generá un archivo con la información total de tickets (incluye
            generales y VIP).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Conjunto - SOLO UNA OPCIÓN */}
            <div className="space-y-2">
              <Label>Conjunto</Label>
              <Select value="only" disabled>
                <SelectTrigger>
                  <SelectValue placeholder={DATASET_LABEL} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="only">{DATASET_LABEL}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Formato */}
            <div className="space-y-2">
              <Label>Formato</Label>
              <Select
                value={formatType}
                onValueChange={(v) => setFormatType(v as Format)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegí formato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="excel">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4" /> Excel (.xlsx)
                    </div>
                  </SelectItem>
                  <SelectItem value="pdf">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4" /> PDF (.pdf)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Evento por nombre */}
          <div className="space-y-2">
            <Label>Evento (opcional)</Label>
            <Select
              value={eventId || "all"}
              onValueChange={(v) => setEventId(v === "all" ? "" : v)}
              disabled={eventsLoading || !!eventsError}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    eventsLoading
                      ? "Cargando eventos…"
                      : eventsError
                        ? "No se pudieron cargar los eventos"
                        : "Elegí un evento (opcional)"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los eventos</SelectItem>
                {events.map((ev) => (
                  <SelectItem key={ev.id} value={ev.id}>
                    {ev.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {eventsError && (
              <p className="text-xs text-red-600">{eventsError}</p>
            )}
          </div>

          {/* Rango de fechas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Desde (opcional)</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Hasta (opcional)</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={loading}>
            {loading ? "Generando..." : "Exportar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
