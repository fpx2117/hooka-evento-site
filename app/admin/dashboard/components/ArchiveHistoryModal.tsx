"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  RotateCcw,
  History,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

/* ===== Tipos (alineados a tu API) ===== */
export type ArchiveReason =
  | "user_deleted"
  | "admin_cancelled"
  | "payment_timeout"
  | "refunded"
  | "charged_back"
  | "other";

export type PaymentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "in_process"
  | "failed_preference"
  | "cancelled"
  | "refunded"
  | "charged_back";

export type TicketType = "general" | "vip";
export type TableLocation = "piscina" | "dj" | "general";

export interface ArchiveTicket {
  id: string;
  archivedAt: string;
  archivedBy?: string | null;
  archiveReason: ArchiveReason;
  customerName: string;
  customerEmail: string;
  customerDni: string;
  ticketType: TicketType;
  paymentStatus: PaymentStatus;
  totalPrice: string; // Decimal serializado
  vipLocation?: TableLocation | null;
  tableNumber?: number | null;
  eventId?: string | null; // <-- lo hacemos tolerante
  purchaseDate?: string | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface ArchiveApiResponse {
  ok: boolean;
  pagination: Pagination;
  tickets: ArchiveTicket[];
}

/* ===== Sentinela para Select ===== */
const ALL = "all";

/* ===== Utils ===== */
const reasonLabel: Record<ArchiveReason, string> = {
  user_deleted: "Eliminado por usuario",
  admin_cancelled: "Cancelado por admin",
  payment_timeout: "Timeout de pago",
  refunded: "Reintegrado",
  charged_back: "Chargeback",
  other: "Otro",
};

const statusHue: Record<PaymentStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  in_process: "bg-blue-100 text-blue-800",
  failed_preference: "bg-stone-100 text-stone-800",
  cancelled: "bg-orange-100 text-orange-800",
  refunded: "bg-purple-100 text-purple-800",
  charged_back: "bg-red-100 text-red-800",
};

function formatDate(d?: string | null) {
  if (!d) return "-";
  const date = new Date(d);
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function currencyAr(value: string | number) {
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "-";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  }).format(n);
}

function useDebounce<T>(value: T, delay = 500) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** ✅ Evita errores de `slice` si eventId viene null/undefined/no-string */
function safeSliceId(id: unknown, len = 8) {
  if (id == null) return "—";
  try {
    const s = String(id);
    return s.length > len ? `${s.slice(0, len)}…` : s;
  } catch {
    return "—";
  }
}

