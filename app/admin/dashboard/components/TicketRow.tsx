"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AdminTicket, TicketsConfig } from "../types";
import { makeQrDataUrl } from "../utils/qr";
import RowActionsMenu from "./RowActionsMenu";
import {
  CheckCircle,
  Clock,
  Crown,
  Edit,
  Mail,
  MapPin,
  Ticket,
  Trash2,
  XCircle,
  RotateCw,
  AlertTriangle,
  Undo2,
  ShieldAlert,
} from "lucide-react";

/* ========================= Utiles ========================= */

type PaymentStatusStrict =
  | "approved"
  | "rejected"
  | "pending"
  | "in_process"
  | "failed_preference"
  | "cancelled"
  | "refunded"
  | "charged_back";

type PaymentStatusFilter = "all" | PaymentStatusStrict;

function shortQr(qr: unknown): string {
  if (typeof qr === "string") return qr.length > 8 ? qr.slice(-8) : qr;
  if (typeof qr === "number") return String(qr);
  return "—";
}

const STATUS_LABEL: Record<PaymentStatusStrict, string> = {
  approved: "approved",
  rejected: "rejected",
  pending: "pending",
  in_process: "in process",
  failed_preference: "failed preference",
  cancelled: "cancelled",
  refunded: "refunded",
  charged_back: "charged back",
};
const STATUS_ICON: Record<PaymentStatusStrict, ReactNode> = {
  approved: <CheckCircle className="w-3.5 h-3.5 mr-1.5" />,
  rejected: <XCircle className="w-3.5 h-3.5 mr-1.5" />,
  pending: <Clock className="w-3.5 h-3.5 mr-1.5" />,
  in_process: <RotateCw className="w-3.5 h-3.5 mr-1.5" />,
  failed_preference: <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />,
  cancelled: <XCircle className="w-3.5 h-3.5 mr-1.5" />,
  refunded: <Undo2 className="w-3.5 h-3.5 mr-1.5" />,
  charged_back: <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />,
};
const STATUS_STYLE: Record<PaymentStatusStrict, string> = {
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
  pending: "bg-amber-100 text-amber-700",
  in_process: "bg-blue-100 text-blue-700",
  failed_preference: "bg-orange-100 text-orange-700",
  cancelled: "bg-gray-100 text-gray-700",
  refunded: "bg-purple-100 text-purple-700",
  charged_back: "bg-red-100 text-red-700",
};

/* ========= Rangos por sector (usa start/end; fallback suma limits en orden) ========= */

function resolveSectorStartEnd(
  vipRanges: TicketsConfig["vipTables"],
  location: AdminTicket["tableLocation"] | null | undefined
): { start: number; end: number } | null {
  if (!location || !Array.isArray(vipRanges) || vipRanges.length === 0)
    return null;

  // Si el backend ya mandó start/end, usarlos
  const found: any = vipRanges.find((r) => r?.location === location);
  const s = Number(found?.startNumber);
  const e = Number(found?.endNumber);
  if (Number.isFinite(s) && Number.isFinite(e)) return { start: s, end: e };

  // Fallback: calcular por acumulación en el orden recibido
  let offset = 0;
  for (const r of vipRanges as any[]) {
    const lim = Number(r?.limit ?? 0) || 0;
    if (r?.location === location) {
      if (lim > 0) return { start: offset + 1, end: offset + lim };
      return null;
    }
    offset += lim;
  }
  return null;
}

/* ========= Números globales (preferir del backend, si no convertir local→global) ========= */

