// app/admin/validate/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  QrCode,
  CheckCircle,
  XCircle,
  User,
  Award as IdCard,
  Ticket,
  Calendar,
  Hash,
} from "lucide-react";
import { getTicketByCode, validateTicket } from "@/lib/api";

type ApiTicket = {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDni: string;
  ticketType: string;
  paymentStatus: "pending" | "approved" | "rejected";
  validated: boolean;
  validatedAt?: string | null;
  purchaseDate: string;
  eventDate?: string | null;
};

type UiTicket = {
  validationCode?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDni: string;
  type: "ticket";
  ticketType: string;
  paymentStatus: "pending" | "approved" | "rejected";
  validated: boolean;
  validatedAt?: string | null;
  eventDate?: string | null;
};

export default function ValidatePage() {
  const [ticketData, setTicketData] = useState<UiTicket | null>(null);
  const [error, setError] = useState<string>("");
  const [manualCode, setManualCode] = useState("");
  const [processing, setProcessing] = useState(false);

  const urlCode = useMemo(() => {
    if (typeof window === "undefined") return null;
    const code = new URLSearchParams(window.location.search).get("code");
    return code && /^\d{6}$/.test(code.trim()) ? code.trim() : null;
  }, []);

  function toUiTicket(t: ApiTicket, code?: string): UiTicket {
    return {
      validationCode: code,
      customerName: t.customerName,
      customerEmail: t.customerEmail,
      customerPhone: t.customerPhone,
      customerDni: t.customerDni,
      type: "ticket",
      ticketType: t.ticketType,
      paymentStatus: t.paymentStatus,
      validated: t.validated,
      validatedAt: t.validatedAt ?? null,
      eventDate: t.eventDate ?? null,
    };
  }

  async function runValidationFlow(code: string) {
    setError("");
    setTicketData(null);
    setProcessing(true);
    try {
      // Intenta validar (marca validado cuando corresponda)
      let t: ApiTicket | undefined;
      try {
        const res = await validateTicket(code);
        t = res.ticket;
      } catch (e: any) {
        // Si no pudo validar por "already_validated" o "not_approved",
        // o si fue not_found, mostramos el detalle con GET si aplica.
        if (e?.code === "already_validated" || e?.code === "not_approved") {
          try {
            t = await getTicketByCode(code);
          } catch {
            // cae al manejo genérico abajo
          }
        }
        if (!t) {
          setError(e?.details?.error || "Validación fallida");
          return;
        }
      }
      setTicketData(t ? toUiTicket(t, code) : null);
    } finally {
      setProcessing(false);
    }
  }

  async function validateManualCode() {
    if (!manualCode || manualCode.length !== 6) {
      setError("Ingresá un código de 6 dígitos");
      return;
    }
    await runValidationFlow(manualCode);
  }

  function resetValidation() {
    setTicketData(null);
    setError("");
    setManualCode("");
  }

  useEffect(() => {
    if (urlCode) runValidationFlow(urlCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCode]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-primary/5 to-secondary/5 py-12 px-4">
      <div className="container mx-auto max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-primary to-secondary mb-4">
            <QrCode className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-display font-bold mb-2">
            Validación de Entradas
          </h1>
          <p className="text-muted-foreground">
            Si llegaste desde un QR, esta página valida automáticamente con{" "}
            <code>?code=XXXXXX</code>. Si no, ingresá el código manualmente.
          </p>
        </div>

        {!ticketData && !error && (
          <Card className="p-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Código de Validación (6 dígitos)</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="123456"
                  value={manualCode}
                  onChange={(e) =>
                    setManualCode(e.target.value.replace(/\D/g, ""))
                  }
                  className="text-center text-2xl tracking-widest font-mono"
                />
              </div>
              <Button
                size="lg"
                onClick={validateManualCode}
                disabled={processing || manualCode.length !== 6}
                className="w-full text-lg py-6 bg-gradient-to-r from-primary to-secondary"
              >
                {processing ? "Procesando..." : "Validar Código"}
              </Button>
            </div>
          </Card>
        )}

        {error && (
          <Card className="p-8 border-destructive">
            <div className="text-center space-y-4">
              <XCircle className="w-16 h-16 text-destructive mx-auto" />
              <h2 className="text-2xl font-bold text-destructive">Error</h2>
              <p className="text-muted-foreground">{error}</p>
              <Button onClick={resetValidation} variant="outline">
                Intentar de nuevo
              </Button>
            </div>
          </Card>
        )}

        {ticketData && (
          <Card className="p-8 border-primary">
            <div className="space-y-6">
              <div className="text-center">
                {ticketData.validated ? (
                  <>
                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-green-500 mb-2">
                      Entrada Válida
                    </h2>
                    {ticketData.validatedAt && (
                      <p className="text-muted-foreground">
                        Validada el{" "}
                        {new Date(ticketData.validatedAt).toLocaleString(
                          "es-AR"
                        )}
                      </p>
                    )}
                  </>
                ) : ticketData.paymentStatus !== "approved" ? (
                  <>
                    <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-destructive mb-2">
                      Pago no aprobado
                    </h2>
                    <p className="text-muted-foreground">
                      Esta entrada aún no figura como aprobada.
                    </p>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-green-500 mb-2">
                      Entrada Válida
                    </h2>
                    <p className="text-muted-foreground">
                      La entrada está aprobada y fue validada correctamente.
                    </p>
                  </>
                )}
              </div>

              <div className="space-y-4 pt-6 border-t">
                {ticketData.validationCode && (
                  <div className="flex items-start gap-3 bg-muted/50 p-4 rounded-lg">
                    <Hash className="w-5 h-5 text-primary mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">
                        Código de Validación
                      </p>
                      <p className="font-mono font-bold text-2xl tracking-wider">
                        {ticketData.validationCode}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <User className="w-5 h-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Nombre</p>
                    <p className="font-semibold text-lg">
                      {ticketData.customerName}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <IdCard className="w-5 h-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">DNI</p>
                    <p className="font-semibold text-lg">
                      {ticketData.customerDni}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Ticket className="w-5 h-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">
                      Tipo de Entrada
                    </p>
                    <p className="font-semibold text-lg">
                      {`Entrada ${ticketData.ticketType === "general" ? "General" : "VIP"}`}
                    </p>
                  </div>
                </div>
              </div>

              <Button onClick={resetValidation} className="w-full mt-6">
                Validar otra entrada
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
