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
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/* =========================
   Tipos mínimos de la API de config
========================= */
type TableLoc = "piscina" | "dj" | "general";

type TicketsConfig = {
  tickets?: {
    vip?: {
      price?: number; // (fallback global)
      remaining?: number; // (fallback global - personas, no usado si hay vipTables)
      remainingTables?: number; // (fallback global)
      unitSize?: number; // (fallback global: personas/mesa)
    };
  };
  // NUEVO: soporte por ubicación
  vipTables?: Array<{
    location: TableLoc; // "piscina" | "dj" | "general"
    price: number; // precio por mesa en esa ubicación
    limit: number; // MESAS totales
    sold: number; // MESAS vendidas
    remaining: number; // MESAS disponibles
    capacityPerTable: number; // personas por mesa para esa ubicación
  }>;
};

interface VIPTableModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** endpoint opcional para la config (por defecto usa /api/admin/tickets/config con fallback a /api/tickets/config) */
  configEndpoint?: string;
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

/* =========================
   VIPTableModal
========================= */
export function VIPTableModal({
  open,
  onOpenChange,
  configEndpoint = "/api/admin/tickets/config",
}: VIPTableModalProps) {
  // ======= State de config VIP desde BD (fallback global) =======
  const [vipPriceGlobal, setVipPriceGlobal] = useState<number | null>(null);
  const [remainingTablesGlobal, setRemainingTablesGlobal] = useState<
    number | null
  >(null);
  const [unitSizeGlobal, setUnitSizeGlobal] = useState<number | null>(null);

  // ======= NUEVO: config por ubicación =======
  const [vipTablesCfg, setVipTablesCfg] = useState<TicketsConfig["vipTables"]>(
    []
  );
  const [selectedLocation, setSelectedLocation] = useState<TableLoc | null>(
    null
  );

  const [cfgLoading, setCfgLoading] = useState(false);
  const [cfgError, setCfgError] = useState<string | null>(null);

  // ======= Datos del cliente (incluye GÉNERO) =======
  const [customer, setCustomer] = useState({
    name: "",
    dni: "",
    email: "",
    phone: "",
    gender: "" as "" | "hombre" | "mujer",
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ======= Traer precios/stock desde la API =======
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

          // fallback global
          const v = data?.tickets?.vip ?? {};
          setVipPriceGlobal(typeof v.price === "number" ? v.price : null);
          setRemainingTablesGlobal(
            typeof v.remainingTables === "number" ? v.remainingTables : null
          );
          setUnitSizeGlobal(typeof v.unitSize === "number" ? v.unitSize : null);

          // per-location
          const tables = Array.isArray(data?.vipTables) ? data.vipTables : [];
          setVipTablesCfg(tables);

          // elegir ubicación por defecto:
          // 1) dj si existe, 2) piscina si existe, 3) la primera con stock, 4) primera disponible
          let defaultLoc: TableLoc | null = null;
          const hasDJ = tables.find((t) => t.location === "dj");
          const hasPiscina = tables.find((t) => t.location === "piscina");
          const firstWithStock = tables.find((t) => (t?.remaining ?? 0) > 0);
          defaultLoc =
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
      // limpiar formulario al abrir
      setCustomer({ name: "", dni: "", email: "", phone: "", gender: "" });
      setErrors({});
    }
    return () => {
      cancelled = true;
    };
  }, [open, configEndpoint]);

  // ======= Config actual según ubicación seleccionada (si hay vipTables) =======
  const currentLocCfg = useMemo(() => {
    if (!selectedLocation) return null;
    return vipTablesCfg?.find((t) => t.location === selectedLocation) || null;
  }, [vipTablesCfg, selectedLocation]);

  // ======= Derivados mostrados =======
  const vipPrice = useMemo(() => {
    return currentLocCfg?.price ?? vipPriceGlobal ?? 0;
  }, [currentLocCfg, vipPriceGlobal]);

  const remainingTables = useMemo(() => {
    return currentLocCfg?.remaining ?? remainingTablesGlobal ?? 0;
  }, [currentLocCfg, remainingTablesGlobal]);

  // Para la equivalencia, si hay por ubicación, usamos esa
  const unitSize = useMemo(() => {
    return currentLocCfg?.capacityPerTable ?? unitSizeGlobal ?? null;
  }, [currentLocCfg, unitSizeGlobal]);

  // ======= Total (siempre 1 mesa) =======
  const total = useMemo(() => Math.max(0, vipPrice || 0), [vipPrice]);

  // ======= SOLD OUT flag =======
  const soldOut =
    typeof remainingTables === "number" && Number.isFinite(remainingTables)
      ? remainingTables <= 0
      : false;

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

    // ✅ Género requerido (idéntico criterio al de TicketSalesModal)
    if (!customer.gender) e.gender = "Elegí tu género";

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
            title: `Mesa VIP (${locLabel})`,
            description: capacity
              ? `1 mesa = ${capacity} personas`
              : "Reserva de Mesa VIP",
            quantity: 1,
            unit_price: vipPrice, // ✅ precio de la ubicación o fallback
          },
        ],
        payer: {
          name: customer.name.trim(),
          email: customer.email.trim(),
          phone: cleanDigits(customer.phone),
          dni: cleanDigits(customer.dni),
          additionalInfo: {
            type: "vip-table",
            tables: 1, // siempre 1 mesa por compra
            unitSize: capacity,
            location: selectedLocation ?? undefined, // ✅ enviar ubicación
            gender: customer.gender || undefined, // ✅ enviamos género
          },
        },
        type: "vip-table" as const,
        // opcional: podés enviar un campo `meta` si tu backend lo soporta
        meta: {
          location: selectedLocation ?? undefined,
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
          {/* Price/Stock Display — MISMOS COLORES QUE tickets */}
          <div className="relative bg-gradient-to-r from-[#4a0a0a]/100 via-[#5b0d0d]/100 to-[#7a0a0a]/100 rounded-xl p-4 sm:p-6 space-y-3 text-white">
            <h3 className="font-display text-lg sm:text-xl font-bold text-center">
              Mesa VIP
              {selectedLocation
                ? ` — ${selectedLocation === "dj" ? "Cerca del DJ" : "Cerca de la PISCINA"}`
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

            {/* Aviso bajo el grid */}
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

            {/* GÉNERO - EXACTAMENTE como en TicketSalesModal */}
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
                {/* Hombre */}
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

                {/* Mujer */}
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

          {/* NUEVO: Selector de ubicación */}
          <div className="rounded-xl border p-3 sm:p-4 bg-white/60">
            <p className="text-sm font-semibold mb-3">Elegí la ubicación</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Botón DJ (si existe config) */}
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

              {/* Botón Piscina (si existe config) */}
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
          </div>

          {/* Summary + Pay — mismos colores que tickets */}
          <div className="rounded-xl p-4 sm:p-6 space-y-4 border-2 bg-gradient-to-r from-[#4a0a0a]/10 to-[#7a0a0a]/10 border-[#5b0d0d]/20">
            <div className="flex justify-between items-center text-xl sm:text-2xl">
              <span className="font-bold">Total a pagar:</span>
              <span className="font-bold text-[#2a0606]">
                ${formatMoney(total)}
              </span>
            </div>
            <Button
              size="lg"
              onClick={handleCheckout}
              disabled={
                isProcessing ||
                cfgLoading ||
                !!cfgError ||
                !vipPrice ||
                (!remainingTables && remainingTables !== 0) || // null/undefined
                soldOut ||
                !selectedLocation ||
                !customer.gender // ✅ requerimos género
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
            {(errors.price || errors.stock) && (
              <p className="text-sm text-red-600 text-center">
                {errors.price || errors.stock}
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
