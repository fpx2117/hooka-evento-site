"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
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

/** Estado de pago estrictamente como viene del ticket (sin null/undefined) */
type PaymentStatusStrict = Exclude<
  AdminTicket["paymentStatus"],
  null | undefined
>;
/** Filtro que acepta 'all' además de los estados estrictos */
type PaymentStatusFilter = "all" | PaymentStatusStrict;

/** Helper: short code legible del QR */
function shortQr(qr: unknown): string {
  if (typeof qr === "string") return qr.length > 8 ? qr.slice(-8) : qr;
  if (typeof qr === "number") return String(qr);
  if (qr && typeof (qr as any).toString === "function")
    return (qr as any).toString();
  return "—";
}

/** (Opcional) listado de estados soportados, útil si querés iterar */
const ALL_STATUSES = [
  "approved",
  "rejected",
  "pending",
  "in_process",
  "failed_preference",
  "cancelled",
  "refunded",
  "charged_back",
] as const satisfies readonly PaymentStatusStrict[];

/** Etiqueta legible por estado (sin 'all') */
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

/** Icono por estado (sin 'all') */
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

/** Estilos por estado (sin 'all') */
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

export default function TicketRow({
  ticket,
  onApprove,
  onEdit,
  onDelete,
  onShowQr,
  onSendEmail,
  sending = false,
  vipRanges,
  /** opcional: filtro activo para resaltar/atenuar visualmente */
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

  /** Numeración local → global según rangos (con guards) */
  const displayNumbers: number[] = useMemo(() => {
    const loc = ticket?.tableLocation ?? undefined;
    const rawNums =
      Array.isArray(ticket?.tableNumbers) && ticket.tableNumbers.length > 0
        ? ticket.tableNumbers
        : Number.isFinite(ticket?.tableNumber as any)
          ? [Number(ticket!.tableNumber)]
          : [];

    if (!rawNums.length || !loc) return rawNums;

    const ranges = Array.isArray(vipRanges) ? vipRanges : [];
    const sector = ranges.find((v) => v.location === loc);
    if (!sector) return rawNums;

    const start =
      sector?.startNumber != null && Number.isFinite(sector.startNumber as any)
        ? Number(sector.startNumber)
        : null;
    const end =
      sector?.endNumber != null && Number.isFinite(sector.endNumber as any)
        ? Number(sector.endNumber)
        : null;

    if (start == null || end == null) return rawNums;

    const span = end - start + 1;
    return rawNums.map((n) => {
      const num = Number(n);
      if (!Number.isFinite(num)) return n as any;
      if (num >= start && num <= end) return num; // ya es global
      if (num >= 1 && num <= span) return num + (start - 1); // local → global
      return num;
    });
  }, [
    ticket.tableLocation,
    ticket.tableNumber,
    ticket.tableNumbers,
    vipRanges,
  ]);

  /** Generar mini QR (si hay validationCode) */
  useEffect(() => {
    let active = true;
    (async () => {
      const code = ticket?.validationCode;
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
  }, [ticket?.validationCode]);

  /** Visual: si hay filtro de estado activo y no coincide, atenuamos la fila */
  const rowDim =
    statusFilter !== "all" &&
    ticket?.paymentStatus &&
    ticket.paymentStatus !== statusFilter
      ? "opacity-60"
      : "";

  const totalPriceNumber = Number(ticket?.totalPrice ?? 0) || 0;
  const hasStatus = Boolean(ticket?.paymentStatus);

  // Cast seguro para usar los mapas solo cuando hay estado
  const ps = (hasStatus ? ticket.paymentStatus : undefined) as
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
              {(ticket?.tableLocation ?? "—").toString()}
            </span>
          )}
        </div>
      </td>

      {/* Mesa(s) */}
      <td className="p-4">
        {ticket?.ticketType === "vip" ? (
          (displayNumbers?.length ?? 0) > 0 ? (
            <span
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-purple-400/50 text-purple-700 bg-purple-50"
              title="Mesa(s)"
            >
              #{displayNumbers.join(", ")}
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
            {ticket?.validationCode
              ? ticket.validationCode
              : shortQr(ticket?.qrCode)}
          </code>

          {ticket?.validationCode && qrSrc && (
            <button
              type="button"
              onClick={() =>
                ticket?.validationCode && onShowQr(ticket.validationCode)
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
