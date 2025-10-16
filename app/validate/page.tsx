// app/validate/page.tsx

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
  Ticket,
  Calendar,
  Hash,
} from "lucide-react";

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

/* ======================
   Util
====================== */
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

/** Flujo tolerante: GET primero; si corresponde, POST para marcar validado */
async function runValidationFlow(
  code: string
): Promise<{ ticket?: UiTicket; error?: string }> {
  try {
    let t: ApiTicket | undefined;

    // 1) Obtenemos detalle por código (si falla, devolvemos el error real del backend)
    try {
      t = await getTicketByCode(code);
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
        if (res?.ticket) t = res.ticket;
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
    <Card className="p-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="code">Código de validación</Label>
          {/* GET directo para no generar POST/303 adicionales */}
          <form method="GET" action="/admin/validate">
            <Input
              id="code"
              name="code"
              inputMode="text" // permite alfanuméricos si existieran
              // sin pattern: no bloqueamos letras
              maxLength={32}
              placeholder="123456"
              className="text-center text-2xl tracking-widest font-mono"
              required
            />
            <Button
              type="submit"
              className="w-full text-lg py-6 bg-gradient-to-r from-primary to-secondary mt-4"
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
    <Card className="p-8 border-destructive">
      <div className="text-center space-y-4">
        <XCircle className="w-16 h-16 text-destructive mx-auto" />
        <h2 className="text-2xl font-bold text-destructive">Error</h2>
        <p className="text-muted-foreground">{message}</p>
        {/* GET otra vez para reintentar */}
        <form method="GET" action="/admin/validate">
          <Input
            name="code"
            inputMode="text"
            maxLength={32}
            placeholder="Ingresá otro código"
            className="text-center text-lg font-mono mb-3"
            required
          />
          <Button type="submit" variant="outline">
            Intentar de nuevo
          </Button>
        </form>
      </div>
    </Card>
  );
}

function TicketCard({ t }: { t: UiTicket }) {
  return (
    <Card className="p-8 border-primary">
      <div className="space-y-6">
        <div className="text-center">
          {t.validated ? (
            <>
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-green-500 mb-2">
                Entrada Válida
              </h2>
              {t.validatedAt && (
                <p className="text-muted-foreground">
                  Validada el {new Date(t.validatedAt).toLocaleString("es-AR")}
                </p>
              )}
            </>
          ) : t.paymentStatus !== "approved" ? (
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
          {t.validationCode && (
            <div className="flex items-start gap-3 bg-muted/50 p-4 rounded-lg">
              <Hash className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">
                  Código de Validación
                </p>
                <p className="font-mono font-bold text-2xl tracking-wider">
                  {t.validationCode}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3">
            <User className="w-5 h-5 text-primary mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Nombre</p>
              <p className="font-semibold text-lg">{t.customerName}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <IdCard className="w-5 h-5 text-primary mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">DNI</p>
              <p className="font-semibold text-lg">{t.customerDni}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Ticket className="w-5 h-5 text-primary mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Tipo de Entrada</p>
              <p className="font-semibold text-lg">
                {`Entrada ${t.ticketType === "general" ? "General" : "VIP"}`}
              </p>
            </div>
          </div>

          {t.eventDate && (
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">
                  Fecha del Evento
                </p>
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
            className="text-center text-lg font-mono mb-3"
            required
          />
          <Button type="submit" className="w-full">
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
export const dynamic = "force-dynamic";

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
    <div className="min-h-screen bg-gradient-to-b from-background via-primary/5 to-secondary/5 py-12 px-4">
      <div className="container mx-auto max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-primary to-secondary mb-4">
            <QrCode className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-display font-bold mb-2">
            Validación de Entradas
          </h1>
          <p className="text-muted-foreground">
            Si llegaste desde un QR, esta página valida automáticamente con{" "}
            <code>?code=XXXXXX</code> (o <code>?validationCode=XXXXXX</code>).
            Si no, ingresá el código manualmente.
          </p>
        </div>

        {/* Contenido principal */}
        {!validCode && <EmptyState />}

        {validCode && ui && ui.error && <ErrorCard message={ui.error} />}
        {validCode && ui && ui.ticket && <TicketCard t={ui.ticket} />}
      </div>
    </div>
  );
}
