// app/validate/page.tsx
export const dynamic = "force-dynamic";

// UI (shadcn)
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Icons
import {
  QrCode,
  CheckCircle,
  XCircle,
  User,
  IdCard,
  Ticket as TicketIcon,
  Calendar,
  Hash,
  MapPin,
} from "lucide-react";

// Fondo (client component)
import HeroBackgroundEasy from "@/components/HeroBackgroundEasy";

// Helpers (server)
import { getTicketByCode, validateTicket } from "@/lib/api";

/* ======================
   Tipos
====================== */
type ApiTicket = {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDni: string;
  ticketType: "general" | "vip";
  quantity: number;
  paymentStatus: "pending" | "approved" | "rejected";
  validated: boolean;
  validatedAt?: string | null;
  purchaseDate: string;
  eventDate?: string | null;

  // VIP
  vipLocation?: "dj" | "piscina" | "general" | null;
  tableNumber?: number | null;
  vipTables?: number | null;
};

type UiTicket = {
  validationCode?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDni: string;
  type: "ticket";
  ticketType: "general" | "vip";
  quantity: number;
  paymentStatus: "pending" | "approved" | "rejected";
  validated: boolean;
  validatedAt?: string | null;
  eventDate?: string | null;

  // VIP
  vipLocation?: "dj" | "piscina" | "general" | null;
  tableNumber?: number | null;
  vipTables?: number | null;
};

/* ======================
   Util
====================== */
const BORDO = "#5b0d0d";
const BEIGE = "#e3cfbf";

function prettyVipLocation(loc?: UiTicket["vipLocation"]) {
  if (!loc) return "—";
  if (loc === "dj") return "DJ";
  if (loc === "piscina") return "Piscina";
  if (loc === "general") return "General";
  return loc;
}

function toUiTicket(t: ApiTicket, code?: string): UiTicket {
  return {
    validationCode: code,
    customerName: t.customerName,
    customerEmail: t.customerEmail,
    customerPhone: t.customerPhone,
    customerDni: t.customerDni,
    type: "ticket",
    ticketType: t.ticketType,
    quantity: t.quantity ?? 1,
    paymentStatus: t.paymentStatus,
    validated: t.validated,
    validatedAt: t.validatedAt ?? null,
    eventDate: t.eventDate ?? null,
    // VIP
    vipLocation: t.vipLocation ?? null,
    tableNumber: t.tableNumber ?? null,
    vipTables: t.vipTables ?? null,
  };
}

/** Flujo tolerante: GET primero; si corresponde, POST para marcar validado */
async function runValidationFlow(
  code: string
): Promise<{ ticket?: UiTicket; error?: string }> {
  try {
    // 1) Obtenemos detalle por código (si falla, devolvemos el error real del backend)
    let t: ApiTicket;
    try {
      const t0 = await getTicketByCode(code);
      t = t0 as ApiTicket;
    } catch (e: any) {
      return {
        error: e?.code ? `Error backend: ${e.code}` : "Código no encontrado",
      };
    }

    // 2) Si no está aprobado, devolvemos estado igualmente (la UI lo muestra)
    if (t.paymentStatus !== "approved") {
      return { ticket: toUiTicket(t, code) };
    }

    // 3) Si está aprobado y NO validado, intentamos validar (ignorar "already_validated")
    if (!t.validated) {
      try {
        const res = await validateTicket(code);
        if (res?.ticket) t = res.ticket as ApiTicket;
      } catch (e: any) {
        if (e?.code !== "already_validated") {
          // cualquier otro error: seguimos con el detalle que ya tenemos
        }
      }
    }

    // 4) Devolvemos estado final
    return { ticket: toUiTicket(t, code) };
  } catch {
    return { error: "Error al validar" };
  }
}

