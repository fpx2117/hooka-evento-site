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
import { useMemo, useState } from "react";

interface TicketSalesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRICES = {
  hombre: 13000,
  mujer: 11000,
} as const;

type GenderKey = keyof typeof PRICES;

function formatMoney(n: number) {
  return n.toLocaleString("es-AR");
}

function cleanDigits(s: string) {
  return (s || "").replace(/\D+/g, "");
}

export function TicketSalesModal({
  open,
  onOpenChange,
}: TicketSalesModalProps) {
  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    email: "",
    phone: "",
    dni: "",
    gender: "" as "" | GenderKey,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState<{ [k: string]: string }>({});

  const ticketPrice = useMemo(() => {
    return customerInfo.gender ? PRICES[customerInfo.gender] : 0;
  }, [customerInfo.gender]);

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

    if (!ticketPrice) e.price = "Seleccioná una opción para continuar";

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleCheckout = async () => {
    if (isProcessing) return;
    if (!validate()) return;

    setIsProcessing(true);
    try {
      const body = {
        items: [
          {
            title: `Entrada General - ${customerInfo.gender === "hombre" ? "Hombre" : "Mujer"}`,
            description: "Pool Party Tropical - Entrada General",
            quantity: 1,
            unit_price: ticketPrice,
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
            eventDate: "2025-11-02", // <-- si lo necesitás dinámico, pásalo como prop
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
      // Preferimos sandbox en dev; si no viene, fallback a init_point
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

      // Navegación top-level (evitar popup/iframe)
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
          {/* Price Display */}
          <div className="bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 rounded-xl p-6 space-y-3">
            <h3 className="font-display text-xl font-bold text-center">
              Entrada General
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 rounded-lg bg-background/50 border-2 border-primary/30">
                <p className="text-sm text-muted-foreground mb-1">Hombres</p>
                <p className="text-2xl font-bold text-primary">
                  ${formatMoney(PRICES.hombre)}
                </p>
              </div>
              <div className="text-center p-4 rounded-lg bg-background/50 border-2 border-secondary/30">
                <p className="text-sm text-muted-foreground mb-1">Mujeres</p>
                <p className="text-2xl font-bold text-secondary">
                  ${formatMoney(PRICES.mujer)}
                </p>
              </div>
            </div>
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
                      ${formatMoney(PRICES.hombre)}
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
                      ${formatMoney(PRICES.mujer)}
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
              disabled={isProcessing}
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
