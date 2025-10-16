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
import { useEffect, useState } from "react";
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
type ConfirmErr = { ok: false; error: string; retry_later?: boolean };
type ConfirmResp = ConfirmOk | ConfirmErr;
const isConfirmOk = (x: ConfirmResp): x is ConfirmOk =>
  x && (x as any).ok === true;

/* =========================
   Helpers
========================= */
// normalizar código de validación (espacios fuera + mayúsculas)
const normalizeCode = (v?: string | null) =>
  (v ?? "").toString().replace(/\s+/g, "").toUpperCase();

const isHttpsPublicUrl = (url?: string | null) =>
  !!url && /^https:\/\/[^ ]+$/i.test(url.trim());

function getPublicBaseUrl(): string {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (isHttpsPublicUrl(envBase)) return envBase!;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  return "";
}

// build con código ya normalizado
function buildValidateUrl(code: string) {
  const base = getPublicBaseUrl();
  const prefix = base ? `${base}` : "";
  return `${prefix}/validate?code=${encodeURIComponent(normalizeCode(code))}`;
}

/* =========================
   Componente
========================= */
export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();

  const [qrCodeImg, setQrCodeImg] = useState<string>("");
  const [validationCode, setValidationCode] = useState<string>(""); // guardamos ya normalizado
  const [loading, setLoading] = useState(true);

  // Estado de confirmación del pago (solo para UI)
  const [approved, setApproved] = useState<boolean | null>(null);
  const [confirmed, setConfirmed] = useState<boolean | null>(null);

  const [type, setType] = useState<"ticket" | "vip-table" | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);

  const renderQr = async (text: string) => {
    // generamos QR SIEMPRE con la URL que usa el código normalizado
    const img = await QRCode.toDataURL(buildValidateUrl(text), {
      width: 360,
      margin: 2,
    });
    setQrCodeImg(img);
  };

  async function pollForApproval(
    urls: string[],
    opts: { tries?: number; baseDelayMs?: number } = {}
  ): Promise<{
    approved: boolean;
    type?: "ticket" | "vip-table";
    recordId?: string;
  }> {
    const tries = opts.tries ?? 7;
    const baseDelayMs = opts.baseDelayMs ?? 800;

    for (let i = 0; i < tries; i++) {
      for (const url of urls) {
        try {
          const r = await fetch(url, { cache: "no-store" });
          const data: ConfirmResp = await r.json();
          if (isConfirmOk(data)) {
            const ok =
              typeof data.approvedStrong === "boolean"
                ? data.approvedStrong
                : (data.status || "").toLowerCase() === "approved";
            if (ok) {
              return {
                approved: true,
                type: data.type,
                recordId: data.recordId,
              };
            }
          }
        } catch {}
      }
      const wait =
        Math.min(baseDelayMs * Math.pow(1.35, i), 2500) + Math.random() * 150;
      await new Promise((res) => setTimeout(res, wait));
    }
    return { approved: false };
  }

  useEffect(() => {
    const run = async () => {
      try {
        // 1) Parametría de MP
        const paymentId =
          searchParams.get("payment_id") ||
          searchParams.get("collection_id") ||
          "";
        const merchantOrderId = searchParams.get("merchant_order_id") || "";
        const statusParam =
          searchParams.get("status") ||
          searchParams.get("collection_status") ||
          "";
        const externalRef = searchParams.get("external_reference") || "";

        // 2) pista de la URL
        const approvedFromParams =
          (statusParam || "").toLowerCase() === "approved";

        // 3) endpoints de confirmación
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

        // 4) type/record desde external_reference
        let localType: "ticket" | "vip-table" | null = null;
        let localRecordId: string | null = null;
        if (externalRef.includes(":")) {
          const [t, id] = externalRef.split(":");
          if ((t === "ticket" || t === "vip-table") && id) {
            localType = t as "ticket" | "vip-table";
            localRecordId = id;
          }
        }

        // 5) confirmación inmediata
        let confirmedApproved: boolean | null = null;
        let typeFromConfirm: "ticket" | "vip-table" | undefined;
        let recordIdFromConfirm: string | undefined;

        if (confirmUrls.length) {
          try {
            const r = await fetch(confirmUrls[0], { cache: "no-store" });
            const data: ConfirmResp = await r.json();
            if (isConfirmOk(data)) {
              typeFromConfirm = data.type;
              recordIdFromConfirm = data.recordId;
              confirmedApproved =
                typeof data.approvedStrong === "boolean"
                  ? data.approvedStrong
                  : (data.status || "").toLowerCase() === "approved";
              setConfirmed(true);
            } else {
              setConfirmed(false);
            }
          } catch {
            setConfirmed(false);
          }
        } else {
          setConfirmed(false);
        }

        if (typeFromConfirm) localType = typeFromConfirm;
        if (recordIdFromConfirm) localRecordId = recordIdFromConfirm;

        // 6) polling si aún no aprobó
        let approvedNow = approvedFromParams || confirmedApproved === true;
        if (!approvedNow && confirmUrls.length) {
          const polled = await pollForApproval(confirmUrls);
          if (polled.approved) {
            approvedNow = true;
            if (polled.type) localType = polled.type;
            if (polled.recordId) localRecordId = polled.recordId;
          }
        }

        // 7) reflejar estado preliminar
        const approvalKnown =
          approvedFromParams ||
          confirmedApproved !== null ||
          confirmUrls.length === 0;
        setApproved(approvalKnown ? approvedNow : null);
        if (localType) setType(localType);
        if (localRecordId) setRecordId(localRecordId);

        // 8) consultar info pública y generar QR SOLO con /validate?code=...
        if (localType && localRecordId) {
          const require = approvedNow ? "&requireApproved=1" : "";
          const r = await fetch(
            `/api/admin/tickets/public?type=${encodeURIComponent(
              localType
            )}&id=${encodeURIComponent(localRecordId)}${require}`,
            { cache: "no-store" }
          );
          const info: PublicTicketResp = await r.json();

          if (info.ok) {
            if (info.paymentStatus === "approved") {
              approvedNow = true;
              setApproved(true);
            }

            // normalizamos SIEMPRE lo que viene del backend
            const code = normalizeCode(info.validationCode);
            if (code) {
              setValidationCode(code);
              if (approvedNow) {
                await renderQr(code); // renderQr ya construye la URL con code normalizado
              }
            } else {
              setQrCodeImg("");
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

  /* =========================
     Acciones UI
  ========================= */
  const downloadQR = () => {
    if (!qrCodeImg) return;
    const link = document.createElement("a");
    link.href = qrCodeImg;
    // nombre de archivo con código normalizado
    link.download = `hooka-qr-${validationCode || "codigo"}.png`;
    link.click();
  };

  const copyCode = async () => {
    if (!validationCode) return;
    try {
      // copiado con código normalizado
      await navigator.clipboard.writeText(validationCode);
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

  const Title = () => {
    if (approved === true)
      return <h1 className="text-3xl font-display">¡Pago acreditado!</h1>;
    if (approved === false)
      return <h1 className="text-3xl font-display">Pago no acreditado</h1>;
    return <h1 className="text-3xl font-display">Validando tu pago…</h1>;
  };

  /* =========================
     Render
  ========================= */
  // heurística simple de “código listo”
  const codeLooksReady = validationCode && validationCode.length >= 6;

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
            <Title />
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
                {codeLooksReady && (
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
                        Copiar código
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

                {!codeLooksReady && !qrCodeImg && (
                  <div className="rounded-xl border border-yellow-300/20 bg-yellow-500/15 p-4 text-yellow-50 text-sm">
                    Tu pago fue acreditado, estamos generando tu código. Si no
                    aparece en unos segundos, revisá tu email.
                  </div>
                )}
              </>
            ) : (
              // No approved aún
              <div className="rounded-xl border border-yellow-300/20 bg-yellow-500/15 p-4 text-yellow-50 text-sm">
                Estamos validando tu compra. Si no ves tu QR en unos segundos,
                revisá tu email (incluido spam).
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
