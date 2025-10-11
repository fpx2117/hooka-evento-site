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
  Ticket,
  CreditCard,
  User,
  Mail,
  Phone,
  Award as IdCard,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/* =========================
   Tipos mínimos de la API de config
========================= */
type TicketsConfig = {
  tickets: {
    general: {
      hombre?: {
        price: number;
        remaining: number;
        limit: number;
        sold: number;
      };
      mujer?: { price: number; remaining: number; limit: number; sold: number };
    };
  };
  totals?: {
    remainingPersons?: number; // opcional, si tu API lo expone
  };
};

interface TicketSalesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  configEndpoint?: string;
}

type GenderKey = "hombre" | "mujer";

/* =========================
   Utils
========================= */
function formatMoney(n: number) {
  return n.toLocaleString("es-AR");
}
function cleanDigits(s: string) {
  return (s || "").replace(/\D+/g, "");
}

export function TicketSalesModal({
  open,
  onOpenChange,
  configEndpoint = "/api/admin/tickets/config",
}: TicketSalesModalProps) {
  // ======= State de precios desde BD =======
  const [priceH, setPriceH] = useState<number | null>(null);
  const [priceM, setPriceM] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [cfgLoading, setCfgLoading] = useState(false);
  const [cfgError, setCfgError] = useState<string | null>(null);

  // ======= Datos del cliente =======
  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    email: "",
    phone: "",
    dni: "",
    gender: "" as "" | GenderKey,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState<{ [k: string]: string }>({});

  // ======= Traer precios desde la API =======
  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      setCfgLoading(true);
      setCfgError(null);

      // Intento #2 (fallback silencioso): /api/admin/tickets/config por si sólo existe ese
      const tryEndpoints = [configEndpoint, "/api/admin/tickets/config"];

      for (const ep of tryEndpoints) {
        try {
          const r = await fetch(ep, { cache: "no-store" });
          if (!r.ok) continue;
          const data: TicketsConfig = await r.json();

          if (cancelled) return;

          setPriceH(data?.tickets?.general?.hombre?.price ?? 0);
          setPriceM(data?.tickets?.general?.mujer?.price ?? 0);

          // Si tu API expone un total de restantes, lo mostramos (no bloquea pago)
          const rem =
            data?.totals?.remainingPersons ??
            data?.tickets?.general?.hombre?.remaining ??
            data?.tickets?.general?.mujer?.remaining ??
            null;
          setRemaining(
            typeof rem === "number" && Number.isFinite(rem) ? rem : null
          );

          setCfgLoading(false);
          return;
        } catch {
          /* sigue al siguiente endpoint */
        }
      }

      if (!cancelled) {
        setCfgError("No se pudo cargar la configuración de precios.");
        setCfgLoading(false);
      }
    }

    if (open) loadConfig();
    return () => {
      cancelled = true;
    };
  }, [open, configEndpoint]);

  // ======= Precio actual según género elegido =======
  const ticketPrice = useMemo(() => {
    if (!customerInfo.gender) return 0;
    return customerInfo.gender === "hombre" ? priceH || 0 : priceM || 0;
  }, [customerInfo.gender, priceH, priceM]);

  // ======= Validaciones =======
  const validate = () => {
    const e: { [k: string]: string } = {};

    if (!customerInfo.name.trim()) e.name = "Ingresá tu nombre completo";
    if (!customerInfo.gender) e.gender = "Seleccioná tu género";

    // email simple
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerInfo.email))
      e.email = "Ingresá un email válido";

    // DNI: solo dígitos, 7-9 aprox (flexible)
    const dniDigits = cleanDigits(customerInfo.dni);
    if (!dniDigits) e.dni = "Ingresá tu DNI";
    else if (dniDigits.length < 7 || dniDigits.length > 9)
      e.dni = "DNI inválido";

    // Phone: solo dígitos, longitud mínima flexible
    const phoneDigits = cleanDigits(customerInfo.phone);
    if (!phoneDigits) e.phone = "Ingresá tu celular";
    else if (phoneDigits.length < 8) e.phone = "Celular inválido";

    if (!ticketPrice) e.price = "Precio no disponible, intentá nuevamente.";

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ======= Ir a checkout =======
  const handleCheckout = async () => {
    if (isProcessing) return;
    if (!validate()) return;

    setIsProcessing(true);
    try {
      const body = {
        items: [
          {
            title: `Entrada General - ${customerInfo.gender === "hombre" ? "Hombre" : "Mujer"}`,
            description: "Entrada General",
            quantity: 1,
            unit_price: ticketPrice, // ✅ precio desde BD
          },
        ],
        payer: {
          name: customerInfo.name.trim(),
          email: customerInfo.email.trim(),
          phone: cleanDigits(customerInfo.phone),
          dni: cleanDigits(customerInfo.dni),
          additionalInfo: {
            ticketType: "general",
            gender: customerInfo.gender,
            quantity: 1,
          },
        },
        type: "ticket" as const,
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
      console.error("Error al procesar el pago:", error);
      alert("Hubo un error al procesar tu compra. Intentá nuevamente.");
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-3xl font-display flex items-center gap-3">
            <Ticket className="w-8 h-8 text-primary" />
            Comprar Entrada
          </DialogTitle>
          <DialogDescription>
            Completá tus datos para comprar tu entrada
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Price Display (desde BD) */}
          <div className="bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 rounded-xl p-6 space-y-3">
            <h3 className="font-display text-xl font-bold text-center">
              Entrada General
            </h3>

            {cfgLoading ? (
              <p className="text-center text-sm text-muted-foreground">
                Cargando precios…
              </p>
            ) : cfgError ? (
              <p className="text-center text-sm text-red-600">{cfgError}</p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 rounded-lg bg-background/50 border-2 border-primary/30">
                  <p className="text-sm text-muted-foreground mb-1">Hombres</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-background/50 border-2 border-secondary/30">
                  <p className="text-sm text-muted-foreground mb-1">Mujeres</p>
                </div>
              </div>
            )}

            {typeof remaining === "number" && (
              <p className="text-center text-xs text-muted-foreground">
                Disponibles: <b>{remaining}</b>
              </p>
            )}
          </div>

          {/* Customer Information Form */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Tus datos</h3>

            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Nombre completo
              </Label>
              <Input
                id="name"
                placeholder="Juan Pérez"
                value={customerInfo.name}
                onChange={(e) =>
                  setCustomerInfo({ ...customerInfo, name: e.target.value })
                }
                className="h-12"
              />
              {errors.name && (
                <p className="text-sm text-red-600">{errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="dni" className="flex items-center gap-2">
                <IdCard className="w-4 h-4" />
                DNI
              </Label>
              <Input
                id="dni"
                placeholder="12345678"
                value={customerInfo.dni}
                onChange={(e) =>
                  setCustomerInfo({ ...customerInfo, dni: e.target.value })
                }
                className="h-12"
                inputMode="numeric"
              />
              {errors.dni && (
                <p className="text-sm text-red-600">{errors.dni}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Correo electrónico
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="juan@ejemplo.com"
                value={customerInfo.email}
                onChange={(e) =>
                  setCustomerInfo({ ...customerInfo, email: e.target.value })
                }
                className="h-12"
              />
              {errors.email && (
                <p className="text-sm text-red-600">{errors.email}</p>
              )}
            </div>

            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Género
              </Label>
              <RadioGroup
                value={customerInfo.gender}
                onValueChange={(value) =>
                  setCustomerInfo({
                    ...customerInfo,
                    gender: value as GenderKey,
                  })
                }
                className="grid grid-cols-2 gap-4"
              >
                <div>
                  <RadioGroupItem
                    value="hombre"
                    id="hombre"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="hombre"
                    className="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-background p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10 cursor-pointer transition-all"
                  >
                    <span className="text-2xl mb-2">👨</span>
                    <span className="font-semibold">Hombre</span>
                    <span className="text-sm text-muted-foreground">
                      ${formatMoney(priceH ?? 0)}
                    </span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem
                    value="mujer"
                    id="mujer"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="mujer"
                    className="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-background p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-secondary peer-data-[state=checked]:bg-secondary/10 cursor-pointer transition-all"
                  >
                    <span className="text-2xl mb-2">👩</span>
                    <span className="font-semibold">Mujer</span>
                    <span className="text-sm text-muted-foreground">
                      ${formatMoney(priceM ?? 0)}
                    </span>
                  </Label>
                </div>
              </RadioGroup>
              {errors.gender && (
                <p className="text-sm text-red-600">{errors.gender}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Número de celular
              </Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+54 11 1234-5678"
                value={customerInfo.phone}
                onChange={(e) =>
                  setCustomerInfo({ ...customerInfo, phone: e.target.value })
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
          <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-xl p-6 space-y-4 border-2 border-primary/20">
            <div className="flex justify-between items-center text-2xl">
              <span className="font-bold">Total a pagar:</span>
              <span className="font-bold text-primary">
                ${formatMoney(ticketPrice)}
              </span>
            </div>
            <Button
              size="lg"
              onClick={handleCheckout}
              disabled={
                isProcessing ||
                cfgLoading ||
                !!cfgError ||
                !customerInfo.gender ||
                (customerInfo.gender === "hombre" && !priceH) ||
                (customerInfo.gender === "mujer" && !priceM)
              }
              className="w-full text-lg py-6 rounded-full bg-gradient-to-r from-primary via-secondary to-accent hover:scale-105 transition-transform disabled:opacity-60"
            >
              <CreditCard className="w-5 h-5 mr-2" />
              {isProcessing ? "Procesando..." : "Pagar con Mercado Pago"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Serás redirigido a Mercado Pago para completar tu compra de forma
              segura
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