/* ======================
   Vistas
====================== */
function EmptyState() {
  return (
    <Card
      className="p-6 backdrop-blur-xl"
      style={{
        backgroundColor: `${BORDO}20`,
        borderColor: `${BEIGE}26`,
        color: BEIGE,
      }}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="code" className="text-[color:var(--beige,#e3cfbf)]">
            Código de validación
          </Label>
          {/* GET directo para no generar POST/303 adicionales */}
          <form method="GET" action="/admin/validate">
            <Input
              id="code"
              name="code"
              inputMode="text"
              maxLength={32}
              placeholder="123456"
              className="text-center text-2xl tracking-widest font-mono bg-white/10 border border-white/20 text-white placeholder:text-white/60"
              required
            />
            <Button
              type="submit"
              className="w-full text-lg py-6 mt-4"
              style={{
                backgroundColor: BEIGE,
                color: BORDO,
              }}
            >
              Validar Código
            </Button>
          </form>
        </div>
      </div>
    </Card>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card
      className="p-8 text-center space-y-4 backdrop-blur-xl"
      style={{
        backgroundColor: `${BORDO}26`,
        borderColor: `${BEIGE}26`,
        color: BEIGE,
      }}
    >
      <XCircle className="w-16 h-16 text-red-400 mx-auto" />
      <h2 className="text-2xl font-bold" style={{ color: BEIGE }}>
        Error
      </h2>
      <p className="text-white/85">{message}</p>
      {/* GET otra vez para reintentar */}
      <form method="GET" action="/admin/validate">
        <Input
          name="code"
          inputMode="text"
          maxLength={32}
          placeholder="Ingresá otro código"
          className="text-center text-lg font-mono mb-3 bg-white/10 border border-white/20 text-white placeholder:text-white/60"
          required
        />
        <Button
          type="submit"
          variant="outline"
          className="border"
          style={{
            borderColor: `${BEIGE}33`,
            color: BEIGE,
          }}
        >
          Intentar de nuevo
        </Button>
      </form>
    </Card>
  );
}

