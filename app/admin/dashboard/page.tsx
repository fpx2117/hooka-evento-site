"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DownloadCloud,
  QrCode,
  SlidersHorizontal,
  DollarSign,
  Ticket as TicketIcon,
  Crown,
  LogOut,
  Plus,
  History,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ExportModal } from "@/components/export-modal";
import DiscountsModal from "@/components/DiscountsModal";

import useIsMobile from "./hooks/useIsMobile";
import MobileHeaderActions from "./components/MobileHeaderActions";
import FiltersBar from "./components/FiltersBar";
import StatsCards from "./components/StatsCards";
import TicketRow from "./components/TicketRow";

import AddGeneralModal from "./modals/AddGeneralModal";
import AddVipModal from "./modals/AddVipModal";
import TablesModal from "./modals/TablesModal";
import EditTicketModal from "./modals/EditTicketModal";
import ConfigModal from "./modals/ConfigModal";
import QrModal from "./modals/QrModal";
import ArchiveHistoryModal from "./components/ArchiveHistoryModal";

import {
  AdminForm,
  AdminTicket,
  AddGeneralForm,
  AddVipForm,
  DiscountCfg,
  TableLocation,
  TicketsConfig,
  VipAvailability,
} from "./types";
import { applyDiscount, pickDiscountRule, range } from "./utils/discounts";

/* ============ Normalizador seguro ============ */
function normalizeTicket(raw: unknown): AdminTicket {
  const r = raw as Record<string, unknown>;

  // mesa única
  const singleRaw =
    r["tableNumber"] ??
    r["table_number"] ??
    r["vipTableNumber"] ??
    r["table"] ??
    r["mesa"] ??
    null;

  const single =
    typeof singleRaw === "number"
      ? singleRaw
      : typeof singleRaw === "string"
        ? Number.parseInt(singleRaw, 10) || null
        : null;

  // mesas múltiples
  const pluralRaw =
    r["tableNumbers"] ??
    r["table_numbers"] ??
    r["vipTables"] ??
    r["tables"] ??
    r["mesas"] ??
    null;

  const plural =
    Array.isArray(pluralRaw) && pluralRaw.length > 0
      ? (pluralRaw as unknown[])
          .map((n) => Number(n))
          .filter((n) => !Number.isNaN(n))
      : null;

  const id = String(
    r["id"] ??
      (r as any)["_id"] ??
      (typeof crypto !== "undefined" && (crypto as any).randomUUID
        ? (crypto as any).randomUUID()
        : `tmp_${Date.now()}`)
  );

  const ticketType = (r["ticketType"] ??
    r["type"] ??
    "general") as AdminTicket["ticketType"];
  const quantity = Number(r["quantity"] ?? 1) || 1;
  const totalPrice = Number(r["totalPrice"] ?? 0) || 0;

  const purchaseDate =
    (r["purchaseDate"] as string) ??
    (r["createdAt"] as string) ??
    new Date().toISOString();

  const customerName = (r["customerName"] as string) ?? "";
  const customerEmail = (r["customerEmail"] as string) ?? "";
  const customerPhone = (r["customerPhone"] as string) ?? "";
  const customerDni =
    (r["customerDni"] as string) ??
    (r["customerDNI"] as string) ??
    (r["customer_dni"] as string) ??
    (r["dni"] as string) ??
    "";

  const gender = (r["gender"] as AdminTicket["gender"]) ?? undefined;
  const paymentMethod =
    (r["paymentMethod"] as AdminTicket["paymentMethod"]) ?? "efectivo";
  const paymentStatus =
    (r["paymentStatus"] as AdminTicket["paymentStatus"]) ?? "pending";
  const validated = Boolean(r["validated"]);

  const qrCode = (r["qrCode"] as string) ?? (r["Code"] as string) ?? undefined;
  const validationCode = (r["validationCode"] as string) ?? undefined;

  // El GET del backend ya normaliza `tableLocation` a partir de `vipLocation`,
  // pero este fallback deja la UI robusta si algún cliente llama otra forma.
  const tableLocation =
    (r["tableLocation"] as AdminTicket["tableLocation"]) ??
    (r["location"] as AdminTicket["tableLocation"]) ??
    null;

  return {
    id,
    ticketType,
    quantity,
    totalPrice,
    purchaseDate,
    customerName,
    customerEmail,
    customerPhone,
    customerDni,
    gender,
    paymentMethod,
    paymentStatus,
    validated,
    qrCode,
    validationCode,
    tableLocation,
    tableNumber: single,
    tableNumbers:
      plural && plural.length > 0 ? plural : single != null ? [single] : null,
  };
}

