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
  Music,
  Waves,
  User,
  Map as MapIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/* =========================
   Tipos de la API de config
========================= */
type TableLoc = "piscina" | "dj" | "general";

type TicketsConfig = {
  tickets?: {
    vip?: {
      price?: number;
      remaining?: number;
      remainingTables?: number;
      unitSize?: number;
    };
  };
  vipTables?: Array<{
    location: TableLoc;
    price: number;
    limit: number; // mesas del sector
    sold: number;
    remaining: number;
    capacityPerTable: number;
    /** NUEVO: numeración GLOBAL por sector */
    startNumber?: number | null;
    endNumber?: number | null;
  }>;
  /** opcional si tu /config ya lo expone */
  totals?: {
    totalTables?: number;
  };
};

type AvailabilityRes = {
  /** Tomadas en numeración GLOBAL del sector seleccionado */
  taken?: number[];
};

/* =========================
   Props
========================= */
interface VIPTableModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configEndpoint?: string; // default /api/admin/tickets/config
  availabilityEndpoint?: string; // default /api/vip-tables/availability
  mapImageUrl?: string; // default /mapa.jpg
}

/* =========================
   Utils
========================= */
function formatMoney(n: number) {
  return n.toLocaleString("es-AR");
}
function cleanDigits(s: string) {
  return (s || "").replace(/\D+/g, "");
}
function range(from: number, to: number): number[] {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];
  const len = to - from + 1;
  return Array.from({ length: len }, (_, i) => from + i);
}