/* ===== Componente principal ===== */
export default function ArchiveHistoryModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState<string>(ALL);
  const [type, setType] = useState<string>(ALL);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ArchiveTicket[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const allSelected = useMemo(
    () => rows.length > 0 && rows.every((r) => selected[r.id]),
    [rows, selected]
  );

  const debouncedQ = useDebounce(query, 400);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      if (reason !== ALL) params.set("reason", reason);
      if (type !== ALL) params.set("type", type);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const res = await fetch(
        `/api/admin/tickets/archive?${params.toString()}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ArchiveApiResponse = await res.json();
      setRows(Array.isArray(data?.tickets) ? data.tickets : []);
      setPagination(
        data?.pagination || { page: 1, pageSize, total: 0, totalPages: 1 }
      );
      setSelected({});
    } catch (e: any) {
      setError(e?.message || "Error cargando historial");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, reason, type, page, pageSize]);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  // Reset filtros al cerrar
  useEffect(() => {
    if (!open) {
      setQuery("");
      setReason(ALL);
      setType(ALL);
      setPage(1);
      setSelected({});
    }
  }, [open]);

  const toggleAll = () => {
    if (allSelected) return setSelected({});
    const next: Record<string, boolean> = {};
    rows.forEach((r) => (next[r.id] = true));
    setSelected(next);
  };

  const toggleOne = (id: string) =>
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));

  const selectedIds = useMemo(
    () =>
      Object.entries(selected)
        .filter(([, v]) => v)
        .map(([k]) => k),
    [selected]
  );

  const restoreSelected = async () => {
    if (selectedIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tickets/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedIds,
          regenerateCodes: true,
          forcePaymentIdNull: false,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${res.status}`);
      }
      await fetchData();
    } catch (e: any) {
      setError(e?.message || "No se pudo restaurar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Fullscreen en mobile, hoja en desktop */}
      <DialogContent className="p-0 overflow-hidden w-[100vw] h-[100vh] max-w-[100vw] sm:w-auto sm:h-auto sm:max-w-6xl sm:rounded-2xl">
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-2 border-b">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5" />
            <DialogTitle className="text-base sm:text-lg">
              Historial de Tickets Archivados
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs sm:text-sm">
            Consulta, filtra y restaura registros del archivo. Estos tickets no
            cuentan para el dashboard.
          </DialogDescription>
        </DialogHeader>

        {/* Filtros */}
        <div className="px-4 sm:px-6 py-3 border-b grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3">
          <div className="sm:col-span-5">
            <Input
              placeholder="Buscar por nombre, email o DNI"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-9"
            />
          </div>
          <div className="sm:col-span-3">
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="w-full h-9">
                <SelectValue placeholder="Motivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos los motivos</SelectItem>
                <SelectItem value="admin_cancelled">
                  Cancelado por admin
                </SelectItem>
                <SelectItem value="user_deleted">
                  Eliminado por usuario
                </SelectItem>
                <SelectItem value="payment_timeout">Timeout de pago</SelectItem>
                <SelectItem value="refunded">Reintegrado</SelectItem>
                <SelectItem value="charged_back">Chargeback</SelectItem>
                <SelectItem value="other">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-full h-9">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="vip">VIP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 flex items-stretch sm:items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-full sm:w-auto"
              onClick={() => {
                setPage(1);
                fetchData();
              }}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Actualizar
            </Button>
          </div>
        </div>

        {/* Acciones */}
        <div className="px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs sm:text-sm text-muted-foreground">
            {pagination.total.toLocaleString()} registros • Página{" "}
            {pagination.page} / {pagination.totalPages}
          </div>
          <div className="flex items-stretch sm:items-center gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 por pág.</SelectItem>
                <SelectItem value="20">20 por pág.</SelectItem>
                <SelectItem value="50">50 por pág.</SelectItem>
                <SelectItem value="100">100 por pág.</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-9 w-full sm:w-auto"
              variant={selectedIds.length ? "default" : "secondary"}
              disabled={!selectedIds.length || loading}
              onClick={restoreSelected}
            >
              <RotateCcw className="h-4 w-4 mr-1" /> Restaurar (
              {selectedIds.length})
            </Button>
          </div>
        </div>

        {/* Desktop: tabla | Mobile: tarjetas */}
        <div className="px-4 sm:px-6 pb-2 overflow-auto">
          {/* DESKTOP */}
          <div className="hidden sm:block">
            <div className="min-w-[960px] border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-3 w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleAll}
                      />
                    </th>
                    <th className="p-3">Archivado</th>
                    <th className="p-3">Cliente</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">DNI</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">VIP</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Motivo</th>
                    <th className="p-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td
                        colSpan={10}
                        className="p-6 text-center text-muted-foreground"
                      >
                        Cargando…
                      </td>
                    </tr>
                  )}

                  {!loading && rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={10}
                        className="p-8 text-center text-muted-foreground"
                      >
                        Sin resultados
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    rows.map((r) => (
                      <tr key={r.id} className="border-t hover:bg-muted/30">
                        <td className="p-3 align-top">
                          <Checkbox
                            checked={!!selected[r.id]}
                            onCheckedChange={() => toggleOne(r.id)}
                          />
                        </td>
                        <td className="p-3 align-top">
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {formatDate(r.archivedAt)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Compra: {formatDate(r.purchaseDate)}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 align-top">
                          <div className="font-medium">{r.customerName}</div>
                          <div className="text-xs text-muted-foreground">
                            Evento: {safeSliceId(r.eventId, 8)}
                          </div>
                        </td>
                        <td className="p-3 align-top">{r.customerEmail}</td>
                        <td className="p-3 align-top">{r.customerDni}</td>
                        <td className="p-3 align-top">
                          <Badge variant="secondary">
                            {r.ticketType.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="p-3 align-top">
                          {r.ticketType === "vip" ? (
                            <div className="flex items-center gap-2 text-xs">
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 capitalize">
                                {r.vipLocation}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-slate-100">
                                Mesa #{r.tableNumber ?? "-"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 align-top">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusHue[r.paymentStatus]}`}
                          >
                            {r.paymentStatus}
                          </span>
                        </td>
                        <td className="p-3 align-top">
                          <span className="text-xs whitespace-nowrap">
                            {reasonLabel[r.archiveReason]}
                          </span>
                        </td>
                        <td className="p-3 align-top text-right font-medium">
                          {currencyAr(r.totalPrice)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* MOBILE: tarjetas compactas */}
          <div className="sm:hidden space-y-2">
            {loading && (
              <div className="p-4 text-center text-muted-foreground">
                Cargando…
              </div>
            )}
            {!loading && rows.length === 0 && (
              <div className="p-6 text-center text-muted-foreground">
                Sin resultados
              </div>
            )}
            {!loading &&
              rows.map((r) => (
                <div
                  key={r.id}
                  className="border rounded-lg p-3 bg-white/60 backdrop-blur"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={!!selected[r.id]}
                        onCheckedChange={() => toggleOne(r.id)}
                      />
                      <div className="font-medium">{r.customerName}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">
                        {currencyAr(r.totalPrice)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {formatDate(r.archivedAt)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] text-muted-foreground">
                    <div>
                      <span className="font-medium text-foreground">
                        Email:
                      </span>{" "}
                      {r.customerEmail}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">DNI:</span>{" "}
                      {r.customerDni || "-"}
                    </div>
                    <div className="col-span-2 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{r.ticketType}</Badge>
                      {r.ticketType === "vip" ? (
                        <>
                          <span className="px-2 py-0.5 rounded-full bg-slate-100">
                            {r.vipLocation}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-slate-100">
                            Mesa #{r.tableNumber ?? "-"}
                          </span>
                        </>
                      ) : null}
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusHue[r.paymentStatus]}`}
                      >
                        {r.paymentStatus}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-xs">
                        {reasonLabel[r.archiveReason]}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 text-[11px] text-muted-foreground">
                    Compra: {formatDate(r.purchaseDate)} • Evento:{" "}
                    {safeSliceId(r.eventId, 8)}
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Paginación */}
        <div className="px-4 sm:px-6 py-3 border-t flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs sm:text-sm text-muted-foreground">
            {error ? <span className="text-rose-600">{error}</span> : ""}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPage(1);
                fetchData();
              }}
              disabled={page <= 1 || loading}
              className="h-8"
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Primera
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="h-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs sm:text-sm text-muted-foreground">
              {page} / {pagination.totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setPage((p) => Math.min(pagination.totalPages, p + 1))
              }
              disabled={page >= pagination.totalPages || loading}
              className="h-8"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPage(pagination.totalPages);
                fetchData();
              }}
              disabled={page >= pagination.totalPages || loading}
              className="h-8"
            >
              Última <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
