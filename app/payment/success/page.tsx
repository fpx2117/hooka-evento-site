"use client";

import { Button } from "@/components/ui/button";
import { CheckCircle, Home, Download } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

/* =========================
   Tipos de las APIs usadas
========================= */
type PublicTicketOk = {
  ok: true;
  type: "ticket" | "vip-table";
  recordId: string;
  paymentStatus: "approved" | "pending" | "rejected" | string;
  customerName: string;
  qrCode: string | null;
  validationCode: string | null;
  totalPrice: number;
};
type PublicTicketErr = { ok: false; error: string };
type PublicTicketResp = PublicTicketOk | PublicTicketErr;

type ConfirmOk = {
  ok: true;
  approvedStrong: boolean;
  status?: "approved" | "rejected" | "pending" | string;
  status_detail?: string;
  id?: string;
  type?: "ticket" | "vip-table";
  recordId?: string;
};
type ConfirmErr = { ok: false; error: string };
type ConfirmResp = ConfirmOk | ConfirmErr;

const isConfirmOk = (x: ConfirmResp): x is ConfirmOk => x.ok === true;

/* =========================
   Página de éxito
========================= */
export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();

  const [qrCodeImg, setQrCodeImg] = useState<string>("");
  const [validationCode, setValidationCode] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Estado de confirmación del pago
  const [approved, setApproved] = useState<boolean | null>(null);
  const [confirmed, setConfirmed] = useState<boolean | null>(null);

  // Para fallback si no vino por confirm
  const [type, setType] = useState<"ticket" | "vip-table" | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        // 1) Extraemos identificadores devueltos por Mercado Pago
        const paymentId =
          searchParams.get("payment_id") ||
          searchParams.get("collection_id") ||
          ""; // MP puede usar ambos
        const merchantOrderId = searchParams.get("merchant_order_id") || "";
        const externalRef = searchParams.get("external_reference"); // ej: "ticket:cmgk..."

        // Si vino external_reference, lo usamos de pista
        if (externalRef?.includes(":")) {
          const [t, id] = externalRef.split(":");
          if ((t === "ticket" || t === "vip-table") && id) {
            setType(t);
            setRecordId(id);
          }
        }

        // 2) Confirmamos con backend (reconciliación fuerte)
        // Intentamos primero por payment_id; si no hay, intentamos por merchant_order_id
        const confirmOnce = async (): Promise<ConfirmResp> => {
          const url = paymentId
            ? `/api/payments/confirm?payment_id=${encodeURIComponent(paymentId)}`
            : merchantOrderId
              ? `/api/payments/confirm?merchant_order_id=${encodeURIComponent(
                  merchantOrderId
                )}`
              : "";

          if (!url) {
            setConfirmed(false);
            setApproved(null);
            return { ok: false, error: "Sin identificadores para confirmar" };
          }

          const r = await fetch(url, { cache: "no-store" });
          const data: ConfirmResp = await r.json();

          if (isConfirmOk(data)) {
            setConfirmed(true);
            if (data.type) setType(data.type);
            if (data.recordId) setRecordId(data.recordId);

            // Prioridad a approvedStrong; si no viene, usamos status
            if (typeof data.approvedStrong === "boolean") {
              setApproved(data.approvedStrong);
            } else {
              setApproved(data.status === "approved");
            }
          } else {
            setConfirmed(false);
            setApproved(null);
          }

          return data;
        };

        await confirmOnce();

        // 3) Con type + recordId obtenemos QR y validationCode para renderizar
        if (type && recordId) {
          const r = await fetch(
            `/api/tickets/public?type=${encodeURIComponent(
              type
            )}&id=${encodeURIComponent(recordId)}`,
            { cache: "no-store" }
          );
          const info: PublicTicketResp = await r.json();

          if (info.ok) {
            if (info.validationCode) setValidationCode(info.validationCode);

            if (info.qrCode) {
              // Generamos PNG del QR
              const img = await QRCode.toDataURL(info.qrCode, {
                width: 300,
                margin: 2,
              });
              setQrCodeImg(img);
            }
          }
        }
      } catch (e) {
        console.error("[payment/success] error:", e);
      } finally {
        setLoading(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadQR = () => {
    if (!qrCodeImg) return;
    const link = document.createElement("a");
    link.href = qrCodeImg;
    link.download = `tropical-pool-party-qr-${validationCode || "codigo"}.png`;
    link.click();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/20 via-secondary/20 to-accent/20">
      <div className="max-w-md w-full bg-background rounded-2xl shadow-2xl p-8 text-center space-y-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/20 animate-pulse-glow">
          <CheckCircle className="w-12 h-12 text-green-500" />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-display text-balance">¡Pago Exitoso!</h1>
          <p className="text-muted-foreground leading-relaxed">
            Tu compra ha sido procesada correctamente. Recibirás un email de
            confirmación con todos los detalles.
          </p>
        </div>

        {/* Bloque QR + Código */}
        {!loading && (validationCode || qrCodeImg) && (
          <>
            {validationCode && (
              <div className="bg-primary text-primary-foreground rounded-xl p-6 space-y-2">
                <p className="text-sm font-medium">CÓDIGO DE VALIDACIÓN</p>
                <p className="text-4xl font-bold tracking-wider">
                  {validationCode}
                </p>
                <p className="text-xs opacity-90">
                  Mostrá este código al personal de seguridad
                </p>
              </div>
            )}

            {qrCodeImg && (
              <div className="bg-white rounded-xl p-6 space-y-3">
                <p className="text-sm font-medium text-foreground">
                  Tu Código QR
                </p>
                <img
                  src={qrCodeImg}
                  alt="QR Code"
                  className="mx-auto w-64 h-64"
                />
                <Button
                  onClick={downloadQR}
                  variant="outline"
                  size="sm"
                  className="w-full bg-transparent"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar QR
                </Button>
              </div>
            )}
          </>
        )}

        {/* Mensaje de espera si todavía no tenemos códigos */}
        {!loading && !validationCode && !qrCodeImg && (
          <div className="rounded-xl p-4 bg-yellow-50 text-yellow-700 text-sm">
            Estamos validando los datos de tu compra. Si no ves tu QR en unos
            segundos, revisá tu email.
          </div>
        )}

        {/* Info adicional y advertencia si no quedó aprobado */}
        <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
          <p className="text-xs text-muted-foreground">
            Te enviamos toda la información necesaria para disfrutar de tu
            experiencia en Tropical Pool Party
          </p>
          {confirmed === true && approved === false && (
            <p className="text-xs text-red-600">
              Atención: el pago aún no figura como acreditado en Mercado Pago.
              Si ya pagaste, se actualizará en breve.
            </p>
          )}
        </div>

        <div className="space-y-3 pt-4">
          <Button asChild size="lg" className="w-full rounded-full">
            <Link href="/">
              <Home className="w-4 h-4 mr-2" />
              Volver al inicio
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            ¡Nos vemos en la fiesta! 🌴🎉
          </p>
        </div>
      </div>
    </div>
  );
}
