"use client";

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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sparkles,
  CreditCard,
  Award as IdCard,
  Mail,
  Phone,
  User,
  Map as MapIcon,
  Music,
  Waves,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/* =========================
   Tipos (alineados a tus APIs)
========================= */
type TableLoc = "piscina" | "dj" | "general";

type VipConfig = {
  vipLocationId: string;
  locationName: string;
  price: number;
  limit: number;
  sold: number;
  remaining: number;
  capacityPerTable: number;
  startNumber?: number | null;
  endNumber?: number | null;
};

type TicketsConfigResponse = {
  eventId: string;
  vipTables: VipConfig[];
  totals?: {
    unitVipSize?: number;
    totalTables?: number;
  };
};

type AvailabilityTable = {
  id: string;
  tableNumber: number;
  status: "available" | "reserved" | "sold" | "blocked";
  price: number;
  capacityPerTable: number;
  available: boolean;
};

type AvailabilityResponse = {
  ok: boolean;
  total: number;
  tables: AvailabilityTable[];
  mapUrl?: string | null; // 👈 nuevo campo opcional
};

interface VIPTableModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** opcional: si querés sobreescribir el endpoint */
  configEndpoint?: string; // default /api/admin/tickets/config
  availabilityEndpoint?: string; // default /api/vip-tables/availability
  mapImageUrl?: string; // default /mapa.jpg
}

/* =========================
   Utils
========================= */
function formatMoney(n?: number | null) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "-";
  return n.toLocaleString("es-AR");
}
function cleanDigits(s: string) {
  return (s || "").replace(/\D+/g, "");
}
function range(from?: number | null, to?: number | null) {
  if (!Number.isFinite(from as number) || !Number.isFinite(to as number)) return [];
  if ((to as number) < (from as number)) return [];
  const len = (to as number) - (from as number) + 1;
  return Array.from({ length: len }, (_, i) => (from as number) + i);
}