function getVipGlobalNumbers(
  ticket: any,
  vipRanges: TicketsConfig["vipTables"]
): number[] {
  // 1) Preferir los globales si existen
  const numsGlobal: number[] =
    Array.isArray(ticket?.tableNumbersGlobal) &&
    ticket.tableNumbersGlobal.length
      ? ticket.tableNumbersGlobal.map(Number).filter(Number.isFinite)
      : Number.isFinite(Number(ticket?.tableNumberGlobal))
        ? [Number(ticket.tableNumberGlobal)]
        : [];

  if (numsGlobal.length) return numsGlobal.slice().sort((a, b) => a - b);

  // 2) Tomar los locales (o legacy) y convertir
  const numsLocal: number[] =
    Array.isArray(ticket?.tableNumbersLocal) && ticket.tableNumbersLocal.length
      ? ticket.tableNumbersLocal.map(Number).filter(Number.isFinite)
      : Number.isFinite(Number(ticket?.tableNumberLocal))
        ? [Number(ticket.tableNumberLocal)]
        : Array.isArray(ticket?.tableNumbers) && ticket.tableNumbers.length
          ? ticket.tableNumbers.map(Number).filter(Number.isFinite)
          : Number.isFinite(Number(ticket?.tableNumber))
            ? [Number(ticket.tableNumber)]
            : [];

  if (!numsLocal.length) return [];

  const loc = ticket?.tableLocation ?? null;
  const sector = resolveSectorStartEnd(vipRanges, loc);
  if (!sector) return numsLocal.slice().sort((a, b) => a - b); // sin rango, mostrar como vienen

  const start = sector.start;
  return numsLocal
    .map((n: number) => start + (Number(n) - 1))
    .sort((a, b) => a - b);
}

/* ========================= Componente ========================= */

