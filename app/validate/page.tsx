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

// Helpers (server)
import { getTicketByCode, validateTicket } from "@/lib/api";

/* ======================
   Tipos (compat con lib/schemas.ts)
====================== */
type ApiTicket = {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDni: string;
  ticketType: "general" | "vip";
  paymentStatus: "pending" | "approved" | "rejected";
  quantity?: number;
  validated: boolean;
  validatedAt?: string | undefined; // nunca null
  purchaseDate: string; // ISO
  eventDate?: string | undefined; // nunca null

  // VIP opcionales
  vipLocation?: "dj" | "piscina" | "general" | undefined;
  tableNumber?: number | undefined;
  vipTables?: number | undefined;
  capacityPerTable?: number | undefined;
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
  validatedAt?: string | undefined;
  eventDate?: string | undefined;

  // VIP
  vipLocation?: "dj" | "piscina" | "general" | undefined;
  tableNumber?: number | undefined;
  vipTables?: number | undefined;
  capacityPerTable?: number | undefined;
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

function resolvedQuantity(t: ApiTicket): number {
  const q = Number(t.quantity ?? 0);
  if (t.ticketType === "vip") {
    if (q > 0) return q;
    const tables = Number(t.vipTables ?? 0);
    const cap = Number(t.capacityPerTable ?? 0);
    if (tables > 0 && cap > 0) return tables * cap;
    if (tables > 0) return tables;
    return 1;
  }
  return q > 0 ? q : 1;
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
    quantity: resolvedQuantity(t),
    paymentStatus: t.paymentStatus,
    validated: t.validated,
    validatedAt: t.validatedAt ?? undefined,
    eventDate: t.eventDate ?? undefined,
    vipLocation: t.vipLocation ?? undefined,
    tableNumber: t.tableNumber ?? undefined,
    vipTables: t.vipTables ?? undefined,
    capacityPerTable: t.capacityPerTable ?? undefined,
  };
}

/** Flujo tolerante: GET primero; si corresponde, POST para marcar validado */
async function runValidationFlow(
  code: string
): Promise<{ ticket?: UiTicket; error?: string }> {
  try {
    let t: ApiTicket;
    try {
      const t0 = await getTicketByCode(code);
      t = t0 as ApiTicket;
    } catch (e: any) {
      return {
        error: e?.code ? `Error backend: ${e.code}` : "Código no encontrado",
      };
    }

    // Si no está aprobado, mostramos la tarjeta sin intentar validar
    if (t.paymentStatus !== "approved") {
      return { ticket: toUiTicket(t, code) };
    }

    // Si está aprobado y aún no validado, intentamos validar
    if (!t.validated) {
      try {
        const res = await validateTicket(code);
        if (res?.ticket) t = res.ticket as ApiTicket;
      } catch (e: any) {
        // Si ya estaba validado, seguimos con el ticket anterior
        if (e?.code !== "already_validated") {
          // ignoramos otros errores
        }
      }
    }

    return { ticket: toUiTicket(t, code) };
  } catch {
    return { error: "Error al validar" };
  }
}

/* ======================
   Componentes UI
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
          <form method="GET" action="/validate">
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
      <form method="GET" action="/validate">
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

          {/* Cantidad */}
          <div className="flex items-start gap-3">
            <Hash className="w-5 h-5" style={{ color: BEIGE }} />
            <div className="flex-1">
              <p className="text-sm text-white/80">Cantidad de Entradas</p>
              <p className="font-semibold text-lg">{qtyLabel}</p>
            </div>
          </div>

          {/* VIP */}
          {t.ticketType === "vip" && (
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

              {typeof t.capacityPerTable === "number" &&
                t.capacityPerTable > 0 && (
                  <div className="flex items-start gap-3">
                    <Hash className="w-5 h-5" style={{ color: BEIGE }} />
                    <div className="flex-1">
                      <p className="text-sm text-white/80">
                        Capacidad por mesa
                      </p>
                      <p className="font-semibold text-lg">
                        {t.capacityPerTable}
                      </p>
                    </div>
                  </div>
                )}
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

        <form method="GET" action="/validate" className="w-full mt-6">
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
   Página principal (SSR)
====================== */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams; // 👈 importante: await
  const pick = (val: string | string[] | undefined) =>
    (Array.isArray(val) ? val[0] : val) ?? "";

  const rawCode = pick(sp?.code) || pick(sp?.validationCode) || "";
  const codeParam = rawCode.toString().normalize("NFKC").trim();
  const validCode = codeParam.length >= 4 ? codeParam : "";

  let ui: { ticket?: UiTicket; error?: string } | null = null;
  if (validCode) {
    ui = await runValidationFlow(validCode);
  }

  return (
    <div
      className="relative min-h-screen text-white flex flex-col items-center justify-start py-12 px-4"
      style={{ backgroundColor: BORDO }}
    >
      <div className="container mx-auto max-w-2xl">
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
            Ingresá el código o escaneá el QR para validar tu entrada.
          </p>
        </div>

        {!validCode && <EmptyState />}
        {validCode && ui && ui.error && <ErrorCard message={ui.error} />}
        {validCode && ui && ui.ticket && <TicketCard t={ui.ticket} />}
      </div>
    </div>
  );
}