/* =========================
   Componente
========================= */
export function VIPTableModal({
  open,
  onOpenChange,
  configEndpoint = "/api/admin/tickets/config",
  availabilityEndpoint = "/api/vip-tables/availability",
}: VIPTableModalProps) {

  /* --------- Config global --------- */
  const [resolvedEventId, setResolvedEventId] = useState<string | null>(null);
  const [vipTablesCfg, setVipTablesCfg] = useState<VipConfig[]>([]);
  const [cfgLoading, setCfgLoading] = useState(false);
  const [cfgError, setCfgError] = useState<string | null>(null);
  const [mapImageUrl, setMapImageUrl] = useState<string>("/mapa.jpg");


  /* --------- UI selección --------- */
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  /* --------- Availability --------- */
  const [tables, setTables] = useState<AvailabilityTable[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);

  /* --------- Cliente --------- */
  const [customer, setCustomer] = useState({
    name: "",
    dni: "",
    email: "",
    phone: "",
    gender: "" as "" | "hombre" | "mujer",
  });
  const [tableNumberDisplay, setTableNumberDisplay] = useState<number | null>(null);

  /* --------- Estado general --------- */
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mapOpen, setMapOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  /* =========================
     1) Cargar configuración (eventId + vipTables)
  ========================== */
  useEffect(() => {
    let cancelled = false;
    async function loadConfig() {
      if (!open) return;
      setCfgLoading(true);
      setCfgError(null);
      setTables([]); // limpiar por si cambiamos de evento
      setTableNumberDisplay(null);

      try {
        const res = await fetch(configEndpoint, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: TicketsConfigResponse = await res.json();

        if (cancelled) return;

        const eventId = data?.eventId || null;
        setResolvedEventId(eventId);

        const list = Array.isArray(data?.vipTables) ? data.vipTables : [];
        setVipTablesCfg(list);

        // Elegir ubicación por defecto: con stock > 0 o primera
        const firstWithStock = list.find((v) => (v?.remaining ?? 0) > 0);
        const defId = (firstWithStock?.vipLocationId || list[0]?.vipLocationId) ?? null;
        setSelectedLocationId(defId);
      } catch (e) {
        console.error("[VIPTableModal] config error:", e);
        if (!cancelled) setCfgError("No se pudo cargar la configuración de Mesas VIP.");
      } finally {
        if (!cancelled) setCfgLoading(false);
      }
    }
    loadConfig();
    return () => {
      cancelled = true;
    };
  }, [open, configEndpoint]);

  /* Helpers de ubicación seleccionada */
  const selectedLocCfg: VipConfig | null = useMemo(() => {
    if (!selectedLocationId) return null;
    return vipTablesCfg.find((v) => v.vipLocationId === selectedLocationId) || null;
  }, [vipTablesCfg, selectedLocationId]);

  /* KPIs mostrados */
  const vipPrice = selectedLocCfg?.price ?? null;
  const remainingTables = selectedLocCfg?.remaining ?? null;
  const unitSize = selectedLocCfg?.capacityPerTable ?? null;

  const startGlobal = selectedLocCfg?.startNumber ?? null;
  const endGlobal = selectedLocCfg?.endNumber ?? null;
  const isGlobalNumbering =
    Number.isFinite(startGlobal as number) &&
    Number.isFinite(endGlobal as number) &&
    !!startGlobal &&
    !!endGlobal;

  useEffect(() => {
  let cancelled = false;

  async function loadAvailability() {
    setTables([]);
    setTableNumberDisplay(null);

    if (!open) return;
    if (!resolvedEventId) return;
    if (!selectedLocCfg?.vipLocationId) return;

    try {
      setTablesLoading(true);
      const url = `${availabilityEndpoint}?eventId=${encodeURIComponent(
        resolvedEventId
      )}&vipLocationId=${encodeURIComponent(selectedLocCfg.vipLocationId)}`;

      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) {
        if (r.status === 400) {
          console.warn("[VIPTableModal] availability 400: faltan parámetros");
          return;
        }
        throw new Error(`HTTP ${r.status}`);
      }
      const data: AvailabilityResponse = await r.json();
      if (cancelled) return;

      const arr = Array.isArray(data?.tables) ? data.tables : [];
      arr.sort((a, b) => a.tableNumber - b.tableNumber);
      setTables(arr);

      // ✅ NUEVO: guardar la URL del mapa
      setMapImageUrl(data?.mapUrl || "/mapa.jpg");

    } catch (err) {
      console.error("[VIPTableModal] availability error:", err);
      if (!cancelled) setTables([]);
    } finally {
      if (!cancelled) setTablesLoading(false);
    }
  }

  loadAvailability();
  return () => {
    cancelled = true;
  };
}, [open, resolvedEventId, selectedLocCfg?.vipLocationId, availabilityEndpoint]);

  /* =========================
     3) Números visibles (preferimos los de availability)
  ========================== */
  const displayNumbers: number[] = useMemo(() => {
    if (tables.length > 0) {
      return tables.map((t) => t.tableNumber);
    }
    // Fallback por rango global
    if (isGlobalNumbering) {
      return range(startGlobal, endGlobal);
    }
    // Fallback a 1..limit si no hay tabla ni rango
    const lim = selectedLocCfg?.limit ?? 0;
    if (lim > 0) return range(1, lim);
    return [];
  }, [tables, isGlobalNumbering, startGlobal, endGlobal, selectedLocCfg?.limit]);

  const takenSet = useMemo(() => {
    if (tables.length === 0) return new Set<number>();
    return new Set<number>(tables.filter((t) => !t.available).map((t) => t.tableNumber));
  }, [tables]);

  const totalTablesInLoc =
    (displayNumbers && displayNumbers.length) || selectedLocCfg?.limit || 0;
  const takenCount = takenSet.size;
  const availableCount =
    totalTablesInLoc > 0 ? Math.max(0, totalTablesInLoc - takenCount) : 0;

  const soldOut =
    typeof remainingTables === "number"
      ? remainingTables <= 0
      : availableCount <= 0;

  /* =========================
     Validaciones & Checkout
  ========================== */
  function validate() {
    const e: Record<string, string> = {};
    if (!selectedLocCfg) e.location = "Elegí una ubicación de mesa.";

    if (!vipPrice || vipPrice <= 0) e.price = "Precio no disponible.";
    if (soldOut) e.stock = "No hay mesas disponibles.";

    if (!customer.name.trim()) e.name = "Ingresá tu nombre completo";
    const dniDigits = cleanDigits(customer.dni);
    if (!dniDigits) e.dni = "Ingresá tu DNI";
    else if (dniDigits.length < 7 || dniDigits.length > 9) e.dni = "DNI inválido";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))
      e.email = "Ingresá un email válido";

    const phoneDigits = cleanDigits(customer.phone);
    if (!phoneDigits) e.phone = "Ingresá tu celular";
    else if (phoneDigits.length < 8) e.phone = "Celular inválido";

    if (!customer.gender) e.gender = "Elegí tu género";

    if (!tableNumberDisplay) e.table = "Elegí el número de mesa";
    if (tableNumberDisplay && takenSet.has(tableNumberDisplay)) {
      e.table = "Esa mesa ya está ocupada.";
    }

    // Validar rangos
    if (tableNumberDisplay && displayNumbers.length > 0) {
      const min = displayNumbers[0];
      const max = displayNumbers[displayNumbers.length - 1];
      if (tableNumberDisplay < min || tableNumberDisplay > max) {
        e.table = "Número de mesa inválido para esta ubicación.";
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const handleCheckout = async () => {
    if (isProcessing) return;
    if (!validate()) return;

    setIsProcessing(true);
    try {
      const locLabel = selectedLocCfg?.locationName || "VIP";
      const capacity =
        typeof unitSize === "number" && Number.isFinite(unitSize)
          ? unitSize
          : undefined;

      const body = {
        items: [
          {
            title: `Mesa VIP (${locLabel}) — Mesa ${tableNumberDisplay}`,
            description: capacity
              ? `1 mesa = ${capacity} personas`
              : "Reserva de Mesa VIP",
            quantity: 1,
            unit_price: vipPrice ?? 0,
          },
        ],
        payer: {
          name: customer.name.trim(),
          email: customer.email.trim(),
          phone: cleanDigits(customer.phone),
          dni: cleanDigits(customer.dni),
          additionalInfo: {
            ticketType: "vip",
            vipLocationId: selectedLocationId,
            locationId: selectedLocCfg?.vipLocationId,
            location: locLabel,
            tableNumber: tableNumberDisplay ?? undefined,
            unitSize: capacity,
            gender: customer.gender || undefined,
          },
        },
        type: "ticket" as const,
        meta: {
          ticketType: "vip",
          locationId: selectedLocCfg?.vipLocationId,
          location: locLabel,
          tableNumber: tableNumberDisplay ?? undefined,
          unitSize: capacity,
          gender: customer.gender || undefined,
        },
      };

      const res = await fetch("/api/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data) {
        console.error("create-payment error:", data);
        alert("No pudimos iniciar el pago. Probá nuevamente.");
        setIsProcessing(false);
        return;
      }

      const url =
        process.env.NODE_ENV === "production"
          ? data?.init_point
          : data?.sandbox_init_point || data?.init_point;

      if (!url) {
        console.error("Respuesta sin init_point/sandbox_init_point:", data);
        alert("No pudimos obtener la URL de pago. Probá nuevamente.");
        setIsProcessing(false);
        return;
      }
      window.location.assign(url);
    } catch (err) {
      console.error("Error al procesar la reserva:", err);
      alert("Hubo un error al procesar tu reserva. Intentá nuevamente.");
      setIsProcessing(false);
    }
  };

  /* =========================
     UI helpers
  ========================== */
  const hasDJ = vipTablesCfg.some((v) =>
    v.locationName.toLowerCase().includes("dj")
  );
  const hasPiscina = vipTablesCfg.some((v) =>
    v.locationName.toLowerCase().includes("piscina")
  );

  const isNumberDisabled = (n: number) => {
    if (takenSet.has(n)) return true;
    if (soldOut) return true;
    return false;
  };

  const totalToPay = useMemo(() => Math.max(0, vipPrice ?? 0), [vipPrice]);

  /* =========================
     Render
  ========================== */
  return (
   <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94vw] max-w-2xl md:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl md:text-3xl font-display flex items-center gap-2">
            <Sparkles className="w-6 h-6 md:w-8 md:h-8 text-[#5b0d0d]" />
            Reservar Mesa VIP
          </DialogTitle>
          <DialogDescription className="text-sm md:text-base">
            Elegí ubicación, número de mesa y completá tus datos
          </DialogDescription>
        </DialogHeader>

        {cfgError && (
          <div className="text-red-700 bg-red-50 border border-red-200 rounded-md p-3 text-sm">
            {cfgError}
          </div>
        )}

           {/* KPIs */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "Precio por mesa", value: `$${formatMoney(vipPrice)}` },
            {
              label: "Disponibles",
              value: `${availableCount} / ${totalTablesInLoc}`,
              color: availableCount <= 0 ? "text-red-600" : "text-emerald-700",
            },
            { label: "Capacidad", value: `${unitSize ?? "-"} pers.` },
          ].map((kpi, i) => (
            <div
              key={i}
              className="rounded-xl border bg-white p-4 text-center flex flex-col justify-center"
            >
              <div className="text-xs md:text-sm font-semibold text-gray-700">
                {kpi.label}
              </div>
              <div
                className={`mt-1 text-2xl md:text-4xl font-extrabold tracking-tight ${
                  kpi.color || ""
                }`}
              >
                {kpi.value}
              </div>
            </div>
          ))}
        </div>

        {/* ======= Ubicaciones ======= */}
        {vipTablesCfg.length > 0 && (
          <div className="rounded-xl border p-3 sm:p-4 bg-white/60 mt-4">
            <p className="text-sm font-semibold mb-3">Ubicaciones disponibles</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {vipTablesCfg.map((loc) => {
                const active = selectedLocationId === loc.vipLocationId;
                const disp = Math.max(0, loc.remaining);
                const isDJ = /dj/i.test(loc.locationName);
                const isPiscina = /piscina/i.test(loc.locationName);

                return (
                  <button
                    key={loc.vipLocationId}
                    type="button"
                    onClick={() => {
                      setSelectedLocationId(loc.vipLocationId);
                      setTableNumberDisplay(null);
                    }}
                    className={[
                      "text-left w-full p-4 rounded-xl border transition shadow-sm",
                      active
                        ? "bg-[#5b0d0d] text-white border-[#5b0d0d]"
                        : "bg-white hover:bg-[#fff2f2] border-gray-300 text-gray-900",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-base">
                        {isDJ ? "Cerca del DJ" : isPiscina ? "Cerca de la PISCINA" : loc.locationName}
                      </div>
                      <div
                        className={[
                          "px-2 py-0.5 rounded-full text-xs font-semibold",
                          disp > 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700",
                        ].join(" ")}
                      >
                        {disp > 0 ? "Con lugares" : "Agotado"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Hint del rango GLOBAL visible */}
            {isGlobalNumbering && (
              <p className="mt-2 text-xs text-muted-foreground">
                Numeración de mesas en esta ubicación: <b>{startGlobal}–{endGlobal}</b>
              </p>
            )}
          </div>
        )}

        {/* ======= Mesas ======= */}
        {displayNumbers.length > 0 && (
          <div className="rounded-xl border p-3 sm:p-4 bg-white/60 mt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">
                Mesas en {selectedLocCfg?.locationName ?? "Ubicación"}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMapOpen(true)}
                className="h-9"
              >
                <MapIcon className="w-4 h-4 mr-2" />
                Ver mapa
              </Button>
            </div>

            <div className="grid grid-cols-5 sm:grid-cols-8 gap-2">
              {displayNumbers.map((n) => {
                const active = tableNumberDisplay === n;
                const occupied = takenSet.has(n);
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => !occupied && setTableNumberDisplay(n)}
                    disabled={isNumberDisabled(n)}
                    className={[
                      "h-10 rounded-md border text-sm font-semibold transition",
                      "flex items-center justify-center",
                      occupied
                        ? "bg-gray-200 text-gray-500 border-gray-300 cursor-not-allowed"
                        : active
                        ? "bg-[#5b0d0d] text-white border-[#5b0d0d] shadow"
                        : "bg-white text-gray-900 border-gray-300 hover:bg-[#fff2f2]",
                    ].join(" ")}
                    aria-pressed={active}
                    title={occupied ? "Ocupada" : "Libre"}
                  >
                    {n}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-4 text-xs mt-3 text-gray-600">
              <div className="flex items-center gap-1">
                <span className="w-4 h-4 bg-gray-300 border border-gray-400 rounded-sm inline-block" />
                Ocupada
              </div>
              <div className="flex items-center gap-1">
                <span className="w-4 h-4 bg-white border border-gray-300 rounded-sm inline-block" />
                Libre
              </div>
              <div className="flex items-center gap-1">
                <span className="w-4 h-4 bg-[#5b0d0d] rounded-sm inline-block" />
                Seleccionada
              </div>
              {tablesLoading && (
                <span className="ml-auto text-gray-500">Actualizando…</span>
              )}
            </div>

            <Dialog open={mapOpen} onOpenChange={setMapOpen}>
              <DialogContent className="max-w-3xl w=[94vw]">
                <DialogHeader>
                  <DialogTitle>Mapa de ubicación de mesas</DialogTitle>
                  <DialogDescription>
                    Visualizá el layout del sector para elegir mejor tu mesa.
                  </DialogDescription>
                </DialogHeader>
                <div className="w-full rounded-lg overflow-hidden border bg-black/5">
                  <img
                    src={mapImageUrl}
                    alt="Mapa de mesas VIP"
                    className="w-full h-auto object-contain max-h-[70vh] select-none"
                    draggable={false}
                  />
                </div>
              </DialogContent>
            </Dialog>

            {errors.table && (
              <p className="text-sm text-red-600 mt-2">{errors.table}</p>
            )}
          </div>
        )}

        {/* ======= Datos del cliente ======= */}
        <div className="space-y-4 mt-4">
          <h3 className="font-semibold text-base sm:text-lg">Tus datos</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="vip-name">Nombre completo</Label>
              <Input
                id="vip-name"
                value={customer.name}
                onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                className="h-12"
                placeholder="Juan Pérez"
              />
              {errors.name && <p className="text-sm text-red-600">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vip-dni" className="flex items-center gap-2">
                <IdCard className="w-4 h-4" />
                DNI
              </Label>
              <Input
                id="vip-dni"
                value={customer.dni}
                onChange={(e) => setCustomer({ ...customer, dni: e.target.value })}
                className="h-12"
                inputMode="numeric"
                placeholder="12345678"
              />
              {errors.dni && <p className="text-sm text-red-600">{errors.dni}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vip-email" className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Correo electrónico
              </Label>
              <Input
                id="vip-email"
                type="email"
                value={customer.email}
                onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                className="h-12"
                placeholder="juan@ejemplo.com"
              />
              {errors.email && <p className="text-sm text-red-600">{errors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vip-phone" className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Número de celular
              </Label>
              <Input
                id="vip-phone"
                type="tel"
                value={customer.phone}
                onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                className="h-12"
                placeholder="+54 11 1234-5678"
                inputMode="tel"
              />
              {errors.phone && <p className="text-sm text-red-600">{errors.phone}</p>}
            </div>
          </div>

          {/* Género */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <User className="w-4 h-4" />
              Género
            </Label>

            <RadioGroup
              value={customer.gender}
              onValueChange={(value) =>
                setCustomer({ ...customer, gender: value as "hombre" | "mujer" })
              }
              className="grid grid-cols-2 gap-3 sm:gap-4"
            >
              <div>
                <RadioGroupItem value="hombre" id="vip-gender-hombre" className="peer sr-only" />
                <Label
                  htmlFor="vip-gender-hombre"
                  className={`flex flex-col items-center justify-center rounded-lg border-2 bg-white p-3 sm:p-4 cursor-pointer transition-all
                    border-[#e5e5e5] hover:bg-[#fff2f2] hover:text-[#2a0606]
                    peer-data-[state=checked]:border-[#5b0d0d]
                    peer-data-[state=checked]:bg-[#5b0d0d]/10`}
                >
                  <span className="text-2xl mb-2">👨</span>
                  <span className="font-semibold text-sm sm:text-base">Hombre</span>
                </Label>
              </div>

              <div>
                <RadioGroupItem value="mujer" id="vip-gender-mujer" className="peer sr-only" />
                <Label
                  htmlFor="vip-gender-mujer"
                  className={`flex flex-col items-center justify-center rounded-lg border-2 bg-white p-3 sm:p-4 cursor-pointer transition-all
                    border-[#e5e5e5] hover:bg-[#fff2f2] hover:text-[#2a0606]
                    peer-data-[state=checked]:border-[#7f0d0d]
                    peer-data-[state=checked]:bg-[#7f0d0d]/10`}
                >
                  <span className="text-2xl mb-2">👩</span>
                  <span className="font-semibold text-sm sm:text-base">Mujer</span>
                </Label>
              </div>
            </RadioGroup>
            {errors.gender && <p className="text-sm text-red-600">{errors.gender}</p>}
          </div>
        </div>

        {/* ======= Summary + Pago ======= */}
        <div className="rounded-xl p-4 sm:p-6 space-y-4 border-2 bg-gradient-to-r from-[#4a0a0a]/10 to-[#7a0a0a]/10 border-[#5b0d0d]/20 mt-4">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center text-xl sm:text-2xl">
              <span className="font-bold">Total a pagar:</span>
              <span className="font-bold text-[#2a0606]">
                ${formatMoney(totalToPay)}
              </span>
            </div>
            {tableNumberDisplay && (
              <p className="text-sm text-muted-foreground">
                Mesa seleccionada: <b>#{tableNumberDisplay}</b>
              </p>
            )}
          </div>

          <Button
            size="lg"
            onClick={handleCheckout}
            disabled={
              isProcessing ||
              cfgLoading ||
              !!cfgError ||
              !vipPrice ||
              soldOut ||
              !selectedLocCfg ||
              !customer.gender ||
              !tableNumberDisplay
            }
            aria-disabled={soldOut || undefined}
            className="
              w-full text-base sm:text-lg py-4 sm:py-6 rounded-full text-white
              bg-gradient-to-r from-[#2a0606] via-[#5b0d0d] to-[#7f0d0d]
              hover:scale-[1.02] hover:brightness-110
              transition-transform disabled:opacity-60
            "
          >
            <CreditCard className="w-5 h-5 mr-2" />
            {isProcessing ? "Procesando..." : soldOut ? "Agotadas" : "Reservar con Mercado Pago"}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Serás redirigido a Mercado Pago para completar tu reserva de forma segura
          </p>

          {(errors.price || errors.stock || errors.table) && (
            <p className="text-sm text-red-600 text-center">
              {errors.price || errors.stock || errors.table}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