export default function TicketRow({
  ticket,
  onApprove,
  onEdit,
  onDelete,
  onShowQr,
  onSendEmail,
  sending = false,
  vipRanges,
  statusFilter = "all",
}: {
  ticket: AdminTicket;
  onApprove: (t: AdminTicket) => void;
  onEdit: (t: AdminTicket) => void;
  onDelete: (id: string) => void;
  onShowQr: (code: string) => void;
  onSendEmail: (t: AdminTicket) => void;
  sending?: boolean;
  vipRanges: TicketsConfig["vipTables"];
  statusFilter?: PaymentStatusFilter;
}) {
  const [qrSrc, setQrSrc] = useState<string | null>(null);

  const globalNumbers = useMemo(
    () => getVipGlobalNumbers(ticket as any, vipRanges),
    [ticket, vipRanges]
  );

  // Locales para el tooltip (si tenemos rango, los recalculamos desde global)
  const localNumbers = useMemo(() => {
    const loc = (ticket as any)?.tableLocation ?? null;
    const sector = resolveSectorStartEnd(vipRanges, loc);
    if (!sector || !globalNumbers.length) {
      // Fallback: si ya vienen locales del backend
      const locals: number[] =
        Array.isArray((ticket as any)?.tableNumbersLocal) &&
        (ticket as any).tableNumbersLocal.length
          ? (ticket as any).tableNumbersLocal
              .map(Number)
              .filter(Number.isFinite)
          : Number.isFinite(Number((ticket as any)?.tableNumberLocal))
            ? [Number((ticket as any).tableNumberLocal)]
            : [];
      return locals.slice().sort((a, b) => a - b);
    }
    const start = sector.start;
    return globalNumbers.map((g) => g - (start - 1)).sort((a, b) => a - b);
  }, [ticket, vipRanges, globalNumbers]);

  // QR mini
  useEffect(() => {
    let active = true;
    (async () => {
      const code = (ticket as any)?.validationCode;
      if (!code || typeof code !== "string") {
        if (active) setQrSrc(null);
        return;
      }
      try {
        const dataUrl = await makeQrDataUrl(code, 4);
        if (active) setQrSrc(dataUrl);
      } catch {
        if (active) setQrSrc(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [ticket]);

  const rowDim =
    statusFilter !== "all" &&
    (ticket?.paymentStatus as any) &&
    (ticket?.paymentStatus as any) !== statusFilter
      ? "opacity-60"
      : "";

  const totalPriceNumber = Number(ticket?.totalPrice ?? 0) || 0;
  const ps = (ticket?.paymentStatus || undefined) as
    | PaymentStatusStrict
    | undefined;

  return (
    <tr
      className={`border-b border-border/50 hover:bg-gray/50 transition-colors ${rowDim}`}
    >
      {/* Cliente */}
      <td className="p-4 min-w-[180px]">
        <div className="space-y-1">
          <p className="font-semibold">{ticket?.customerName ?? "—"}</p>
          <p className="text-sm text-muted-foreground">
            {ticket?.customerEmail ?? "—"}
          </p>
        </div>
      </td>

      {/* DNI */}
      <td className="p-4">
        <span className="text-sm font-mono text-muted-foreground">
          {ticket?.customerDni ?? "—"}
        </span>
      </td>

      {/* Tipo + ubicación VIP */}
      <td className="p-4">
        <div className="flex items-center gap-2">
          {ticket?.ticketType === "vip" ? (
            <Crown className="w-4 h-4 text-amber-500" />
          ) : (
            <Ticket className="w-4 h-4 text-blue-500" />
          )}
          <span className="capitalize font-medium text-sm">
            {ticket?.ticketType ?? "—"}
          </span>
          {ticket?.ticketType === "vip" && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-amber-400/50 text-amber-700 bg-amber-50">
              <MapPin className="w-3 h-3" />{" "}
              {(ticket as any)?.tableLocation ?? "—"}
            </span>
          )}
        </div>
      </td>

      {/* Mesa(s) */}
      <td className="p-4">
        {ticket?.ticketType === "vip" ? (
          globalNumbers.length ? (
            <span
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-purple-400/50 text-purple-700 bg-purple-50"
              title={
                localNumbers.length
                  ? `Local: #${localNumbers.join(", ")}`
                  : undefined
              }
            >
              #{globalNumbers.join(", ")}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </td>

      {/* Género */}
      <td className="p-4">
        <span className="capitalize text-sm text-muted-foreground">
          {ticket?.gender ?? "—"}
        </span>
      </td>

      {/* Precio */}
      <td className="p-4">
        <span className="font-semibold">
          ${totalPriceNumber.toLocaleString("es-AR")}
        </span>
      </td>

      {/* Método de pago */}
      <td className="p-4">
        <span className="capitalize text-sm text-muted-foreground">
          {ticket?.paymentMethod ?? "—"}
        </span>
      </td>

      {/* Estado */}
      <td className="p-4">
        {ps ? (
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[ps]} ${
              statusFilter !== "all" && ps === statusFilter
                ? "ring-2 ring-offset-1 ring-black/10"
                : ""
            }`}
            title={STATUS_LABEL[ps]}
          >
            {STATUS_ICON[ps]}
            {STATUS_LABEL[ps]}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </td>

      {/* Código / QR */}
      <td className="p-4">
        <div className="flex items-center gap-3">
          <code className="text-xs bg-muted/60 px-2.5 py-1.5 rounded-md font-mono border border-border/50">
            {(ticket as any)?.validationCode
              ? (ticket as any).validationCode
              : shortQr((ticket as any)?.qrCode)}
          </code>

          {(ticket as any)?.validationCode && qrSrc && (
            <button
              type="button"
              onClick={() =>
                (ticket as any)?.validationCode &&
                onShowQr((ticket as any).validationCode)
              }
              title="Ver QR en grande"
              className="shrink-0 hover:scale-105 transition-transform"
            >
              <img
                src={qrSrc || "/placeholder.svg"}
                alt="QR"
                width={40}
                height={40}
                className="rounded-md border-2 border-border shadow-sm hover:shadow-md transition-shadow"
              />
            </button>
          )}
        </div>
      </td>

      {/* Acciones */}
      <td className="p-4 text-right">
        <div className="hidden sm:flex items-center justify-end gap-2">
          {ticket?.paymentStatus === "pending" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onApprove(ticket)}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              title="Aprobar"
            >
              <RotateCw className="w-4 h-4 mr-1.5" />
              Aprobar
            </Button>
          )}

          {ticket?.paymentStatus === "approved" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSendEmail(ticket)}
              disabled={sending}
              className="border-border/50"
              title="Enviar email de confirmación"
            >
              <Mail className="w-4 h-4 mr-1.5" />
              {sending ? "Enviando…" : "Enviar mail"}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(ticket)}
            className="hover:bg-blue-50"
            title="Editar"
          >
            <Edit className="w-4 h-4 text-blue-600" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(ticket.id)}
            className="hover:bg-red-50"
            title="Eliminar"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </Button>
        </div>

        <div className="sm:hidden flex justify-end">
          <RowActionsMenu
            onApprove={() => onApprove(ticket)}
            onSendEmail={() => onSendEmail(ticket)}
            onEdit={() => onEdit(ticket)}
            onDelete={() => onDelete(ticket.id)}
            canApprove={ticket?.paymentStatus === "pending"}
            canEmail={ticket?.paymentStatus === "approved"}
            sending={!!sending}
          />
        </div>
      </td>
    </tr>
  );
}
