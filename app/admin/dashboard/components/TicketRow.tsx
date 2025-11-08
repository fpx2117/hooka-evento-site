"use client";

import { useEffect, useState } from "react";
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
import { JSX } from "react/jsx-runtime";

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

interface StatusInfo {
  label: string;
  icon: JSX.Element;
  style: string;
}

const STATUS: Record<PaymentStatusStrict, StatusInfo> = {
  approved: { label: "Aprobado", icon: <CheckCircle className="w-3.5 h-3.5 mr-1.5" />, style: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rechazado", icon: <XCircle className="w-3.5 h-3.5 mr-1.5" />, style: "bg-rose-100 text-rose-700" },
  pending: { label: "Pendiente", icon: <Clock className="w-3.5 h-3.5 mr-1.5" />, style: "bg-amber-100 text-amber-700" },
  in_process: { label: "En proceso", icon: <RotateCw className="w-3.5 h-3.5 mr-1.5" />, style: "bg-blue-100 text-blue-700" },
  failed_preference: { label: "Error de preferencia", icon: <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />, style: "bg-orange-100 text-orange-700" },
  cancelled: { label: "Cancelado", icon: <XCircle className="w-3.5 h-3.5 mr-1.5" />, style: "bg-gray-100 text-gray-700" },
  refunded: { label: "Reembolsado", icon: <Undo2 className="w-3.5 h-3.5 mr-1.5" />, style: "bg-purple-100 text-purple-700" },
  charged_back: { label: "Contracargo", icon: <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />, style: "bg-red-100 text-red-700" },
};

const shortQr = (qr?: string | null) => (qr ? (qr.length > 8 ? qr.slice(-8) : qr) : "—");

export default function TicketRow({
  ticket,
  onApprove,
  onEdit,
  onDelete,
  onShowQr,
  onSendEmail,
  sending = false,
  vipRanges,         // no usado aquí, pero se mantiene para compatibilidad
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

  const ps = ticket.paymentStatus as PaymentStatusStrict | undefined;
  const rowDim = statusFilter !== "all" && ps && ps !== statusFilter ? "opacity-60" : "";
  const total = Number(ticket.totalPrice ?? 0);

  // QR mini desde validationCode o qrCode
  useEffect(() => {
    let active = true;
    (async () => {
      const code = ticket.validationCode || ticket.qrCode;
      if (!code) return setQrSrc(null);
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
  }, [ticket.validationCode, ticket.qrCode]);

  return (
    <tr className={`border-b border-border/50 hover:bg-muted/40 transition-colors ${rowDim}`}>
      {/* Cliente */}
      <td className="p-3 md:p-4 min-w-[160px]">
        <div className="space-y-1">
          <p className="font-semibold text-sm md:text-base truncate">{ticket.customerName || "—"}</p>
          <p className="text-xs md:text-sm text-muted-foreground truncate">{ticket.customerEmail || "—"}</p>
        </div>
      </td>

      {/* DNI */}
      <td className="p-3 md:p-4 text-sm font-mono text-muted-foreground">{ticket.customerDni || "—"}</td>

      {/* Tipo (solo tipo) */}
      <td className="p-3 md:p-4">
        <div className="flex items-center gap-1.5">
          {ticket.ticketType === "vip" ? (
            <Crown className="w-4 h-4 text-amber-500" />
          ) : (
            <Ticket className="w-4 h-4 text-blue-500" />
          )}
          <span className="capitalize font-medium text-sm">{ticket.ticketType}</span>
        </div>
      </td>

      {/* Mesa */}
<td className="p-3 md:p-4 text-sm">
  {ticket.ticketType === "vip" ? (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-purple-400/50 text-purple-700 bg-purple-50">
      Mesa #
      {ticket.vipTableNumber && Number(ticket.vipTableNumber) > 0
        ? ticket.vipTableNumber
        : ticket.vipTable?.tableNumber
        ? ticket.vipTable.tableNumber
        : "—"}
    </span>
  ) : (
    <span className="text-muted-foreground">—</span>
  )}
</td>

      {/* Ubicación (celda separada para alinear con el thead) */}
      <td className="p-3 md:p-4 text-sm">
        {ticket.ticketType === "vip" ? (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-amber-300/50 text-amber-700 bg-amber-50 whitespace-nowrap">
            <MapPin className="w-3 h-3" />
            {ticket.vipLocationName ?? (ticket.vipLocationId ? `${ticket.vipLocationId.slice(0, 6)}…` : "—")}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* Género */}
      <td className="p-3 md:p-4 text-sm capitalize text-muted-foreground">
        {ticket.gender ?? "—"}
      </td>

      {/* Precio */}
      <td className="p-3 md:p-4 font-semibold text-sm">
        ${total.toLocaleString("es-AR")}
      </td>

      {/* Método de pago */}
      <td className="p-3 md:p-4 text-sm capitalize text-muted-foreground">
        {ticket.paymentMethod ?? "—"}
      </td>

      {/* Estado */}
      <td className="p-3 md:p-4">
        {ps ? (
          <span className={`inline-flex items-center px-2 md:px-3 py-1 rounded-full text-xs font-medium ${STATUS[ps].style}`}>
            {STATUS[ps].icon}
            {STATUS[ps].label}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </td>

      {/* Código (y QR mini) */}
      <td className="p-3 md:p-4">
        <div className="flex items-center gap-3">
          <code className="text-xs bg-muted/60 px-2 py-1.5 rounded-md font-mono border border-border/50 truncate">
            {ticket.validationCode ? ticket.validationCode : shortQr(ticket.qrCode)}
          </code>

          {qrSrc && (
            <button
              type="button"
              onClick={() => {
                const code = ticket.validationCode ?? ticket.qrCode;
                if (code) onShowQr(code);
              }}
              className="hover:scale-105 transition-transform"
              title="Ver QR"
            >
              <img
                src={qrSrc}
                alt="QR"
                width={36}
                height={36}
                className="rounded border border-border shadow-sm hover:shadow-md"
              />
            </button>
          )}
        </div>
      </td>

      {/* Acciones */}
      <td className="p-3 md:p-4 text-right whitespace-nowrap">
        <div className="hidden sm:flex items-center justify-end gap-2 flex-wrap">
          {ps === "pending" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onApprove(ticket)}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              <RotateCw className="w-4 h-4 mr-1.5" />
              Aprobar
            </Button>
          )}

          {ps === "approved" && (
            <Button variant="outline" size="sm" onClick={() => onSendEmail(ticket)} disabled={sending}>
              <Mail className="w-4 h-4 mr-1.5" />
              {sending ? "Enviando…" : "Enviar mail"}
            </Button>
          )}

          <Button variant="ghost" size="sm" onClick={() => onEdit(ticket)} className="hover:bg-blue-50">
            <Edit className="w-4 h-4 text-blue-600" />
          </Button>

          <Button variant="ghost" size="sm" onClick={() => onDelete(ticket.id)} className="hover:bg-red-50">
            <Trash2 className="w-4 h-4 text-red-600" />
          </Button>
        </div>

        <div className="sm:hidden flex justify-end">
          <RowActionsMenu
            onApprove={() => onApprove(ticket)}
            onSendEmail={() => onSendEmail(ticket)}
            onEdit={() => onEdit(ticket)}
            onDelete={() => onDelete(ticket.id)}
            canApprove={ps === "pending"}
            canEmail={ps === "approved"}
            sending={sending}
          />
        </div>
      </td>
    </tr>
  );
}