/* =========================
   Página
========================= */
export default function AdminDashboard() {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [cfg, setCfg] = useState<TicketsConfig | null>(null);
  const [cfgLoading, setCfgLoading] = useState<boolean>(true);

  const [showExportModal, setShowExportModal] = useState<boolean>(false);

  // Mesas (picker)
  const [showTablesModal, setShowTablesModal] = useState<boolean>(false);
  const [availability, setAvailability] = useState<VipAvailability | null>(
    null
  );
  const [availableNumbers, setAvailableNumbers] = useState<number[]>([]);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [loadingAvail, setLoadingAvail] = useState<boolean>(false);
  const [availError, setAvailError] = useState<string | null>(null);

  const [discounts, setDiscounts] = useState<DiscountCfg[]>([]);
  const [showDiscountsModal, setShowDiscountsModal] = useState<boolean>(false);

  // Filtros (los mismos que tu UI)
  const [q, setQ] = useState<string>("");
  const [fStatus, setFStatus] = useState<
    "all" | "approved" | "pending" | "rejected"
  >("all");
  const [fType, setFType] = useState<"all" | "general" | "vip">("all");
  const [fGender, setFGender] = useState<"all" | "hombre" | "mujer">("all");
  const [fPay, setFPay] = useState<
    "all" | "efectivo" | "transferencia" | "mercadopago"
  >("all");
  const [orderBy, setOrderBy] = useState<"purchaseDate" | "totalPrice">(
    "purchaseDate"
  );
  const [order, setOrder] = useState<"desc" | "asc">("desc");

  // Modales
  const [showAddGeneral, setShowAddGeneral] = useState<boolean>(false);
  const [showAddVip, setShowAddVip] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [showArchiveModal, setShowArchiveModal] = useState<boolean>(false);

  const [editingTicket, setEditingTicket] = useState<AdminTicket | null>(null);

  // Formularios
  const [formGeneral, setFormGeneral] = useState<AddGeneralForm>({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerDni: "",
    gender: "hombre",
    paymentMethod: "efectivo",
    quantity: 1,
  });

  const [formVip, setFormVip] = useState<AddVipForm>({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerDni: "",
    paymentMethod: "efectivo",
    tableLocation: "dj",
  });

  const [editForm, setEditForm] = useState<AdminForm>({
    ticketType: "general",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerDni: "",
    gender: "hombre",
    paymentMethod: "efectivo",
    totalPrice: 0,
  });

  useEffect(() => {
    setSelectedTable(null);
  }, [formVip.tableLocation]);

  const [configForm, setConfigForm] = useState({
    totalLimitPersons: 0,
    genHPrice: 0,
    genMPrice: 0,
  });
  type VipTableFormRow = {
    location: TableLocation;
    price: number;
    stockLimit: number;
    capacityPerTable: number;
    startNumber?: number | null;
    endNumber?: number | null;
  };
  const [vipTablesForm, setVipTablesForm] = useState<VipTableFormRow[]>([
    { location: "dj", price: 0, stockLimit: 0, capacityPerTable: 10 },
    { location: "piscina", price: 0, stockLimit: 0, capacityPerTable: 10 },
  ]);

  const [qrModalOpen, setQrModalOpen] = useState<boolean>(false);
  const [qrModalCode, setQrModalCode] = useState<string | null>(null);

  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    fetchTickets();
    fetchConfig();
    fetchDiscounts();
    // “patear” el timeout de pendientes (parche si aún no tienes cron)
    fetch("/api/tasks/timeout-pending", { method: "POST" }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================
     Fetchers
  ========================= */
  const fetchTickets = async (): Promise<void> => {
    try {
      // Traer TODO (sin filtrar a approved), así ves pending/rejected también
      const response = await fetch("/api/admin/tickets", { cache: "no-store" });
      if (response.status === 401) {
        router.push("/admin/login");
        return;
      }
      const data = await response.json();

      const normalized: AdminTicket[] = Array.isArray(data?.tickets)
        ? (data.tickets as unknown[]).map(normalizeTicket)
        : [];

      setTickets(normalized);
    } catch (e) {
      console.error("[dashboard] Error fetching tickets:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchVipAvailability = async (loc: TableLocation): Promise<void> => {
    setLoadingAvail(true);
    setAvailError(null);
    try {
      const r = await fetch(
        `/api/vip-tables/availability?location=${encodeURIComponent(loc)}`,
        { cache: "no-store" }
      );
      const data: VipAvailability = await r.json();
      if (!r.ok || !data?.ok)
        throw new Error(
          (data as any)?.error || "No se pudo obtener disponibilidad"
        );

      const sector = cfg?.vipTables.find((v) => v.location === loc);
      const start =
        sector?.startNumber != null && Number.isFinite(sector.startNumber)
          ? Number(sector.startNumber)
          : null;
      const end =
        sector?.endNumber != null && Number.isFinite(sector.endNumber)
          ? Number(sector.endNumber)
          : null;
      const limit =
        data.limit != null && Number.isFinite(data.limit as any)
          ? Number(data.limit)
          : (sector?.limit ?? 0);

      const allNumbers =
        start != null && end != null
          ? range(start, end)
          : range(1, Math.max(0, limit || 0));
      const takenSet = new Set<number>(
        (Array.isArray(data.taken) ? data.taken : []).map(Number)
      );
      const libres = allNumbers.filter((n) => !takenSet.has(n));

      setAvailability(data);
      setAvailableNumbers(libres);
    } catch (e) {
      const err = e as Error;
      console.error("[VIP availability] error", err);
      setAvailError(err?.message || "Error obteniendo disponibilidad");
      setAvailability(null);
      setAvailableNumbers([]);
    } finally {
      setLoadingAvail(false);
    }
  };

  const fetchConfig = async (): Promise<void> => {
    try {
      const r = await fetch(`/api/admin/tickets/config`, { cache: "no-store" });
      if (r.ok) {
        const data: TicketsConfig = await r.json();
        setCfg(data);
        setConfigForm({
          totalLimitPersons: data.totals?.limitPersons ?? 0,
          genHPrice: data.tickets.general.hombre?.price ?? 0,
          genMPrice: data.tickets.general.mujer?.price ?? 0,
        });

        type Row = (typeof vipTablesForm)[number];
        const byLoc = new Map<TableLocation, Row>();
        for (const c of data.vipTables || []) {
          byLoc.set(c.location, {
            location: c.location,
            price: c.price ?? 0,
            stockLimit: c.limit ?? 0,
            capacityPerTable:
              typeof c.capacityPerTable === "number" && c.capacityPerTable > 0
                ? c.capacityPerTable
                : (data.totals?.unitVipSize ?? 10),
            startNumber:
              typeof c.startNumber === "number" ? c.startNumber : undefined,
            endNumber:
              typeof c.endNumber === "number" ? c.endNumber : undefined,
          });
        }
        const merged: Row[] = [];
        (["dj", "piscina"] as TableLocation[]).forEach((loc) => {
          if (byLoc.has(loc)) merged.push(byLoc.get(loc)!);
          else
            merged.push({
              location: loc,
              price: 0,
              stockLimit: 0,
              capacityPerTable: data.totals?.unitVipSize ?? 10,
            });
        });
        if (byLoc.has("general")) merged.push(byLoc.get("general")!);
        setVipTablesForm(merged);
      }
    } catch (e) {
      console.error("[dashboard] Error fetching config:", e);
    } finally {
      setCfgLoading(false);
    }
  };

  const fetchDiscounts = async (): Promise<void> => {
    try {
      const r = await fetch(`/api/admin/tickets/discounts`, {
        cache: "no-store",
      });
      if (r.ok) {
        const payload = await r.json();
        const list: DiscountCfg[] = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.discounts)
            ? payload.discounts
            : [];
        setDiscounts(list);
      }
    } catch (e) {
      console.error("[dashboard] Error fetching discounts:", e);
    }
  };

  /* =========================
     Actions
  ========================= */
  const handleLogout = async (): Promise<void> => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  };

  const approveTicket = async (ticket: AdminTicket): Promise<void> => {
    try {
      const resp = await fetch("/api/admin/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ticket.id, paymentStatus: "approved" }),
      });
      if (resp.ok) fetchTickets();
      else
        console.error(
          "[dashboard] approve error",
          await resp.json().catch(() => ({}))
        );
    } catch (e) {
      console.error("[dashboard] Error approving ticket:", e);
    }
  };

  const handleDeleteTicket = async (id: string): Promise<void> => {
    if (!confirm("¿Estás seguro de eliminar esta entrada?")) return;
    try {
      const response = await fetch(`/api/admin/tickets?id=${id}`, {
        method: "DELETE",
      });
      if (response.ok) fetchTickets();
      else
        console.error(
          "[dashboard] delete error",
          await response.json().catch(() => ({}))
        );
    } catch (e) {
      console.error("[dashboard] Error deleting ticket:", e);
    }
  };

  // onSubmit deben ser (e: FormEvent<Element>) => void para los modales
  const handleUpdateTicket: React.FormEventHandler = (e) => {
    e.preventDefault();
    if (!editingTicket) return;
    (async () => {
      try {
        const response = await fetch("/api/admin/tickets", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingTicket.id, ...editForm }),
        });
        if (response.ok) {
          setShowEditModal(false);
          setEditingTicket(null);
          fetchTickets();
        } else {
          console.error(
            "[dashboard] update error",
            await response.json().catch(() => ({}))
          );
        }
      } catch (err) {
        console.error("[dashboard] Error updating ticket:", err);
      }
    })();
  };

  const addGeneral: React.FormEventHandler = (e) => {
    e.preventDefault();
    if (!cfg) return;
    (async () => {
      try {
        const unitPrice =
          formGeneral.gender === "hombre"
            ? cfg.tickets.general.hombre?.price || 0
            : cfg.tickets.general.mujer?.price || 0;

        const total = applyDiscount(
          unitPrice,
          formGeneral.quantity,
          pickDiscountRule(discounts, "general", formGeneral.quantity)
        ).total;

        const payload = {
          ticketType: "general" as const,
          gender: formGeneral.gender,
          quantity: formGeneral.quantity,
          customerName: formGeneral.customerName,
          customerEmail: formGeneral.customerEmail,
          customerPhone: formGeneral.customerPhone,
          customerDni: formGeneral.customerDni,
          paymentMethod: formGeneral.paymentMethod,
          totalPrice: total,
          forceTotalPrice: true,
        };

        const r = await fetch("/api/admin/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (r.ok) {
          setShowAddGeneral(false);
          setFormGeneral({
            customerName: "",
            customerEmail: "",
            customerPhone: "",
            customerDni: "",
            gender: "hombre",
            paymentMethod: "efectivo",
            quantity: 1,
          });
          fetchTickets();
          fetchConfig();
        } else {
          const err = await r.json().catch(() => ({}));
          alert(err?.error || "No se pudo crear la entrada general");
        }
      } catch {
        alert("Ocurrió un error creando la entrada general");
      }
    })();
  };

  const selectedVipCfg = useMemo(
    () =>
      !cfg
        ? null
        : cfg.vipTables.find((v) => v.location === formVip.tableLocation) ||
          null,
    [cfg, formVip.tableLocation]
  );
  const vipUnitPrice = useMemo<number>(
    () => (selectedVipCfg ? selectedVipCfg.price : 0),
    [selectedVipCfg]
  );
  const vipTotalInfo = useMemo(
    () => applyDiscount(vipUnitPrice, 1, null),
    [vipUnitPrice]
  );

  const addVip: React.FormEventHandler = (e) => {
    e.preventDefault();
    if (!cfg) return;
    if (!selectedTable) {
      alert("Seleccioná 1 mesa.");
      return;
    }

    (async () => {
      try {
        const sector = cfg.vipTables.find(
          (v) => v.location === formVip.tableLocation
        );
        const start =
          sector?.startNumber != null && Number.isFinite(sector.startNumber)
            ? Number(sector.startNumber)
            : null;
        const end =
          sector?.endNumber != null && Number.isFinite(sector.endNumber)
            ? Number(sector.endNumber)
            : null;
        const localNumber =
          start != null && end != null
            ? selectedTable - start + 1
            : selectedTable;

        const payload: Record<string, unknown> = {
          ticketType: "vip",
          customerName: formVip.customerName,
          customerEmail: formVip.customerEmail,
          customerPhone: formVip.customerPhone,
          customerDni: formVip.customerDni,
          paymentMethod: formVip.paymentMethod,
          totalPrice: vipTotalInfo.total,
          forceTotalPrice: true,
          location: formVip.tableLocation,
          tableNumber: selectedTable, // global
          tableNumberLocal: localNumber, // local sugerido
        };

        const r = await fetch("/api/admin/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (r.ok) {
          setShowAddVip(false);
          setFormVip({
            customerName: "",
            customerEmail: "",
            customerPhone: "",
            customerDni: "",
            paymentMethod: "efectivo",
            tableLocation: formVip.tableLocation,
          });
          setSelectedTable(null);
          fetchTickets();
          fetchConfig();
        } else {
          const err = await r.json().catch(() => ({}));
          alert(err?.error || "No se pudo crear la entrada VIP");
        }
      } catch {
        alert("Ocurrió un error creando la entrada VIP");
      }
    })();
  };

  const saveConfig: React.FormEventHandler = (e) => {
    e.preventDefault();
    (async () => {
      try {
        const payload = {
          totalEntriesLimit: Number(configForm.totalLimitPersons),
          general: {
            hombre: { price: Number(configForm.genHPrice) },
            mujer: { price: Number(configForm.genMPrice) },
          },
          vipTables: vipTablesForm.map((row) => ({
            location: row.location,
            price: Number(row.price),
            stockLimit: Number(row.stockLimit),
            capacityPerTable: Number(row.capacityPerTable),
            ...(row.startNumber != null
              ? { startNumber: Number(row.startNumber) }
              : {}),
            ...(row.endNumber != null
              ? { endNumber: Number(row.endNumber) }
              : {}),
          })),
        };
        const r = await fetch("/api/admin/tickets/config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) {
          alert("No se pudo guardar la configuración");
          return;
        }
        setShowConfigModal(false);
        await fetchConfig();
      } catch {
        alert("Ocurrió un error guardando la configuración");
      }
    })();
  };

  const sendConfirmationEmail = async (ticket: AdminTicket): Promise<void> => {
    if (ticket.paymentStatus !== "approved") {
      alert("Solo se puede enviar el mail cuando el pago está aprobado.");
      return;
    }
    setSendingId(ticket.id);
    try {
      const r = await fetch("/api/send-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: ticket.ticketType === "vip" ? "vip-table" : "ticket",
          recordId: ticket.id,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert(err?.error || "No se pudo enviar el mail.");
        return;
      }
      alert("Email de confirmación enviado ✅");
    } catch {
      alert("Ocurrió un error enviando el mail.");
    } finally {
      setSendingId(null);
    }
  };

  /* =========================
     Derivados
  ========================= */
  const stats = {
    total: tickets.length,
    validated: tickets.filter((t) => t.validated).length,
    revenue: tickets.reduce((sum, t) => sum + (Number(t.totalPrice) || 0), 0),
  };

  const filteredSortedTickets = useMemo<AdminTicket[]>(() => {
    let arr = tickets.slice();
    const qLower = q.trim().toLowerCase();
    if (qLower)
      arr = arr.filter(
        (t) =>
          t.customerName.toLowerCase().includes(qLower) ||
          t.customerEmail.toLowerCase().includes(qLower) ||
          (t.customerDni || "").toLowerCase().includes(qLower)
      );
    if (fStatus !== "all") arr = arr.filter((t) => t.paymentStatus === fStatus);
    if (fType !== "all") arr = arr.filter((t) => t.ticketType === fType);
    if (fGender !== "all")
      arr = arr.filter((t) => (t.gender || "") === fGender);
    if (fPay !== "all") arr = arr.filter((t) => t.paymentMethod === fPay);
    arr.sort((a, b) => {
      if (orderBy === "purchaseDate") {
        const da = new Date(a.purchaseDate).getTime();
        const db = new Date(b.purchaseDate).getTime();
        return order === "asc" ? da - db : db - da;
      }
      const pa = Number(a.totalPrice) || 0;
      const pb = Number(b.totalPrice) || 0;
      return order === "asc" ? pa - pb : pb - pa;
    });
    return arr;
  }, [tickets, q, fStatus, fType, fGender, fPay, orderBy, order]);

  const sumVipRemainingTables = useMemo(
    () => (cfg?.vipTables || []).reduce((a, v) => a + (v.remaining || 0), 0),
    [cfg]
  );

  /* =========================
     Render
  ========================= */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-xl sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
                <TicketIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold">
                  Panel de Administración
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Gestión de entradas y eventos
                </p>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => router.push("/validate")}
                className="border-border/50 hover:bg-accent"
              >
                <QrCode className="w-4 h-4 mr-2" /> Validar QR
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowExportModal(true)}
                className="bg-teal-100 hover:bg-teal-200 text-teal-700"
                title="Exportar Tickets o Reservas VIP"
              >
                <DownloadCloud className="w-4 h-4 mr-2" /> Exportar
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowConfigModal(true)}
                className="bg-blue-100 hover:bg-blue-200 text-blue-700"
              >
                <SlidersHorizontal className="w-4 h-4 mr-2" /> Configuración
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  setShowDiscountsModal(true);
                  await fetchDiscounts();
                }}
                className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700"
                title="Configurar descuentos"
              >
                <DollarSign className="w-4 h-4 mr-2" /> Descuentos
              </Button>

              <Button
                variant="secondary"
                onClick={() => setShowArchiveModal(true)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700"
                title="Ver historial de tickets archivados"
              >
                <History className="w-4 h-4 mr-2" /> Historial
              </Button>

              <Button
                variant="ghost"
                onClick={handleLogout}
                className="hover:bg-red-50 hover:text-red-600"
              >
                <LogOut className="w-4 h-4 mr-2" /> Salir
              </Button>
            </div>

            <div className="sm:hidden flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => router.push("/validate")}
                className="border-border/50 hover:bg-accent"
                aria-label="Validar QR"
              >
                <QrCode className="w-4 h-4" />
              </Button>

              <Button
                variant="outline"
                onClick={() => setShowArchiveModal(true)}
                className="border-border/50 hover:bg-accent"
                aria-label="Ver historial"
                title="Historial"
              >
                <History className="w-4 h-4" />
              </Button>

              <MobileHeaderActions
                onOpenConfig={() => setShowConfigModal(true)}
                onOpenDiscounts={async () => {
                  setShowDiscountsModal(true);
                  await fetchDiscounts();
                }}
                onLogout={handleLogout}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <StatsCards
          stats={stats}
          cfg={cfg}
          cfgLoading={cfgLoading}
          sumVipRemainingTables={sumVipRemainingTables}
        />

        <FiltersBar
          q={q}
          setQ={setQ}
          fStatus={fStatus}
          setFStatus={setFStatus}
          fType={fType}
          setFType={setFType}
          fGender={fGender}
          setFGender={setFGender}
          fPay={fPay}
          setFPay={setFPay}
          orderBy={orderBy}
          setOrderBy={setOrderBy}
          order={order}
          setOrder={setOrder}
        />

        {/* Tabla */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="bg-white">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="text-lg sm:text-xl">
                  Entradas Vendidas
                </CardTitle>
                <CardDescription className="mt-1">
                  Gestiona todas las entradas del evento (
                  {filteredSortedTickets.length}{" "}
                  {filteredSortedTickets.length === 1 ? "entrada" : "entradas"})
                </CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
                <Button
                  onClick={async () => {
                    await Promise.all([fetchConfig(), fetchDiscounts()]);
                    setShowAddGeneral(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm w-full sm:w-auto"
                >
                  <Plus className="w-4 h-4 mr-2" /> Agregar General
                </Button>
                <Button
                  onClick={async () => {
                    await Promise.all([fetchConfig(), fetchDiscounts()]);
                    setShowAddVip(true);
                  }}
                  className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-sm w-full sm:w-auto"
                >
                  <Crown className="w-4 h-4 mr-2" /> Agregar VIP
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-16">
                <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-muted-foreground">Cargando entradas...</p>
              </div>
            ) : filteredSortedTickets.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                  <TicketIcon className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground font-medium">
                  No hay entradas con estos filtros
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Intenta ajustar los filtros de búsqueda
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1140px]">
                  <thead className="bg-muted/50 border-b border-border/50">
                    <tr>
                      <th className="text-left p-4 text-xs sm:text-sm font-semibold text-muted-foreground">
                        Cliente
                      </th>
                      <th className="text-left p-4 text-xs sm:text-sm font-semibold text-muted-foreground">
                        DNI
                      </th>
                      <th className="text-left p-4 text-xs sm:text-sm font-semibold text-muted-foreground">
                        Tipo
                      </th>
                      <th className="text-left p-4 text-xs sm:text-sm font-semibold text-muted-foreground">
                        Mesa
                      </th>
                      <th className="text-left p-4 text-xs sm:text-sm font-semibold text-muted-foreground">
                        Género
                      </th>
                      <th className="text-left p-4 text-xs sm:text-sm font-semibold text-muted-foreground">
                        Precio
                      </th>
                      <th className="text-left p-4 text-xs sm:text-sm font-semibold text-muted-foreground">
                        Método Pago
                      </th>
                      <th className="text-left p-4 text-xs sm:text-sm font-semibold text-muted-foreground">
                        Estado
                      </th>
                      <th className="text-left p-4 text-xs sm:text-sm font-semibold text-muted-foreground">
                        Código
                      </th>
                      <th className="text-right p-4 text-xs sm:text-sm font-semibold text-muted-foreground">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSortedTickets.map((t) => (
                      <TicketRow
                        key={t.id}
                        ticket={t}
                        onApprove={approveTicket}
                        onEdit={(ticket) => {
                          setEditingTicket(ticket);
                          setEditForm({
                            ticketType: ticket.ticketType,
                            customerName: ticket.customerName,
                            customerEmail: ticket.customerEmail,
                            customerPhone: ticket.customerPhone,
                            customerDni: ticket.customerDni || "",
                            gender: (ticket.gender as any) || "hombre",
                            paymentMethod: ticket.paymentMethod,
                            totalPrice: ticket.totalPrice,
                          });
                          setShowEditModal(true);
                        }}
                        onDelete={handleDeleteTicket}
                        onShowQr={(c) => {
                          setQrModalCode(c);
                          setQrModalOpen(true);
                        }}
                        onSendEmail={sendConfirmationEmail}
                        sending={sendingId === t.id}
                        vipRanges={cfg?.vipTables || []}
                        statusFilter={fStatus}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Modales */}
      <AddGeneralModal
        open={showAddGeneral}
        onOpenChange={setShowAddGeneral}
        cfg={cfg}
        discounts={discounts}
        form={formGeneral}
        setForm={setFormGeneral}
        onSubmit={addGeneral}
        isMobile={isMobile}
      />

      <ExportModal open={showExportModal} onOpenChange={setShowExportModal} />

      <AddVipModal
        open={showAddVip}
        onOpenChange={setShowAddVip}
        form={formVip}
        setForm={setFormVip}
        cfg={cfg}
        selectedTable={selectedTable}
        onPickTable={async () => {
          await fetchVipAvailability(formVip.tableLocation);
          setShowTablesModal(true);
        }}
        onSubmit={addVip}
        isMobile={isMobile}
      />

      <TablesModal
        open={showTablesModal}
        onOpenChange={setShowTablesModal}
        loading={loadingAvail}
        error={availError}
        availableNumbers={availableNumbers}
        selectedTable={selectedTable}
        setSelectedTable={setSelectedTable}
        cfg={cfg}
        currentLocation={formVip.tableLocation}
        onRefresh={() => fetchVipAvailability(formVip.tableLocation)}
        isMobile={isMobile}
      />

      <EditTicketModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        form={editForm}
        setForm={setEditForm}
        onSubmit={handleUpdateTicket}
        isMobile={isMobile}
      />

      <ConfigModal
        open={showConfigModal}
        onOpenChange={setShowConfigModal}
        cfg={cfg}
        configForm={configForm}
        setConfigForm={setConfigForm}
        vipTablesForm={vipTablesForm}
        setVipTablesForm={setVipTablesForm}
        onSubmit={saveConfig}
        isMobile={isMobile}
      />

      <DiscountsModal
        open={showDiscountsModal}
        onOpenChange={(v) => {
          setShowDiscountsModal(v);
          if (!v) fetchDiscounts();
        }}
      />

      <QrModal
        open={qrModalOpen}
        onOpenChange={setQrModalOpen}
        code={qrModalCode}
        isMobile={isMobile}
      />

      <ArchiveHistoryModal
        open={showArchiveModal}
        onOpenChange={setShowArchiveModal}
      />
    </div>
  );
}
