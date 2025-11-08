"use client";

import { useState, useEffect } from "react";
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
  MapPin,
  SlidersHorizontal,
  Users,
  Crown,
  Layers,
  Trash2,
  Pencil,
  Image as ImageIcon,
  Eye,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import CreateVipTablesModal from "./CreateVipTablesModal";
import AddVipLocationModal from "./AddVipLocationModal";
import UploadVipMapModal from "./UploadVipMapModal";
import { TicketsConfig, VipLocation, VipTableConfig } from "../types";

/* =============================================
   Tipos
============================================= */
type VipTable = {
  id: string;
  tableNumber?: number | null;
  vipLocationId: string;
  price?: number;
  capacityPerTable?: number;
  status?: string;
  ticketStatus?: string;
};

export default function ConfigModal({
  open,
  onOpenChange,
  cfg,
  configForm,
  setConfigForm,
  vipTablesForm,
  setVipTablesForm,
  onSubmit,
  isMobile,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cfg: TicketsConfig | null;
  configForm: {
    totalLimitPersons: number;
    genHPrice: number;
    genMPrice: number;
  };
  setConfigForm: (f: {
    totalLimitPersons: number;
    genHPrice: number;
    genMPrice: number;
  }) => void;
  vipTablesForm: any[];
  setVipTablesForm: (rows: any[]) => void;
  onSubmit: (e: React.FormEvent) => void;
  isMobile: boolean;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [openVipCreator, setOpenVipCreator] = useState(false);
  const [editLocation, setEditLocation] = useState<VipLocation | null>(null);
  const [openAddLocation, setOpenAddLocation] = useState(false);
  const [vipLocations, setVipLocations] = useState<VipLocation[]>([]);
  const [vipConfigs, setVipConfigs] = useState<VipTableConfig[]>([]);
  const [vipTables, setVipTables] = useState<VipTable[]>([]);
  const [openUploadMap, setOpenUploadMap] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<VipTableConfig | null>(
    null
  );

  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [savingEvent, setSavingEvent] = useState(false);
  const [deletingEvent, setDeletingEvent] = useState(false);

  const modalClass = isMobile
    ? "w-[100vw] h-[100vh] max-w-none rounded-none overflow-y-auto"
    : "sm:max-w-3xl sm:max-h-[90vh] overflow-y-auto";

  const eventId = cfg?.eventId?.trim() || "";

  /* =============================================
     Fetchers
  ============================================= */
  const fetchVipLocations = async () => {
    if (!eventId) return;
    try {
      const { data } = await axios.get("/api/vip-tables/locations", {
        params: { eventId },
      });
      if (data.ok) setVipLocations(data.locations || []);
    } catch {
      toast.error("No se pudieron cargar las ubicaciones VIP.");
    }
  };

  const fetchVipConfigs = async () => {
    if (!eventId) return;
    try {
      const { data } = await axios.get("/api/vip-tables/config", {
        params: { eventId },
      });
      if (data.ok) setVipConfigs(data.configs || []);
    } catch {
      toast.error("No se pudieron cargar las configuraciones VIP.");
    }
  };

  const fetchVipTables = async () => {
    if (!eventId) return;
    try {
      const { data } = await axios.get("/api/vip-tables/tables", {
        params: { eventId },
      });
      if (data.ok) {
        const normalized =
          (data.data || []).map((t: any) => ({
            ...t,
            tableNumber:
              typeof t.tableNumber === "number"
                ? t.tableNumber
                : typeof t.number === "number"
                ? t.number
                : typeof t.table === "number"
                ? t.table
                : null,
          })) || [];
        setVipTables(normalized);
      }
    } catch {
      toast.error("No se pudieron cargar las mesas VIP.");
    }
  };

  const fetchEventBasics = async () => {
    if (!eventId) return;
    try {
      const { data } = await axios.get("/api/admin/events");
      if (data.ok && Array.isArray(data.data)) {
        const ev = data.data.find((x: any) => x.id === eventId);
        if (ev) {
          setEventName(ev.name || "");
          if (ev.date) {
            const d = new Date(ev.date);
            const localDate =
              d.getFullYear() +
              "-" +
              String(d.getMonth() + 1).padStart(2, "0") +
              "-" +
              String(d.getDate()).padStart(2, "0");
            setEventDate(localDate);
          } else setEventDate("");
        }
      }
    } catch {
      toast.error("Error al cargar datos del evento.");
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchVipLocations();
      fetchVipConfigs();
      fetchVipTables();
      fetchEventBasics();
    }
  }, [eventId]);

  /* =============================================
     Acciones
  ============================================= */
  const handleDeleteLocation = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar la ubicación "${name}"?`)) return;
    try {
      setDeleting(id);
      await axios.delete(`/api/vip-tables/locations/${id}`);
      toast.success(`Ubicación "${name}" eliminada ✅`);
      await Promise.all([
        fetchVipLocations(),
        fetchVipConfigs(),
        fetchVipTables(),
      ]);
    } catch {
      toast.error("Error al eliminar la ubicación VIP.");
    } finally {
      setDeleting(null);
    }
  };

  const handleEditTables = (loc: VipLocation) => {
    setEditLocation(loc);
    setOpenVipCreator(true);
  };

  const handleUpdateEventBasics = async () => {
    if (!eventId || !eventName.trim() || !eventDate) {
      toast.error("Completá nombre y fecha del evento.");
      return;
    }
    try {
      setSavingEvent(true);
      const { data } = await axios.patch("/api/admin/events", {
        id: eventId,
        name: eventName.trim(),
        date: eventDate,
      });
      if (data.ok) {
        toast.success("Evento actualizado correctamente ✅");
        await fetchEventBasics();
      } else toast.error(data.error || "No se pudo actualizar el evento.");
    } catch {
      toast.error("Error al actualizar el evento.");
    } finally {
      setSavingEvent(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!eventId) return;
    if (!confirm("¿Seguro que querés eliminar este evento?")) return;
    try {
      setDeletingEvent(true);
      const { data } = await axios.delete("/api/admin/events", {
        data: { id: eventId },
      });
      if (data.ok) {
        toast.success("Evento eliminado correctamente ✅");
        onOpenChange(false);
      } else toast.error(data.error || "No se pudo eliminar el evento.");
    } catch {
      toast.error("Error al eliminar el evento.");
    } finally {
      setDeletingEvent(false);
    }
  };

  const getApprovedCount = (locationId: string) => {
    const approvedTables = vipTables.filter(
      (t) =>
        t.vipLocationId === locationId &&
        (t.status?.toLowerCase() === "approved" ||
          t.status?.toLowerCase() === "aprobado" ||
          t.ticketStatus?.toLowerCase() === "approved" ||
          t.ticketStatus?.toLowerCase() === "aprobado")
    );
    return approvedTables.length;
  };

  /* =============================================
     Render
  ============================================= */
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={modalClass}>
          <DialogHeader className="pb-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <SlidersHorizontal className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <DialogTitle className="text-xl">
                  Configurar precios y cupos
                </DialogTitle>
                <DialogDescription>
                  Cupos totales, precios generales y mesas VIP.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* ==== Edición evento ==== */}
          <div className="rounded-xl border p-5 mt-4 space-y-4 bg-white/60">
            <h4 className="font-semibold text-lg">Datos del evento</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Nombre</Label>
                <Input
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                />
              </div>
              <div>
                <Label>Fecha</Label>
                <Input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                onClick={handleUpdateEventBasics}
                disabled={savingEvent}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {savingEvent ? "Guardando..." : "Guardar cambios"}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteEvent}
                disabled={deletingEvent}
              >
                {deletingEvent ? "Eliminando..." : "Eliminar evento"}
              </Button>
            </div>
          </div>

          {/* ==== Configuración general ==== */}
          <form onSubmit={onSubmit} className="space-y-6 pt-4">
            <div className="rounded-xl border p-5 bg-white/50">
              <h4 className="font-semibold text-lg mb-3">
                Cupos y precios generales
              </h4>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <Label>Cupo total</Label>
                  <Input
                    type="number"
                    value={configForm.totalLimitPersons}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        totalLimitPersons: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Precio Hombre</Label>
                  <Input
                    type="number"
                    value={configForm.genHPrice}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        genHPrice: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Precio Mujer</Label>
                  <Input
                    type="number"
                    value={configForm.genMPrice}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        genMPrice: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
            </div>

            {/* ==== Mesas VIP ==== */}
            <div className="rounded-xl border border-amber-200 p-5 bg-amber-50/40 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-600" />
                  <h4 className="font-semibold text-lg">Mesas VIP</h4>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOpenAddLocation(true)}
                  >
                    <MapPin className="w-4 h-4 mr-1" /> Nueva ubicación
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditLocation(null);
                      setOpenVipCreator(true);
                    }}
                  >
                    <Layers className="w-4 h-4 mr-1" /> Crear mesas
                  </Button>
                </div>
              </div>

              {vipLocations.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">
                  No hay ubicaciones VIP creadas.
                </p>
              ) : (
                vipLocations.map((loc) => {
                  const cfg = vipConfigs.find(
                    (c) => c.vipLocationId === loc.id
                  );
                  const approved = getApprovedCount(loc.id);
                  const tables = vipTables.filter(
                    (t) => t.vipLocationId === loc.id
                  );

                  return (
                    <div
                      key={loc.id}
                      className="border rounded-lg p-4 bg-white/70 space-y-2"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-amber-600" />
                          <b>{loc.name}</b>
                        </div>
                        <div className="flex gap-2">
                          {cfg && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedConfig(cfg);
                                setOpenUploadMap(true);
                              }}
                            >
                              <ImageIcon className="w-4 h-4 mr-1" />
                              Subir mapa
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditTables(loc)}
                          >
                            <Pencil className="w-4 h-4 mr-1" /> Editar
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-red-600 hover:bg-red-100"
                            onClick={() =>
                              handleDeleteLocation(loc.id, loc.name)
                            }
                            disabled={deleting === loc.id}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {cfg && (
                        <>
                          <div className="grid sm:grid-cols-4 gap-4 text-sm">
                            <div>
                              <Label>Precio</Label>
                              <p>${Number(cfg.price).toLocaleString()}</p>
                            </div>
                            <div>
                              <Label>Capacidad / mesa</Label>
                              <p>{cfg.capacityPerTable}</p>
                            </div>
                            <div>
                              <Label>Mesas totales</Label>
                              <p>{cfg.stockLimit}</p>
                            </div>
                            <div>
                              <Label>Vendidas (aprobadas)</Label>
                              <p className="text-green-700 font-semibold">
                                {approved}
                              </p>
                            </div>
                          </div>

                          {tables.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              <b>Mesas:</b>{" "}
                              {tables
                                .map(
                                  (t, i) =>
                                    `Mesa ${
                                      t.tableNumber || i + 1
                                    } (${t.status || "-"})`
                                )
                                .join(", ")}
                            </div>
                          )}

                          {cfg.mapUrl && (
                            <div className="pt-2">
                              <a
                                href={cfg.mapUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm"
                              >
                                <Eye className="w-4 h-4" />
                                Ver mapa
                              </a>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <Button type="submit" className="bg-blue-600 text-white">
                Guardar configuración
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ==== Modales hijos ==== */}
     <CreateVipTablesModal
  open={openVipCreator}
  onOpenChange={setOpenVipCreator}
  eventId={eventId}
  vipLocations={vipLocations}
  editLocation={editLocation}
  onSuccess={() => {
    fetchVipLocations();
    fetchVipConfigs();
    fetchVipTables();
  }}
  isMobile={isMobile}
/>

      <AddVipLocationModal
  open={openAddLocation}
  onOpenChange={setOpenAddLocation}
  eventId={eventId}
  onSuccess={() => {
    fetchVipLocations();
    fetchVipConfigs();
    fetchVipTables();
  }}
  isMobile={isMobile}
/>
      <UploadVipMapModal
  open={openUploadMap}
  onOpenChange={setOpenUploadMap}
  configId={selectedConfig?.id || ""}
  onSuccess={() => fetchVipConfigs()}
/>
    </>
  );
}