function TicketCard({ t }: { t: UiTicket }) {
  const isVip = t.ticketType === "vip";
  const qtyLabel =
    isVip && (t.vipTables ?? 0) > 1
      ? `${t.quantity} entradas (${t.vipTables} mesas)`
      : `${t.quantity} ${t.quantity === 1 ? "entrada" : "entradas"}`;

  const TitleBlock = () => {
    if (t.validated) {
      return (
        <>
          <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2" style={{ color: BEIGE }}>
            Entrada Válida
          </h2>
          {t.validatedAt && (
            <p className="text-white/85">
              Validada el {new Date(t.validatedAt).toLocaleString("es-AR")}
            </p>
          )}
        </>
      );
    }
    if (t.paymentStatus !== "approved") {
      return (
        <>
          <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2" style={{ color: BEIGE }}>
            Pago no aprobado
          </h2>
          <p className="text-white/85">
            Esta entrada aún no figura como aprobada.
          </p>
        </>
      );
    }
    return (
      <>
        <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2" style={{ color: BEIGE }}>
          Entrada Válida
        </h2>
        <p className="text-white/85">
          La entrada está aprobada y fue validada correctamente.
        </p>
      </>
    );
  };

  return (
    <Card
      className="p-8 backdrop-blur-xl"
      style={{
        backgroundColor: `${BORDO}26`,
        borderColor: `${BEIGE}26`,
        color: BEIGE,
      }}
    >
      <div className="space-y-6">
        <div className="text-center">
          <TitleBlock />
        </div>

        <div
          className="space-y-4 pt-6 border-t"
          style={{ borderColor: `${BEIGE}26` }}
        >
          {t.validationCode && (
            <div
              className="flex items-start gap-3 rounded-lg p-4"
              style={{ backgroundColor: `${BEIGE}12` as any }}
            >
              <Hash className="w-5 h-5" style={{ color: BEIGE }} />
              <div className="flex-1">
                <p className="text-sm text-white/80">Código de Validación</p>
                <p
                  className="font-mono font-bold text-2xl tracking-wider"
                  style={{ color: BEIGE }}
                >
                  {t.validationCode}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3">
            <User className="w-5 h-5" style={{ color: BEIGE }} />
            <div className="flex-1">
              <p className="text-sm text-white/80">Nombre</p>
              <p className="font-semibold text-lg">{t.customerName}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <IdCard className="w-5 h-5" style={{ color: BEIGE }} />
            <div className="flex-1">
              <p className="text-sm text-white/80">DNI</p>
              <p className="font-semibold text-lg">{t.customerDni}</p>
            </div>
          </div>

          {/* Tipo de Entrada */}
          <div className="flex items-start gap-3">
            <TicketIcon className="w-5 h-5" style={{ color: BEIGE }} />
            <div className="flex-1">
              <p className="text-sm text-white/80">Tipo de Entrada</p>
              <p className="font-semibold text-lg">
                {t.ticketType === "general" ? "General" : "VIP"}
              </p>
            </div>
          </div>

          {/* Cantidad de entradas (y mesas si aplica) */}
          <div className="flex items-start gap-3">
            <Hash className="w-5 h-5" style={{ color: BEIGE }} />
            <div className="flex-1">
              <p className="text-sm text-white/80">Cantidad de Entradas</p>
              <p className="font-semibold text-lg">{qtyLabel}</p>
            </div>
          </div>

          {/* VIP: Locación y Mesa */}
          {isVip && (
            <>
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5" style={{ color: BEIGE }} />
                <div className="flex-1">
                  <p className="text-sm text-white/80">Locación VIP</p>
                  <p className="font-semibold text-lg">
                    {prettyVipLocation(t.vipLocation)}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Hash className="w-5 h-5" style={{ color: BEIGE }} />
                <div className="flex-1">
                  <p className="text-sm text-white/80">Número de Mesa</p>
                  <p className="font-semibold text-lg">
                    {t.tableNumber != null
                      ? `Mesa ${t.tableNumber}`
                      : "Sin asignar"}
                  </p>
                </div>
              </div>
            </>
          )}

          {t.eventDate && (
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5" style={{ color: BEIGE }} />
              <div className="flex-1">
                <p className="text-sm text-white/80">Fecha del Evento</p>
                <p className="font-semibold text-lg">
                  {new Date(t.eventDate).toLocaleDateString("es-AR")}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Reintentar con otro código */}
        <form method="GET" action="/admin/validate" className="w-full mt-6">
          <Input
            name="code"
            inputMode="text"
            maxLength={32}
            placeholder="Ingresá otro código"
            className="text-center text-lg font-mono mb-3 bg-white/10 border border-white/20 text-white placeholder:text-white/60"
            required
          />
          <Button
            type="submit"
            className="w-full"
            style={{ backgroundColor: BEIGE, color: BORDO }}
          >
            Validar otra entrada
          </Button>
        </form>
      </div>
    </Card>
  );
}

/* ======================
   Página (SSR)
====================== */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Next 15: searchParams async
  const sp = await searchParams;

  // Tomamos ?code= o ?validationCode= (cualquiera de los dos)
  const pick = (val: string | string[] | undefined) =>
    (Array.isArray(val) ? val[0] : val) ?? "";

  const rawCode =
    pick(sp?.code) || // ?code=XXXX
    pick(sp?.validationCode) || // ?validationCode=XXXX
    "";

  // Normalizo pero NO elimino letras: solo trim
  const codeParam = rawCode.toString().normalize("NFKC").trim();
  const validCode = codeParam.length >= 4 ? codeParam : "";

  let ui: { ticket?: UiTicket; error?: string } | null = null;
  if (validCode) {
    ui = await runValidationFlow(validCode);
  }

  return (
    <div
      className="relative min-h-screen text-white"
      style={{ backgroundColor: BORDO }}
    >
      {/* Fondo */}
      <HeroBackgroundEasy
        mobile={{ rows: 4, cols: 1 }}
        desktop={{ rows: 4, cols: 3 }}
        fontMobile="clamp(2.6rem, 21vw, 9rem)"
        opacity={0.55}
        gap="clamp(0px, 1vh, 10px)"
        navTopPx={0}
      />
      {/* Overlay para contraste */}
      <div aria-hidden className="absolute inset-0 bg-black/55" />

      <div className="relative z-10 py-12 px-4">
        <div className="container mx-auto max-w-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <div
              className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
              style={{
                background: `linear-gradient(135deg, ${BORDO}, ${BEIGE})`,
              }}
            >
              <QrCode className="w-8 h-8 text-white" />
            </div>
            <h1
              className="text-4xl font-display font-bold mb-2"
              style={{ color: BEIGE }}
            >
              Validación de Entradas
            </h1>
            <p className="text-white/85">
              Si llegaste desde un QR, esta página valida automáticamente con{" "}
              <code className="text-white/90">?code=XXXXXX</code> (o{" "}
              <code className="text-white/90">?validationCode=XXXXXX</code>). Si
              no, ingresá el código manualmente.
            </p>
          </div>

          {/* Contenido principal */}
          {!validCode && <EmptyState />}

          {validCode && ui && ui.error && <ErrorCard message={ui.error} />}
          {validCode && ui && ui.ticket && <TicketCard t={ui.ticket} />}
        </div>
      </div>
    </div>
  );
}
