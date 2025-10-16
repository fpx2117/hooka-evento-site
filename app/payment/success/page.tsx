"use client";

import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Home,
  Download,
  Copy,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import HeroBackgroundEasy from "@/components/HeroBackgroundEasy";

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
  const [copied, setCopied] = useState(false);

  const LS_EMAIL_SENT_PREFIX = "emailSent:";

  // Genera imagen de QR desde un texto
  const renderQr = async (text: string) => {
    const img = await QRCode.toDataURL(text, { width: 360, margin: 2 });
    setQrCodeImg(img);
  };

  const markEmailSentIfNot = (t: "ticket" | "vip-table", id: string) => {
    try {
      const key = `${LS_EMAIL_SENT_PREFIX}${t}:${id}`;
      if (localStorage.getItem(key) === "1") return true;
      localStorage.setItem(key, "1");
      return false;
    } catch {
      return false;
    }
  };

  const sendEmailOnce = async (t: "ticket" | "vip-table", id: string) => {
    // guard localStorage + ref para cubrir SSR Strict/re-renders
    if (emailSentRef.current) return;
    const already = markEmailSentIfNot(t, id);
    if (already) {
      emailSentRef.current = true;
      return;
    }
    try {
      const r = await fetch("/api/send-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ type: t, recordId: id }),
      });
      if (r.ok) emailSentRef.current = true;
    } catch {
      /* no bloquea UX */
    }
  };

  useEffect(() => {
    const run = async () => {
      try {
        // === 1) Extraer TODOS los posibles params de MP ===
        const paymentId =
          searchParams.get("payment_id") ||
          searchParams.get("collection_id") ||
          "";
        const merchantOrderId = searchParams.get("merchant_order_id") || "";
        const preferenceId = searchParams.get("preference_id") || "";
        const statusParam =
          searchParams.get("status") ||
          searchParams.get("collection_status") ||
          "";

        const externalRef = searchParams.get("external_reference") || "";

        let localType: "ticket" | "vip-table" | null = null;
        let localRecordId: string | null = null;

        if (externalRef.includes(":")) {
          const [t, id] = externalRef.split(":");
          if ((t === "ticket" || t === "vip-table") && id) {
            localType = t;
            localRecordId = id;
          }
        }

        // Pre-señal por querystring directo (approved en URL)
        let approvedFromParams =
          (statusParam || "").toLowerCase() === "approved";

        // === 2) Confirmación con backend (robusto) ===
        // intentamos por payment_id, luego merchant_order_id, y como último pref_id
        const confirmUrls: string[] = [];
        if (paymentId)
          confirmUrls.push(
            `/api/admin/payments/confirm?payment_id=${encodeURIComponent(paymentId)}`
          );
        if (merchantOrderId)
          confirmUrls.push(
            `/api/admin/payments/confirm?merchant_order_id=${encodeURIComponent(
              merchantOrderId
            )}`
          );
        if (preferenceId)
          confirmUrls.push(
            `/api/admin/payments/confirm?preference_id=${encodeURIComponent(
              preferenceId
            )}`
          );

        let approvedFromConfirm: boolean | null = null;
        let typeFromConfirm: "ticket" | "vip-table" | undefined;
        let recordIdFromConfirm: string | undefined;

        for (const url of confirmUrls) {
          try {
            const r = await fetch(url, { cache: "no-store" });
            const data: ConfirmResp = await r.json();

            if (isConfirmOk(data)) {
              setConfirmed(true);
              // Tomar datos que falten
              if (data.type) typeFromConfirm = data.type;
              if (data.recordId) recordIdFromConfirm = data.recordId;

              const ok =
                typeof data.approvedStrong === "boolean"
                  ? data.approvedStrong
                  : (data.status || "").toLowerCase() === "approved";

              approvedFromConfirm = ok;
              break; // primera confirmación válida nos basta
            }
          } catch {
            // probar siguiente variante
          }
        }

        // Aplicar los datos detectados:
        if (typeFromConfirm) localType = typeFromConfirm;
        if (recordIdFromConfirm) localRecordId = recordIdFromConfirm;

        // approved preliminar: por params o confirm
        let approvedNow: boolean =
          approvedFromParams || approvedFromConfirm === true;

        // Reflejar en UI intermedia
        setApproved(approvedNow);
        if (localType) setType(localType);
        if (localRecordId) setRecordId(localRecordId);
        if (approvedFromConfirm !== null || approvedFromParams) {
          setConfirmed(true);
        } else {
          setConfirmed(false);
        }

        // === 3) Cargar información pública del ticket SI tenemos identificadores ===
        if (localType && localRecordId) {
          const r = await fetch(
            `/api/tickets/public?type=${encodeURIComponent(
              localType
            )}&id=${encodeURIComponent(localRecordId)}`,
            { cache: "no-store" }
          );
          const info: PublicTicketResp = await r.json();

          if (info.ok) {
            // si el backend reporta approved, márcalo (aunque confirm fallara)
            if (info.paymentStatus === "approved") {
              approvedNow = true;
              setApproved(true);
            }

            // setear códigos
            if (info.validationCode) setValidationCode(info.validationCode);
            if (approvedNow) {
              // solo generamos/mostramos QR cuando está aprobado
              if (info.qrCode) await renderQr(info.qrCode);
              else if (info.validationCode) await renderQr(info.validationCode);

              // disparar email 1 vez
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
    link.download = `hooka-qr-${validationCode || "codigo"}.png`;
    link.click();
  };

  const copyCode = async () => {
    if (!validationCode) return;
    try {
      await navigator.clipboard.writeText(validationCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };

  const StatusBadge = () => {
    if (approved === true)
      return (
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-600/20 text-emerald-200 px-3 py-1 text-xs">
          <CheckCircle2 className="w-4 h-4" />
          Acreditado
        </div>
      );
    if (approved === false)
      return (
        <div className="inline-flex items-center gap-2 rounded-full bg-red-600/20 text-red-200 px-3 py-1 text-xs">
          <XCircle className="w-4 h-4" />
          No acreditado
        </div>
      );
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-yellow-500/20 text-yellow-100 px-3 py-1 text-xs">
        <Clock className="w-4 h-4" />
        Validando
      </div>
    );
  };

  return (
    <main className="relative min-h-[100svh] overflow-hidden text-white">
      {/* Fondo con HOOKA */}
      <HeroBackgroundEasy
        mobile={{ rows: 4, cols: 1 }}
        desktop={{ rows: 4, cols: 3 }}
        fontMobile="clamp(2.6rem, 21vw, 9rem)"
        opacity={0.55}
        gap="clamp(0px, 1vh, 10px)"
        navTopPx={0}
      />
      {/* Velo para contraste */}
      <div aria-hidden className="absolute inset-0 bg-black/55" />

      {/* Contenido */}
      <section className="relative z-10 grid min-h-[100svh] place-items-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl shadow-2xl">
          {/* Header */}
          <div className="px-6 pt-6 text-center space-y-2">
            <StatusBadge />
            <h1 className="text-3xl font-display">¡Pago exitoso!</h1>
            <p className="text-sm text-white/80">
              Te enviamos un email con tu entrada. Guardá el <b>código</b> o{" "}
              <b>QR</b> para el ingreso.
            </p>
          </div>

          {/* Skeleton / Content */}
          <div className="p-6 space-y-6">
            {loading ? (
              <div className="space-y-4">
                <div className="h-28 rounded-xl bg-white/10 animate-pulse" />
                <div className="h-72 rounded-xl bg-white/10 animate-pulse" />
              </div>
            ) : approved ? (
              <>
                {/* Código de validación */}
                {validationCode && (
                  <div className="rounded-xl bg-[#5b0d0d]/70 border border-white/10 p-5 text-center space-y-2">
                    <p className="text-xs uppercase tracking-wide text-white/80">
                      Código de validación
                    </p>
                    <p className="text-4xl font-extrabold tracking-widest">
                      {validationCode}
                    </p>
                    <div className="flex gap-2 justify-center pt-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-white/10 hover:bg-white/20 text-white border border-white/20"
                        onClick={copyCode}
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        {copied ? "¡Copiado!" : "Copiar código"}
                      </Button>
                    </div>
                    <p className="text-[11px] text-white/75">
                      Mostralo en acceso si te lo solicitan.
                    </p>
                  </div>
                )}

                {/* QR */}
                {qrCodeImg && (
                  <div className="rounded-xl bg-black/30 border border-white/10 p-5 text-center space-y-4">
                    <p className="text-sm text-white/85">Tu Código QR</p>
                    <div className="mx-auto w-[260px] h-[260px] bg-white rounded-xl p-3 shadow-inner">
                      <img
                        src={qrCodeImg}
                        alt="QR Code"
                        className="w-full h-full object-contain rounded-md"
                      />
                    </div>
                    <Button
                      onClick={downloadQR}
                      variant="outline"
                      className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Descargar QR
                    </Button>
                  </div>
                )}
              </>
            ) : (
              // No approved aún
              <div className="rounded-xl border border-yellow-300/20 bg-yellow-500/15 p-4 text-yellow-50 text-sm">
                Estamos validando tu compra. Si no ves tu QR en unos segundos,
                revisá tu email (incluido spam). Si el estado queda en
                pendiente, lo actualizaremos automáticamente.
              </div>
            )}

            {/* Nota inferior */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-[12px] text-white/80">
              Te enviamos toda la info para disfrutar de HOOKA. Si tenés dudas,
              respondé el email de confirmación.
              {confirmed === true && approved === false && (
                <p className="mt-2 text-red-200">
                  Aviso: tu pago aún no figura como acreditado. Se actualizará
                  automáticamente en breve.
                </p>
              )}
            </div>

            {/* CTA Volver */}
            <Button
              asChild
              size="lg"
              className="w-full rounded-full bg-white text-[#5b0d0d] hover:bg-white/90"
            >
              <Link href="/">
                <Home className="w-4 h-4 mr-2" />
                Volver al inicio
              </Link>
            </Button>
            <p className="text-center text-[11px] text-white/70 pb-1">
              ¡Nos vemos en la fiesta! 🫦💣
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
