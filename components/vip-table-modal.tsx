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
import {
  Sparkles,
  CreditCard,
  Award as IdCard,
  Mail,
  Phone,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/* =========================
   Tipos mínimos de la API de config
========================= */
type TicketsConfig = {
  tickets?: {
    vip?: {
      price?: number;
      remaining?: number;
      remainingTables?: number;
      unitSize?: number;
    };
  };
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
  // ======= State de config VIP desde BD =======
  const [vipPrice, setVipPrice] = useState<number | null>(null);
  const [remainingTables, setRemainingTables] = useState<number | null>(null);
  const [unitSize, setUnitSize] = useState<number | null>(null);
  const [cfgLoading, setCfgLoading] = useState(false);
  const [cfgError, setCfgError] = useState<string | null>(null);

  // ======= Datos del cliente =======
  const [customer, setCustomer] = useState({
    name: "",
    dni: "",
    email: "",
    phone: "",
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ======= Traer precios/stock desde la API =======
  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      setCfgLoading(true);
      setCfgError(null);

      const tryEndpoints = [configEndpoint, "/api/admin/tickets/config"];
      for (const ep of tryEndpoints) {
        try {
          const r = await fetch(ep, { cache: "no-store" });
          if (!r.ok) continue;
          const data: TicketsConfig = await r.json();
          if (cancelled) return;

          const v = data?.tickets?.vip ?? {};
          setVipPrice(typeof v.price === "number" ? v.price : null);
          setRemainingTables(
            typeof v.remainingTables === "number" ? v.remainingTables : null
          );
          setUnitSize(typeof v.unitSize === "number" ? v.unitSize : null);
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
      setCustomer({ name: "", dni: "", email: "", phone: "" });
      setErrors({});
    }
    return () => {
      cancelled = true;
    };
  }, [open, configEndpoint]);

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

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ======= Ir a checkout (1 mesa) =======
  const handleCheckout = async () => {
    if (isProcessing) return;
    if (!validate()) return;

    setIsProcessing(true);
    try {
      const body = {
        items: [
          {
            title: "Mesa VIP",
            description:
              unitSize && Number.isFinite(unitSize)
                ? `1 mesa = ${unitSize} personas`
                : "Reserva de Mesa VIP",
            quantity: 1,
            unit_price: vipPrice, // ✅ precio desde BD
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
            unitSize: unitSize ?? undefined,
          },
        },
        type: "vip-table" as const,
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
                !remainingTables || // cubre 0
                soldOut // explícito
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
