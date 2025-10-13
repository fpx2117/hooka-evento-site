// app/admin/validate/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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
  Lock,
  LogIn,
  LogOut,
} from "lucide-react";

// 🔸 IMPORTAMOS TUS HELPERS (se usan en el servidor)
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

/** Ejecuta la validación con tu misma lógica original, pero en el servidor */
async function runValidationFlow(
  code: string
): Promise<{ ticket?: UiTicket; error?: string }> {
  try {
    let t: ApiTicket | undefined;
    try {
      const res = await validateTicket(code); // ← TU helper (POST al backend)
      t = res.ticket;
    } catch (e: any) {
      // Igual que tu flujo: si ya validado o no aprobado, buscamos el detalle
      if (e?.code === "already_validated" || e?.code === "not_approved") {
        try {
          t = await getTicketByCode(code); // ← TU helper (GET por código)
        } catch {
          // se maneja abajo si sigue sin datos
        }
      }
      if (!t) return { error: e?.details?.error || "Validación fallida" };
    }
    return t
      ? { ticket: toUiTicket(t, code) }
      : { error: "No se encontró la entrada" };
  } catch {
    return { error: "Error al validar" };
  }
}

/* ======================
   Server Actions (auth)
====================== */
export const dynamic = "force-dynamic";

export async function loginAction(formData: FormData) {
  "use server";
  const PASS = process.env.ADMIN_VALIDATE_PASS ?? "";
  const HOURS = parseInt(process.env.ADMIN_VALIDATE_SESSION_HOURS || "12", 10);

  if (!PASS) redirect("/admin/validate?error=env");

  const password = String(formData.get("password") ?? "");
  if (password !== PASS) redirect("/admin/validate?error=1");

  (await cookies()).set({
    name: "admin_validate_auth",
    value: "ok",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin/validate",
    maxAge: HOURS * 60 * 60,
  });

  redirect("/admin/validate");
}

export async function logoutAction() {
  "use server";
  (await cookies()).set({
    name: "admin_validate_auth",
    value: "",
    expires: new Date(0),
    path: "/admin/validate",
  });
  redirect("/admin/validate");
}

/* ======================
   Vistas (SSR)
====================== */
function LoginGate({ errorKey }: { errorKey?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background via-primary/5 to-secondary/5 p-4">
      <Card className="w-full max-w-sm p-6 space-y-5">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">Acceso requerido</h1>
          <p className="text-sm text-muted-foreground">
            Ingresá la contraseña de administrador.
          </p>
        </div>

        {errorKey && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
            <XCircle className="w-4 h-4" />
            {errorKey === "env"
              ? "Falta configurar ADMIN_VALIDATE_PASS en .env.local"
              : errorKey === "1"
                ? "Contraseña incorrecta"
                : "Error de autenticación"}
          </div>
        )}

        <form action={loginAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
              autoFocus
            />
          </div>
          <Button type="submit" className="w-full">
            <LogIn className="w-4 h-4 mr-2" />
            Ingresar
          </Button>
        </form>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="code">Código de Validación (6 dígitos)</Label>
          {/* GET directo para no generar POST/303 adicionales */}
          <form method="GET" action="/admin/validate">
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
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
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
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
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
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
   Página (SSR c/ searchParams async)
====================== */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Auth
  const cookie = (await cookies()).get("admin_validate_auth");
  const allowed = cookie?.value === "ok";

  // Next 15: searchParams es async
  const sp = await searchParams;
  const errorKey = typeof sp?.error === "string" ? sp.error : undefined;

  if (!allowed) {
    return <LoginGate errorKey={errorKey} />;
  }

  // Header
  const codeParam = typeof sp?.code === "string" ? sp.code.trim() : "";
  const validCode = /^\d{6}$/.test(codeParam) ? codeParam : "";

  // Si hay code en URL, validamos en servidor (con tus helpers)
  let ui: { ticket?: UiTicket; error?: string } | null = null;
  if (validCode) {
    ui = await runValidationFlow(validCode);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-primary/5 to-secondary/5 py-12 px-4">
      <div className="container mx-auto max-w-2xl">
        {/* Header + Logout */}
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

        <form action={logoutAction} className="mb-6">
          <Button variant="outline" className="w-full sm:w-auto">
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar sesión
          </Button>
        </form>

        {/* Contenido principal */}
        {!validCode && !errorKey && <EmptyState />}

        {errorKey === "badcode" && (
          <ErrorCard message="Ingresá un código de 6 dígitos." />
        )}
        {errorKey === "env" && (
          <ErrorCard message="Falta configurar ADMIN_VALIDATE_PASS en .env.local." />
        )}

        {validCode && ui && ui.error && <ErrorCard message={ui.error} />}
        {validCode && ui && ui.ticket && <TicketCard t={ui.ticket} />}
      </div>
    </div>
  );
}
