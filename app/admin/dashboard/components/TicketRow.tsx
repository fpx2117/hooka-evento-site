"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { AdminTicket, TicketsConfig } from "../types";
import { makeQrDataUrl } from "../utils/qr";
import RowActionsMenu from "./RowActionsMenu";
import {
  CheckCircle,
  Crown,
  Edit,
  Mail,
  MapPin,
  Ticket as TicketIcon,
  Trash2,
} from "lucide-react";

/* =========================
   Estilos / Prefijos por estado
========================= */
const STATUS_STYLES: Record<AdminTicket["paymentStatus"], string> = {
  approved: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  in_process: "bg-blue-100 text-blue-700",
  rejected: "bg-rose-100 text-rose-700",
  failed_preference: "bg-stone-100 text-stone-700",
  cancelled: "bg-orange-100 text-orange-700",
  refunded: "bg-purple-100 text-purple-800",
  charged_back: "bg-red-100 text-red-700",
};

const STATUS_PREFIX: Partial<Record<AdminTicket["paymentStatus"], string>> = {
  approved: "✓ ",
  rejected: "✕ ",
  pending: "⏱ ",
  in_process: "⏳ ",
  cancelled: "⛔ ",
  refunded: "↩︎ ",
  charged_back: "⟲ ",
};

/* =========================
   Componente
========================= */
export default function TicketRow({
  ticket,
  onApprove,
  onEdit,
  onDelete,
  onShowQr,
  onSendEmail,
  sending = false,
  vipRanges,
}: {
  ticket: AdminTicket;
  onApprove: (t: AdminTicket) => void;
  onEdit: (t: AdminTicket) => void;
  onDelete: (id: string) => void;
  onShowQr: (code: string) => void;
  onSendEmail: (t: AdminTicket) => void;
  sending?: boolean;
  vipRanges: TicketsConfig["vipTables"];
}) {
  const [qrSrc, setQrSrc] = useState<string | null>(null);

  // Numeración local → global según rangos
  const displayNumbers: number[] = useMemo(() => {
    const loc = ticket.tableLocation || undefined;
    const nums =
      ticket.tableNumbers && ticket.tableNumbers.length > 0
        ? ticket.tableNumbers
        : ticket.tableNumber != null
          ? [ticket.tableNumber]
          : [];
    if (!nums.length || !loc) return nums;

    const sector = vipRanges.find((v) => v.location === loc);
    if (!sector) return nums;

    const start = Number.isFinite(sector.startNumber as any)
      ? Number(sector.startNumber)
      : null;
    const end = Number.isFinite(sector.endNumber as any)
      ? Number(sector.endNumber)
      : null;

    if (start == null || end == null) return nums;

    const span = end - start + 1;
    return nums.map((n) => {
      if (n >= start && n <= end) return n;
      if (n >= 1 && n <= span) return n + (start - 1);
      return n;
    });
  }, [
    ticket.tableLocation,
    ticket.tableNumber,
    ticket.tableNumbers,
    vipRanges,
  ]);

  // Generar QR preview
  useEffect(() => {
    let active = true;
    (async () => {
      if (!ticket.validationCode) return setQrSrc(null);
      try {
        const dataUrl = await makeQrDataUrl(ticket.validationCode, 4);
        if (active) setQrSrc(dataUrl);
      } catch {
        if (active) setQrSrc(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [ticket.validationCode]);

  // Permitir aprobar solo estados coherentes
  const canApprove =
    ticket.paymentStatus === "pending" ||
    ticket.paymentStatus === "in_process" ||
    ticket.paymentStatus === "failed_preference";

  const approveBtn = (
    <Button
      variant="default"
      size="sm"
      onClick={() => onApprove(ticket)}
      className="bg-emerald-600 hover:bg-emerald-700 text-white"
    >
      <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Aprobar
    </Button>
  );

  const sendBtn = (
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
  );

  // Marcar "vencido" si pending y ya expiró (requiere ticket.expiresAt)
  const isExpiredPending =
    ticket.paymentStatus === "pending" &&
    !!ticket.expiresAt &&
    new Date(ticket.expiresAt) < new Date();

  return (
    <tr className="border-b border-border/50 hover:bg-gray/50 transition-colors">
      <td className="p-4 min-w-[180px]">
        <div className="space-y-1">
          <p className="font-semibold">{ticket.customerName}</p>
          <p className="text-sm text-muted-foreground">
            {ticket.customerEmail}
          </p>
        </div>
      </td>

      <td className="p-4">
        <span className="text-sm font-mono text-muted-foreground">
          {ticket.customerDni || "—"}
        </span>
      </td>

      <td className="p-4">
        <div className="flex items-center gap-2">
          {ticket.ticketType === "vip" ? (
            <Crown className="w-4 h-4 text-amber-500" />
          ) : (
            <TicketIcon className="w-4 h-4 text-blue-500" />
          )}
          <span className="capitalize font-medium text-sm">
            {ticket.ticketType}
          </span>
          {ticket.ticketType === "vip" && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-amber-400/50 text-amber-700 bg-amber-50">
              <MapPin className="w-3 h-3" />
              {(ticket.tableLocation || "—").toString()}
            </span>
          )}
        </div>
      </td>

      <td className="p-4">
        {ticket.ticketType === "vip" ? (
          displayNumbers.length > 0 ? (
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

      <td className="p-4">
        <span className="capitalize text-sm text-muted-foreground">
          {ticket.gender || "—"}
        </span>
      </td>

      <td className="p-4">
        <span className="font-semibold">
          ${(Number(ticket.totalPrice) || 0).toLocaleString("es-AR")}
        </span>
      </td>

      <td className="p-4">
        <span className="capitalize text-sm text-muted-foreground">
          {ticket.paymentMethod}
        </span>
      </td>

      <td className="p-4">
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[ticket.paymentStatus]}`}
          title={ticket.paymentStatus}
        >
          {STATUS_PREFIX[ticket.paymentStatus] || ""}
          {ticket.paymentStatus}
        </span>
        {isExpiredPending && (
          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
            vencido
          </span>
        )}
      </td>

      <td className="p-4">
        <div className="flex items-center gap-3">
          <code className="text-xs bg-muted/60 px-2.5 py-1.5 rounded-md font-mono border border-border/50">
            {ticket.validationCode
              ? ticket.validationCode
              : ticket.qrCode
                ? ticket.qrCode.slice(-8)
                : "—"}
          </code>
          {ticket.validationCode && qrSrc && (
            <button
              type="button"
              onClick={() => onShowQr(ticket.validationCode!)}
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

      <td className="p-4 text-right">
        <div className="hidden sm:flex items-center justify-end gap-2">
          {canApprove && approveBtn}
          {ticket.paymentStatus === "approved" && sendBtn}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(ticket)}
            className="hover:bg-blue-50"
          >
            <Edit className="w-4 h-4 text-blue-600" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(ticket.id)}
            className="hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </Button>
        </div>

        {/* Mobile: menú contextual */}
        <div className="sm:hidden flex justify-end">
          <RowActionsMenu
            onApprove={() => onApprove(ticket)}
            onSendEmail={() => onSendEmail(ticket)}
            onEdit={() => onEdit(ticket)}
            onDelete={() => onDelete(ticket.id)}
            canApprove={canApprove}
            canEmail={ticket.paymentStatus === "approved"}
            sending={!!sending}
          />
        </div>
      </td>
    </tr>
  );
}
