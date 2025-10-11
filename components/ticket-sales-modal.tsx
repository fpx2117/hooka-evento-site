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
  Percent,
  Minus,
  Plus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/* =========================
   Tipos mínimos de la API
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
    remainingPersons?: number;
  };
};

type DiscountRule = {
  id?: string;
  ticketType: "general" | "vip";
  minQty: number;
  type: "percent" | "amount"; // descuento SOBRE EL TOTAL
  value: number; // % o $ (según type)
  priority?: number;
  isActive: boolean;
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

  // ======= Reglas de descuento (general) =======
  const [rules, setRules] = useState<DiscountRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);

  // ======= Datos del cliente =======
  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    email: "",
    phone: "",
    dni: "",
    gender: "" as "" | GenderKey,
  });
  const [quantity, setQuantity] = useState<number>(1);

  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState<{ [k: string]: string }>({});

  // ======= Traer precios desde la API =======
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

          setPriceH(data?.tickets?.general?.hombre?.price ?? 0);
          setPriceM(data?.tickets?.general?.mujer?.price ?? 0);

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

    async function loadDiscounts() {
      setRulesLoading(true);
      try {
        const r = await fetch(
          "/api/admin/tickets/discounts?ticketType=general&isActive=true",
          { cache: "no-store" }
        );
        if (!r.ok) {
          setRules([]);
          return;
        }
        const data = await r.json();
        const list: DiscountRule[] = Array.isArray(data?.rules)
          ? data.rules
          : [];
        // nos quedamos solo con general activas por si la API devolviera más
        setRules(
          list
            .filter((d) => d.ticketType === "general" && d.isActive)
            .map((d) => ({
              ...d,
              value: Number(d.value) || 0,
            }))
        );
      } catch {
        setRules([]);
      } finally {
        setRulesLoading(false);
      }
    }

    if (open) {
      loadConfig();
      loadDiscounts();
    }
    return () => {
      cancelled = true;
    };
  }, [open, configEndpoint]);

  // ======= Precio unitario según género elegido =======
  const unitPrice = useMemo(() => {
    if (!customerInfo.gender) return 0;
    return customerInfo.gender === "hombre" ? priceH || 0 : priceM || 0;
  }, [customerInfo.gender, priceH, priceM]);

  // ======= Descuento sobre TOTAL: elegimos la mejor regla =======
  const { subtotal, bestRule, discountAmount, totalToPay } = useMemo(() => {
    const q = Math.max(1, quantity || 1);
    const sub = Math.max(0, (unitPrice || 0) * q);

    // elegimos la mejor regla que cumpla minQty <= q
    const candidates = rules.filter((r) => r.minQty <= q);

    // función para calcular cuánto descuenta una regla sobre el total
    const computeDiscount = (r: DiscountRule) => {
      const val = Number(r.value) || 0;
      if (val <= 0) return 0;
      if (r.type === "percent") {
        return Math.floor((sub * val) / 100);
      }
      // amount => monto fijo sobre el total (capado a subtotal)
      return Math.min(val, sub);
    };

    let chosen: DiscountRule | null = null;
    let bestDisc = 0;

    for (const r of candidates) {
      const disc = computeDiscount(r);
      if (disc > bestDisc) {
        bestDisc = disc;
        chosen = r;
      } else if (disc === bestDisc && disc > 0) {
        // desempate por mayor priority
        const pa = (chosen?.priority ?? 0) as number;
        const pb = (r.priority ?? 0) as number;
        if (pb > pa) {
          chosen = r;
          bestDisc = disc;
        }
      }
    }

    const total = Math.max(0, sub - bestDisc);

    return {
      subtotal: sub,
      bestRule: chosen,
      discountAmount: bestDisc,
      totalToPay: total,
    };
  }, [rules, quantity, unitPrice]);

  // ======= Validaciones =======
  const validate = () => {
    const e: { [k: string]: string } = {};

    if (!customerInfo.name.trim()) e.name = "Ingresá tu nombre completo";
    if (!customerInfo.gender) e.gender = "Seleccioná tu género";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerInfo.email))
      e.email = "Ingresá un email válido";

    const dniDigits = cleanDigits(customerInfo.dni);
    if (!dniDigits) e.dni = "Ingresá tu DNI";
    else if (dniDigits.length < 7 || dniDigits.length > 9)
      e.dni = "DNI inválido";

    const phoneDigits = cleanDigits(customerInfo.phone);
    if (!phoneDigits) e.phone = "Ingresá tu celular";
    else if (phoneDigits.length < 8) e.phone = "Celular inválido";

    if (!unitPrice) e.price = "Precio no disponible, intentá nuevamente.";
    if (quantity < 1) e.quantity = "La cantidad debe ser al menos 1";
    if (typeof remaining === "number" && quantity > remaining) {
      e.quantity = `Solo hay ${remaining} disponibles`;
    }

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
            quantity, // ✅ cantidad seleccionada
            unit_price: unitPrice, // display: el servidor calcula el real
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
            quantity, // ✅ lo ve también el backend
          },
        },
        type: "ticket" as const,
        // opcional: podrías enviar un preview de descuento para auditoría UI
        // discount_preview: { ruleId: bestRule?.id, discountAmount },
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

  // helpers cantidad
  const decQty = () => setQuantity((q) => Math.max(1, q - 1));
  const incQty = () =>
    setQuantity((q) =>
      typeof remaining === "number" ? Math.min(remaining, q + 1) : q + 1
    );

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
                  <p className="text-2xl font-bold text-primary">
                    ${formatMoney(priceH ?? 0)}
                  </p>
                </div>
                <div className="text-center p-4 rounded-lg bg-background/50 border-2 border-secondary/30">
                  <p className="text-sm text-muted-foreground mb-1">Mujeres</p>
                  <p className="text-2xl font-bold text-secondary">
                    ${formatMoney(priceM ?? 0)}
                  </p>
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

          {/* Cantidad */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Ticket className="w-4 h-4" />
              Cantidad de entradas
            </Label>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-10 w-10 p-0"
                onClick={decQty}
                disabled={quantity <= 1}
                aria-label="Restar"
                title="Restar"
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Input
                value={quantity}
                onChange={(e) => {
                  const v = Math.max(1, Number(e.target.value) || 1);
                  if (typeof remaining === "number") {
                    setQuantity(Math.min(remaining, v));
                  } else {
                    setQuantity(v);
                  }
                }}
                type="number"
                min={1}
                className="h-12 text-center font-semibold"
              />
              <Button
                type="button"
                variant="outline"
                className="h-10 w-10 p-0"
                onClick={incQty}
                disabled={
                  typeof remaining === "number" && quantity >= remaining
                }
                aria-label="Sumar"
                title="Sumar"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {errors.quantity && (
              <p className="text-sm text-red-600">{errors.quantity}</p>
            )}
          </div>

          {/* Summary + Pay */}
          <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-xl p-6 space-y-4 border-2 border-primary/20">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="font-bold">Precio unitario</span>
                <span>${formatMoney(unitPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold">Cantidad</span>
                <span>{quantity}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold">Subtotal</span>
                <span>${formatMoney(subtotal)}</span>
              </div>

              {bestRule && discountAmount > 0 && (
                <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-300">
                  <span className="inline-flex items-center gap-2">
                    <Percent className="w-4 h-4" />
                    Descuento{" "}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                      {bestRule.type === "percent"
                        ? `${bestRule.value}%`
                        : `$${formatMoney(bestRule.value)}`}
                    </span>
                    {bestRule.minQty > 1 && (
                      <span className="text-xs text-muted-foreground">
                        (desde {bestRule.minQty})
                      </span>
                    )}
                  </span>
                  <span>- ${formatMoney(discountAmount)}</span>
                </div>
              )}

              <div className="flex justify-between text-2xl pt-2 border-t">
                <span className="font-bold">Total a pagar</span>
                <span className="font-bold text-primary">
                  ${formatMoney(totalToPay)}
                </span>
              </div>
            </div>

            <Button
              size="lg"
              onClick={handleCheckout}
              disabled={
                isProcessing ||
                cfgLoading ||
                rulesLoading ||
                !!cfgError ||
                !customerInfo.gender ||
                !unitPrice ||
                quantity < 1 ||
                (typeof remaining === "number" && quantity > remaining)
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
