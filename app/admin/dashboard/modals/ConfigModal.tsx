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
   Tipos internos
============================================= */
interface VipTable {
  id: string;
  tableNumber?: number | null;
  vipLocationId: string;
  price?: number;
  capacityPerTable?: number;
  status?: string;
  ticketStatus?: string;
}

/* =============================================
   COMPONENTE PRINCIPAL
============================================= */
export default function ConfigModal({
  open,
  onOpenChange,
  cfg,
  isMobile,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cfg: TicketsConfig | null;
  isMobile: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [vipLocations, setVipLocations] = useState<VipLocation[]>([]);
  const [vipConfigs, setVipConfigs] = useState<VipTableConfig[]>([]);
  const [vipTables, setVipTables] = useState<VipTable[]>([]);

  const [selectedConfig, setSelectedConfig] = useState<VipTableConfig | null>(
    null
  );

  const [openVipCreator, setOpenVipCreator] = useState(false);
  const [openAddLocation, setOpenAddLocation] = useState(false);
  const [openUploadMap, setOpenUploadMap] = useState(false);
  const [editLocation, setEditLocation] = useState<VipLocation | null>(null);

  // 🧩 Datos del evento
  const [eventId, setEventId] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");

  // 🎟️ Configuración general
  const [configForm, setConfigForm] = useState({
    totalLimitPersons: 0,
    genHPrice: 0,
    genMPrice: 0,
  });

  const modalClass = isMobile
    ? "w-[100vw] h-[100vh] max-w-none rounded-none overflow-y-auto"
    : "sm:max-w-4xl sm:max-h-[90vh] overflow-y-auto";

  /* =============================================
     🔄 Obtener configuración completa
  ============================================= */
  const fetchConfig = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/api/admin/events/config");
      if (!data.ok) throw new Error(data.error || "Error al obtener configuración");

      const e = data.event;
      setEventId(e.id);
      setEventName(e.name || "");
      setEventDate(e.date ? e.date.substring(0, 10) : "");

      const male = data.tickets?.general?.hombre;
      const female = data.tickets?.general?.mujer;

      setConfigForm({
        totalLimitPersons:
          (male?.stockLimit ?? 0) + (female?.stockLimit ?? 0),
        genHPrice: male ? Number(male.price) : 0,
        genMPrice: female ? Number(female.price) : 0,
      });

      setVipLocations(data.vipLocations || []);
      setVipConfigs(data.vipConfigs || []);

      // Opcional: si tu API incluye mesas aprobadas
      if (Array.isArray(data.vipTables)) {
        setVipTables(data.vipTables);
      } else {
        setVipTables([]);
      }
    } catch (err) {
      console.error(err);
      toast.error("No se pudo cargar la configuración del evento.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchConfig();
  }, [open]);

  /* =============================================
     💾 Guardar cambios de configuración
  ============================================= */
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!eventId || !eventName.trim() || !eventDate) {
      toast.error("Completá nombre y fecha del evento.");
      return;
    }

    try {
      setSaving(true);
      const payload = {
        eventId,
        name: eventName.trim(),
        date: eventDate,
        totalLimitPersons: Number(configForm.totalLimitPersons || 0),
        genHPrice: Number(configForm.genHPrice || 0),
        genMPrice: Number(configForm.genMPrice || 0),
      };

      const { data } = await axios.patch("/api/admin/events/config", payload);

      if (data.ok) {
        toast.success("Configuración guardada correctamente ✅");
        await fetchConfig();
      } else {
        toast.error(data.error || "Error al guardar configuración.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al guardar configuración.");
    } finally {
      setSaving(false);
    }
  };

  /* =============================================
     🗑️ Eliminar ubicación VIP
  ============================================= */
  const handleDeleteLocation = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar la ubicación "${name}"?`)) return;
    try {
      setDeleting(id);
      await axios.delete(`/api/vip-tables/locations/${id}`);
      toast.success(`Ubicación "${name}" eliminada ✅`);
      await fetchConfig();
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

  const getApprovedCount = (locationId: string): number => {
    const approvedTables = vipTables.filter(
      (t) =>
        t.vipLocationId === locationId &&
        ["approved", "aprobado"].includes(
          (t.status || t.ticketStatus || "").toLowerCase()
        )
    );
    return approvedTables.length;
  };

  /* =============================================
     🖼️ Render UI
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
                <DialogTitle className="text-xl font-semibold">
                  Configurar evento
                </DialogTitle>
                <DialogDescription>
                  Configurá los datos del evento, precios generales y mesas VIP.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* === FORM PRINCIPAL === */}
          <form onSubmit={handleSaveConfig} className="space-y-6 pt-4">
            {/* === DATOS DEL EVENTO === */}
            <div className="rounded-xl border p-5 bg-white/70 space-y-4">
              <h4 className="font-semibold text-lg">Datos del evento</h4>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Nombre del evento</Label>
                  <Input
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    placeholder="Ej: Hooka Fridays"
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
            </div>

            {/* === CUPOS Y PRECIOS === */}
            <div className="rounded-xl border p-5 bg-white/50 space-y-3">
              <h4 className="font-semibold text-lg mb-2">
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

            {/* === MESAS VIP === */}
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
              <Button
                type="submit"
                disabled={saving}
                className="bg-blue-600 text-white"
              >
                {saving ? "Guardando..." : "Guardar configuración"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* === Modales hijos === */}
      <CreateVipTablesModal
        open={openVipCreator}
        onOpenChange={setOpenVipCreator}
        eventId={eventId}
        vipLocations={vipLocations}
        editLocation={editLocation}
        onSuccess={fetchConfig}
        isMobile={isMobile}
      />

      <AddVipLocationModal
        open={openAddLocation}
        onOpenChange={setOpenAddLocation}
        eventId={eventId}
        onSuccess={fetchConfig}
        isMobile={isMobile}
      />

      <UploadVipMapModal
        open={openUploadMap}
        onOpenChange={setOpenUploadMap}
        configId={selectedConfig?.id || ""}
        onSuccess={fetchConfig}
      />
    </>
  );
}
