"use client";

import { Button } from "@/components/ui/button";
import { CheckCircle, Home, Download } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();

  const [qrCodeImg, setQrCodeImg] = useState<string>("");
  const [validationCode, setValidationCode] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Estado de confirmación del pago (solo para UI)
  const [approved, setApproved] = useState<boolean | null>(null);
  const [confirmed, setConfirmed] = useState<boolean | null>(null);

  const [type, setType] = useState<"ticket" | "vip-table" | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);

  const emailSentRef = useRef(false);

  // Genera imagen de QR desde un texto
  const renderQr = async (text: string) => {
    const img = await QRCode.toDataURL(text, { width: 300, margin: 2 });
    setQrCodeImg(img);
  };

  const sendEmailOnce = async (t: "ticket" | "vip-table", id: string) => {
    if (emailSentRef.current) return; // evita duplicados
    try {
      const r = await fetch("/api/send-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ type: t, recordId: id }),
      });
      if (r.ok) {
        emailSentRef.current = true;
      } else {
        // opcional: log de error para depurar
        const err = await r.json().catch(() => ({}));
        console.warn("[success] send-confirmation no OK:", err);
      }
    } catch (e) {
      // no bloquea UX
      console.warn("[success] send-confirmation error:", e);
    }
  };

  useEffect(() => {
    const run = async () => {
      try {
        // 1) IDs devueltos por Mercado Pago
        const paymentId =
          searchParams.get("payment_id") ||
          searchParams.get("collection_id") ||
          "";
        const merchantOrderId = searchParams.get("merchant_order_id") || "";
        const externalRef = searchParams.get("external_reference");

        // Variables locales (evitan carreras con setState)
        let localType: "ticket" | "vip-table" | null = null;
        let localRecordId: string | null = null;
        let localApproved: boolean | null = null;

        if (externalRef?.includes(":")) {
          const [t, id] = externalRef.split(":");
          if ((t === "ticket" || t === "vip-table") && id) {
            localType = t;
            localRecordId = id;
          }
        }

        // 2) Confirmación fuerte con backend (si hay paymentId/merchantOrderId)
        const buildConfirmUrl = (): string | "" => {
          if (paymentId) {
            return `/api/payments/confirm?payment_id=${encodeURIComponent(
              paymentId
            )}`;
          }
          if (merchantOrderId) {
            return `/api/payments/confirm?merchant_order_id=${encodeURIComponent(
              merchantOrderId
            )}`;
          }
          return "";
        };

        const confirmUrl = buildConfirmUrl();
        if (confirmUrl) {
          try {
            const r = await fetch(confirmUrl, { cache: "no-store" });
            const data: ConfirmResp = await r.json();

            if (isConfirmOk(data)) {
              setConfirmed(true);

              if (data.type) localType = data.type;
              if (data.recordId) localRecordId = data.recordId;

              // derive aprobado local
              localApproved =
                typeof data.approvedStrong === "boolean"
                  ? data.approvedStrong
                  : data.status === "approved";

              // reflejar en UI
              setApproved(localApproved);
              if (localType) setType(localType);
              if (localRecordId) setRecordId(localRecordId);
            } else {
              setConfirmed(false);
              setApproved(null);
            }
          } catch {
            // si falla confirmación, seguimos con external_reference si lo tenemos
            setConfirmed(false);
            setApproved(null);
          }
        } else {
          setConfirmed(false);
          setApproved(null);
        }

        // 3) Cargar códigos públicos si tenemos identificadores
        if (localType && localRecordId) {
          const requireApproved =
            localApproved === true ? "&requireApproved=1" : "";
          const r = await fetch(
            `/api/tickets/public?type=${encodeURIComponent(
              localType
            )}&id=${encodeURIComponent(localRecordId)}${requireApproved}`,
            { cache: "no-store" }
          );
          const info: PublicTicketResp = await r.json();

          if (info.ok) {
            if (info.validationCode) setValidationCode(info.validationCode);

            // Si el endpoint ya trae un string para QR lo usamos;
            // si no, generamos QR desde el validationCode como fallback.
            if (info.qrCode) {
              await renderQr(info.qrCode);
            } else if (info.validationCode) {
              await renderQr(info.validationCode);
            }

            const approvedNow =
              localApproved === true || info.paymentStatus === "approved";
            if (approvedNow && info.recordId && info.type) {
              await sendEmailOnce(info.type, info.recordId);
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
            ¡Nos vemos en la fiesta! 🫦💣
          </p>
        </div>
      </div>
    </div>
  );
}