/* =========================
   VIPTableModal
========================= */
export function VIPTableModal({
  open,
  onOpenChange,
  configEndpoint = "/api/admin/tickets/config",
  availabilityEndpoint = "/api/vip-tables/availability",
  mapImageUrl = "/mapa.jpg",
}: VIPTableModalProps) {
  // ======= State de config VIP =======
  const [vipPriceGlobal, setVipPriceGlobal] = useState<number | null>(null);
  const [remainingTablesGlobal, setRemainingTablesGlobal] = useState<
    number | null
  >(null);
  const [unitSizeGlobal, setUnitSizeGlobal] = useState<number | null>(null);
  const [vipTablesCfg, setVipTablesCfg] = useState<TicketsConfig["vipTables"]>(
    []
  );
  const [selectedLocation, setSelectedLocation] = useState<TableLoc | null>(
    null
  );

  // ======= Disponibilidad por mesa (GLOBAL) =======
  const [takenSet, setTakenSet] = useState<Set<number>>(new Set());
  const [tablesLoading, setTablesLoading] = useState(false);

  // ======= Form =======
  const [customer, setCustomer] = useState({
    name: "",
    dni: "",
    email: "",
    phone: "",
    gender: "" as "" | "hombre" | "mujer",
  });
  const [tableNumber, setTableNumber] = useState<number | null>(null);

  const [cfgLoading, setCfgLoading] = useState(false);
  const [cfgError, setCfgError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mapOpen, setMapOpen] = useState(false);

  // ======= Traer config =======
  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      setCfgLoading(true);
      setCfgError(null);

      const tryEndpoints = [
        configEndpoint,
        "/api/admin/tickets/config",
        "/api/tickets/config",
      ];
      for (const ep of tryEndpoints) {
        try {
          const r = await fetch(ep, { cache: "no-store" });
          if (!r.ok) continue;
          const data: TicketsConfig = await r.json();
          if (cancelled) return;

          const v = data?.tickets?.vip ?? {};
          setVipPriceGlobal(typeof v.price === "number" ? v.price : null);
          setRemainingTablesGlobal(
            typeof v.remainingTables === "number" ? v.remainingTables : null
          );
          setUnitSizeGlobal(typeof v.unitSize === "number" ? v.unitSize : null);

          const tables = Array.isArray(data?.vipTables) ? data.vipTables : [];
          setVipTablesCfg(tables);

          const hasDJ = tables.find((t) => t.location === "dj");
          const hasPiscina = tables.find((t) => t.location === "piscina");
          const firstWithStock = tables.find((t) => (t?.remaining ?? 0) > 0);
          const defaultLoc =
            (hasDJ?.location as TableLoc) ||
            (hasPiscina?.location as TableLoc) ||
            (firstWithStock?.location as TableLoc) ||
            (tables[0]?.location as TableLoc) ||
            null;

          setSelectedLocation(defaultLoc ?? null);
          setCfgLoading(false);
          return;
        } catch {
          /* probar siguiente endpoint */
        }
      }

      if (!cancelled) {
        setCfgError("No se pudo cargar la configuración de Mesas VIP.");
        setCfgLoading(false);
      }
    }

    if (open) {
      loadConfig();
      setCustomer({ name: "", dni: "", email: "", phone: "", gender: "" });
      setTableNumber(null);
      setTakenSet(new Set());
      setErrors({});
    }
    return () => {
      cancelled = true;
    };
  }, [open, configEndpoint]);

  // ======= Config actual según ubicación =======
  const currentLocCfg = useMemo(() => {
    if (!selectedLocation) return null;
    return vipTablesCfg?.find((t) => t.location === selectedLocation) || null;
  }, [vipTablesCfg, selectedLocation]);

  // ======= Derivados mostrados =======
  const vipPrice = useMemo(
    () => currentLocCfg?.price ?? vipPriceGlobal ?? 0,
    [currentLocCfg, vipPriceGlobal]
  );
  const remainingTables = useMemo(
    () => currentLocCfg?.remaining ?? remainingTablesGlobal ?? 0,
    [currentLocCfg, remainingTablesGlobal]
  );
  const unitSize = useMemo(
    () => currentLocCfg?.capacityPerTable ?? unitSizeGlobal ?? null,
    [currentLocCfg, unitSizeGlobal]
  );

  // Numeración GLOBAL por sector
  const startGlobal = currentLocCfg?.startNumber ?? null;
  const endGlobal = currentLocCfg?.endNumber ?? null;

  // Fallback: si no viene start/end, usamos local 1..limit (igual funcionará porque el backend acepta global o local)
  const limitLocal = currentLocCfg?.limit ?? null;
  const displayNumbers: number[] = useMemo(() => {
    if (
      Number.isFinite(startGlobal) &&
      Number.isFinite(endGlobal) &&
      startGlobal &&
      endGlobal
    ) {
      return range(startGlobal, endGlobal);
    }
    if (limitLocal && limitLocal > 0) return range(1, limitLocal); // fallback local
    return [];
  }, [startGlobal, endGlobal, limitLocal]);

  const total = useMemo(() => Math.max(0, vipPrice || 0), [vipPrice]);

  const soldOut =
    typeof remainingTables === "number" && Number.isFinite(remainingTables)
      ? remainingTables <= 0
      : false;

  // ======= Traer disponibilidad (tomadas en GLOBAL) al cambiar ubicación =======
  useEffect(() => {
    let cancelled = false;
    async function loadAvailability() {
      setTablesLoading(true);
      setTakenSet(new Set());
      setTableNumber(null);

      if (!selectedLocation) {
        setTablesLoading(false);
        return;
      }

      try {
        const url = `${availabilityEndpoint}?location=${encodeURIComponent(selectedLocation)}`;
        const r = await fetch(url, { cache: "no-store" });
        if (r.ok) {
          const data: AvailabilityRes = await r.json();
          if (!cancelled) {
            const tk = (data?.taken || [])
              .map((n) => Number(n))
              .filter(Number.isFinite);
            setTakenSet(new Set(tk)); // GLOBAL
          }
        }
      } catch {
        // backend validará de todas maneras
      } finally {
        if (!cancelled) setTablesLoading(false);
      }
    }

    if (open) loadAvailability();
    return () => {
      cancelled = true;
    };
  }, [open, selectedLocation, availabilityEndpoint]);

  // ======= Validaciones =======
  function validate() {
    const e: Record<string, string> = {};

    if (!vipPrice || vipPrice <= 0)
      e.price = "Precio no disponible. Intentá nuevamente.";
    if (soldOut) e.stock = "No hay mesas disponibles.";
    if (!selectedLocation) e.location = "Elegí una ubicación de mesa.";

    if (!customer.name.trim()) e.name = "Ingresá tu nombre completo";

    const dniDigits = cleanDigits(customer.dni);
    if (!dniDigits) e.dni = "Ingresá tu DNI";
    else if (dniDigits.length < 7 || dniDigits.length > 9)
      e.dni = "DNI inválido";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))
      e.email = "Ingresá un email válido";

    const phoneDigits = cleanDigits(customer.phone);
    if (!phoneDigits) e.phone = "Ingresá tu celular";
    else if (phoneDigits.length < 8) e.phone = "Celular inválido";

    if (!customer.gender) e.gender = "Elegí tu género";

    // ✅ Mesa específica requerida (numeración GLOBAL si vino start/end)
    if (!tableNumber) e.table = "Elegí el número de mesa";
    if (tableNumber && takenSet.has(tableNumber)) {
      e.table = "Esa mesa ya está ocupada. Elegí otra.";
    }

    // Validación de rango segun GLOBAL (o local si no hay global)
    if (tableNumber) {
      if (displayNumbers.length > 0) {
        const min = displayNumbers[0];
        const max = displayNumbers[displayNumbers.length - 1];
        if (tableNumber < min || tableNumber > max) {
          e.table = "Número de mesa inválido para esta ubicación.";
        }
      } else if (limitLocal) {
        if (tableNumber < 1 || tableNumber > limitLocal) {
          e.table = "Número de mesa inválido para esta ubicación.";
        }
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ======= Ir a checkout (1 mesa) =======
  const handleCheckout = async () => {
    if (isProcessing) return;
    if (!validate()) return;

    setIsProcessing(true);
    try {
      const locLabel =
        selectedLocation === "dj"
          ? "Cerca del DJ"
          : selectedLocation === "piscina"
            ? "Cerca de la PISCINA"
            : "General";

      const capacity =
        typeof unitSize === "number" && Number.isFinite(unitSize)
          ? unitSize
          : undefined;

      const body = {
        items: [
          {
            title: `Mesa VIP (${locLabel}) — Mesa ${tableNumber}`,
            description: capacity
              ? `1 mesa = ${capacity} personas`
              : "Reserva de Mesa VIP",
            quantity: 1,
            unit_price: vipPrice,
          },
        ],
        payer: {
          name: customer.name.trim(),
          email: customer.email.trim(),
          phone: cleanDigits(customer.phone),
          dni: cleanDigits(customer.dni),
          additionalInfo: {
            ticketType: "vip",
            tables: 1,
            unitSize: capacity,
            location: selectedLocation ?? undefined,
            tableNumber: tableNumber ?? undefined, // 👈 ENVIAMOS GLOBAL (backend lo acepta y normaliza)
            gender: customer.gender || undefined,
          },
        },
        type: "ticket" as const,
        meta: {
          ticketType: "vip",
          location: selectedLocation ?? undefined,
          tableNumber: tableNumber ?? undefined, // 👈 GLOBAL
          gender: customer.gender || undefined,
        },
      };

      const res = await fetch("/api/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("create-payment error:", err);
        alert("No pudimos iniciar el pago. Probá nuevamente.");
        setIsProcessing(false);
        return;
      }

      const data = await res.json();
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
    } catch (error) {
      console.error("Error al procesar la reserva:", error);
      alert("Hubo un error al procesar tu reserva. Intentá nuevamente.");
      setIsProcessing(false);
    }
  };

  // ======= UI helpers =======
  const hasDJ = !!vipTablesCfg?.find((t) => t.location === "dj");
  const hasPiscina = !!vipTablesCfg?.find((t) => t.location === "piscina");

  const isNumberDisabled = (n: number) => {
    if (takenSet.has(n)) return true; // GLOBAL
    if (soldOut) return true;
    return false;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94vw] sm:max-w-lg max-h-[86svh] sm:max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl sm:text-3xl font-display flex items-center gap-2 sm:gap-3">
            <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 text-[#5b0d0d]" />
            Reservar Mesa VIP
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base">
            Completá tus datos para reservar tu mesa VIP
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2 sm:py-4">
          {/* Price/Stock Display */}
          <div className="relative bg-gradient-to-r from-[#4a0a0a]/100 via-[#5b0d0d]/100 to-[#7a0a0a]/100 rounded-xl p-4 sm:p-6 space-y-3 text-white">
            <h3 className="font-display text-lg sm:text-xl font-bold text-center">
              Mesa VIP
              {selectedLocation
                ? ` — ${
                    selectedLocation === "dj"
                      ? "Cerca del DJ"
                      : selectedLocation === "piscina"
                        ? "Cerca de la PISCINA"
                        : "General"
                  }`
                : ""}
            </h3>

            {cfgLoading ? (
              <p className="text-center text-sm text-white/85">
                Cargando configuración…
              </p>
            ) : cfgError ? (
              <p className="text-center text-sm text-red-200">{cfgError}</p>
            ) : (
              <div
                className={`grid gap-3 sm:gap-4 ${
                  unitSize !== null
                    ? "grid-cols-1 sm:grid-cols-3"
                    : "grid-cols-1 sm:grid-cols-2"
                }`}
              >
                {/* Precio por mesa */}
                <div
                  className={`text-center p-4 rounded-lg bg-white text-black border border-black/100 shadow-sm ${
                    soldOut ? "opacity-70" : ""
                  }`}
                >
                  <p className="text-sm font-bold text-black mb-1">
                    Precio por mesa
                  </p>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-lg font-bold"> $ </span>
                    <span
                      className="
                        text-2xl font-bold tabular-nums tracking-tight leading-none
                        bg-gradient-to-r from-[#4a0a0a] via-[#5b0d0d] to-[#7a0a0a]
                        bg-clip-text text-transparent
                        bg-[length:200%_200%] animate-[gradient-move_6s_ease-in-out_infinite]
                      "
                    >
                      {formatMoney(vipPrice ?? 0)}
                    </span>
                  </div>
                </div>

                {/* Mesas disponibles */}
                <div className="relative text-center p-4 rounded-lg bg-white text-black border border-black/100 shadow-sm">
                  <p className="text-sm font-bold text-black mb-1">
                    Mesas disponibles
                  </p>
                  {soldOut ? (
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-2xl font-extrabold tracking-wide">
                        0
                      </span>
                      <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-red-600 text-white">
                        SOLD OUT
                      </span>
                      <span className="text-xs text-black/70">Agotadas</span>
                    </div>
                  ) : (
                    <p className="text-2xl font-bold">
                      {Math.max(0, remainingTables ?? 0)}
                    </p>
                  )}
                </div>

                {/* Equivalencia */}
                {unitSize !== null && (
                  <div
                    className={`text-center p-4 rounded-lg bg-white text-black border border-black/100 shadow-sm ${
                      soldOut ? "opacity-70" : ""
                    }`}
                  >
                    <p className="text-sm font-bold text-black mb-1">
                      Equivalencia
                    </p>
                    <p className="text-2xl font-bold">{unitSize}</p>
                    <p className="text-xs text-black/70 mt-1">pers./mesa</p>
                  </div>
                )}
              </div>
            )}

            {typeof remainingTables === "number" && (
              <p className="text-center text-xs sm:text-sm text-white/85">
                {soldOut ? (
                  <>
                    <b className="text-white">No hay mesas disponibles.</b> Te
                    avisamos cuando se libere stock.
                  </>
                ) : (
                  <>
                    La compra reserva <b className="text-white">1 mesa</b> por
                    transacción.
                  </>
                )}
              </p>
            )}
          </div>

          {/* Selector de ubicación */}
          <div className="rounded-xl border p-3 sm:p-4 bg-white/60">
            <p className="text-sm font-semibold mb-3">Elegí la ubicación</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                type="button"
                variant={selectedLocation === "dj" ? "default" : "outline"}
                onClick={() => setSelectedLocation("dj")}
                disabled={!hasDJ}
                className={`justify-start h-12 ${
                  selectedLocation === "dj"
                    ? "bg-[#5b0d0d] text-white hover:bg-[#4a0a0a]"
                    : ""
                }`}
              >
                <Music className="w-4 h-4 mr-2" />
                Cerca del DJ
              </Button>

              <Button
                type="button"
                variant={selectedLocation === "piscina" ? "default" : "outline"}
                onClick={() => setSelectedLocation("piscina")}
                disabled={!hasPiscina}
                className={`justify-start h-12 ${
                  selectedLocation === "piscina"
                    ? "bg-[#5b0d0d] text-white hover:bg-[#4a0a0a]"
                    : ""
                }`}
              >
                <Waves className="w-4 h-4 mr-2" />
                Cerca de la PISCINA
              </Button>
            </div>
            {errors.location && (
              <p className="text-sm text-red-600 mt-2">{errors.location}</p>
            )}
            {!hasDJ && !hasPiscina && (
              <p className="text-xs text-muted-foreground mt-2">
                * Por ahora no hay ubicaciones configuradas. Se usará el precio
                y stock general de VIP si está disponible.
              </p>
            )}

            {/* Hint del rango GLOBAL visible */}
            {Number.isFinite(startGlobal) &&
              Number.isFinite(endGlobal) &&
              startGlobal &&
              endGlobal && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Numeración de mesas en este sector:{" "}
                  <b>
                    {startGlobal}–{endGlobal}
                  </b>
                </p>
              )}
          </div>

          {/* Selector de número de mesa + Abrir mapa */}
          {displayNumbers.length > 0 && (
            <div className="rounded-xl border p-3 sm:p-4 bg-white/60">
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-sm font-semibold">
                  Elegí tu <span className="font-bold">número de mesa</span>
                  {selectedLocation ? ` (${selectedLocation})` : ""}
                </p>

                <div className="flex items-center gap-3">
                  {tablesLoading && (
                    <span className="text-xs text-muted-foreground">
                      Actualizando disponibilidad…
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMapOpen(true)}
                    className="h-9"
                    aria-label="Abrir mapa de ubicación de mesas"
                  >
                    <MapIcon className="w-4 h-4 mr-2" />
                    Abrir mapa
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-5 sm:grid-cols-8 gap-2">
                {displayNumbers.map((n) => {
                  const active = tableNumber === n;
                  const disabled = isNumberDisabled(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => !disabled && setTableNumber(n)}
                      disabled={disabled}
                      className={[
                        "h-10 rounded-md border text-sm font-semibold transition",
                        "flex items-center justify-center",
                        disabled
                          ? "bg-gray-200 text-gray-500 border-gray-300 cursor-not-allowed"
                          : active
                            ? "bg-[#5b0d0d] text-white border-[#5b0d0d] shadow"
                            : "bg-white text-gray-900 border-gray-300 hover:bg-[#fff2f2]",
                      ].join(" ")}
                      aria-pressed={active}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block w-4 h-4 rounded bg-white border border-gray-300" />
                  Disponible
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block w-4 h-4 rounded bg-[#5b0d0d]" />
                  Seleccionada
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block w-4 h-4 rounded bg-gray-200 border border-gray-300" />
                  Ocupada
                </span>
              </div>

              {errors.table && (
                <p className="text-sm text-red-600 mt-2">{errors.table}</p>
              )}

              {/* Modal del mapa */}
              <Dialog open={mapOpen} onOpenChange={setMapOpen}>
                <DialogContent className="max-w-3xl w-[94vw]">
                  <DialogHeader>
                    <DialogTitle>Mapa de ubicación de mesas</DialogTitle>
                    <DialogDescription>
                      Visualizá dónde están ubicadas las mesas para elegir mejor
                      la tuya.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="relative">
                    <div className="w-full rounded-lg overflow-hidden border bg-black/5">
                      <img
                        src={mapImageUrl}
                        alt="Mapa de mesas VIP"
                        className="w-full h-auto object-contain max-h-[70vh] select-none"
                        draggable={false}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      * Si tu mesa preferida está ocupada en el sistema, elegí
                      otra disponible.
                    </p>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* Datos del cliente */}
          <div className="space-y-4">
            <h3 className="font-semibold text-base sm:text-lg">Tus datos</h3>

            <div className="space-y-2">
              <Label htmlFor="vip-name" className="flex items-center gap-2">
                Nombre completo
              </Label>
              <Input
                id="vip-name"
                placeholder="Juan Pérez"
                value={customer.name}
                onChange={(e) =>
                  setCustomer({ ...customer, name: e.target.value })
                }
                className="h-12"
              />
              {errors.name && (
                <p className="text-sm text-red-600">{errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vip-dni" className="flex items-center gap-2">
                <IdCard className="w-4 h-4" />
                DNI
              </Label>
              <Input
                id="vip-dni"
                placeholder="12345678"
                value={customer.dni}
                onChange={(e) =>
                  setCustomer({ ...customer, dni: e.target.value })
                }
                className="h-12"
                inputMode="numeric"
              />
              {errors.dni && (
                <p className="text-sm text-red-600">{errors.dni}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vip-email" className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Correo electrónico
              </Label>
              <Input
                id="vip-email"
                type="email"
                placeholder="juan@ejemplo.com"
                value={customer.email}
                onChange={(e) =>
                  setCustomer({ ...customer, email: e.target.value })
                }
                className="h-12"
              />
              {errors.email && (
                <p className="text-sm text-red-600">{errors.email}</p>
              )}
            </div>

            {/* GÉNERO */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Género
              </Label>

              <RadioGroup
                value={customer.gender}
                onValueChange={(value) =>
                  setCustomer({
                    ...customer,
                    gender: value as "hombre" | "mujer",
                  })
                }
                className="grid grid-cols-2 gap-3 sm:gap-4"
              >
                <div>
                  <RadioGroupItem
                    value="hombre"
                    id="vip-gender-hombre"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="vip-gender-hombre"
                    className={`flex flex-col items-center justify-center rounded-lg border-2 bg-white p-3 sm:p-4 cursor-pointer transition-all
                      border-[#e5e5e5] hover:bg-[#fff2f2] hover:text-[#2a0606]
                      peer-data-[state=checked]:border-[#5b0d0d]
                      peer-data-[state=checked]:bg-[#5b0d0d]/10`}
                  >
                    <span className="text-2xl mb-2">👨</span>
                    <span className="font-semibold text-sm sm:text-base">
                      Hombre
                    </span>
                  </Label>
                </div>

                <div>
                  <RadioGroupItem
                    value="mujer"
                    id="vip-gender-mujer"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="vip-gender-mujer"
                    className={`flex flex-col items-center justify-center rounded-lg border-2 bg-white p-3 sm:p-4 cursor-pointer transition-all
                      border-[#e5e5e5] hover:bg-[#fff2f2] hover:text-[#2a0606]
                      peer-data-[state=checked]:border-[#7f0d0d]
                      peer-data-[state=checked]:bg-[#7f0d0d]/10`}
                  >
                    <span className="text-2xl mb-2">👩</span>
                    <span className="font-semibold text-sm sm:text-base">
                      Mujer
                    </span>
                  </Label>
                </div>
              </RadioGroup>
              {errors.gender && (
                <p className="text-sm text-red-600">{errors.gender}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vip-phone" className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Número de celular
              </Label>
              <Input
                id="vip-phone"
                type="tel"
                placeholder="+54 11 1234-5678"
                value={customer.phone}
                onChange={(e) =>
                  setCustomer({ ...customer, phone: e.target.value })
                }
                className="h-12"
                inputMode="tel"
              />
              {errors.phone && (
                <p className="text-sm text-red-600">{errors.phone}</p>
              )}
            </div>
          </div>

          {/* Summary + Pay */}
          <div className="rounded-xl p-4 sm:p-6 space-y-4 border-2 bg-gradient-to-r from-[#4a0a0a]/10 to-[#7a0a0a]/10 border-[#5b0d0d]/20">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-xl sm:text-2xl">
                <span className="font-bold">Total a pagar:</span>
                <span className="font-bold text-[#2a0606]">
                  ${formatMoney(total)}
                </span>
              </div>
              {tableNumber && (
                <p className="text-sm text-muted-foreground">
                  Mesa seleccionada: <b>#{tableNumber}</b>
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
                (!Number.isFinite(remainingTables as number) &&
                  remainingTables !== 0) ||
                soldOut ||
                !selectedLocation ||
                !customer.gender ||
                !tableNumber
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
              {isProcessing
                ? "Procesando..."
                : soldOut
                  ? "Agotadas"
                  : "Reservar con Mercado Pago"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Serás redirigido a Mercado Pago para completar tu reserva de forma
              segura
            </p>
            {(errors.price || errors.stock || errors.table) && (
              <p className="text-sm text-red-600 text-center">
                {errors.price || errors.stock || errors.table}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* Tailwind util (animación del texto gradiente de los precios)
   Asegurate de tener en globals.css:
   @keyframes gradient-move { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
*/
