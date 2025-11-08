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
import { VipLocation, VipTableConfig } from "./types";

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
  TicketsConfig,
  VipAvailability,
} from "./types";
import { applyDiscount, pickDiscountRule, range } from "./utils/discounts";

/** Tipo local compatible con FiltersBar (no importar Status del componente) */
type FilterStatus = "all" | "approved" | "pending" | "rejected";

/* ============ Normalizador seguro ============ */
function normalizeTicket(raw: unknown): AdminTicket {
  const r = raw as Record<string, unknown>;

  // mesa (nueva numeración vipTableNumber o equivalentes)
  const singleRaw =
    r["vipTableNumber"] ??
    r["tableNumber"] ??
    r["table_number"] ??
    r["table"] ??
    r["mesa"] ??
    null;

  const single =
    typeof singleRaw === "number"
      ? singleRaw
      : typeof singleRaw === "string"
      ? Number.parseInt(singleRaw, 10) || null
      : null;

  const id = String(
    r["id"] ??
      (r as any)["_id"] ??
      (typeof crypto !== "undefined" && (crypto as any).randomUUID
        ? (crypto as any).randomUUID()
        : `tmp_${Date.now()}`)
  );

  const ticketType = (r["ticketType"] ?? r["type"] ?? "general") as AdminTicket["ticketType"];
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

  // Nuevos campos VIP
  const vipLocationId = (r["vipLocationId"] as string) ?? null;
  const vipLocationName =
    (r["vipLocationName"] as string) ??
    ((r["vipLocation"] as any)?.name as string | undefined) ??
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
    expiresAt: (r["expiresAt"] as string) ?? null,
    vipLocationId,
    vipLocationName,
    vipTableId: (r["vipTableId"] as string) ?? null,
    vipTableNumber: single ?? null,
  };
}

/* =========================
   Página
========================= */
export default function Page() {
  const router = useRouter();
  const isMobile = useIsMobile();

  // ✅ Event ID centralizado
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [loadingEvent, setLoadingEvent] = useState<boolean>(true);

  const [vipLocations, setVipLocations] = useState<VipLocation[]>([]);
  const [vipConfigs, setVipConfigs] = useState<VipTableConfig[]>([]);

  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // 🔧 Estados requeridos por ConfigModal
  const [configForm, setConfigForm] = useState({
    totalLimitPersons: 0,
    genHPrice: 0,
    genMPrice: 0,
  });
  const [vipTablesForm, setVipTablesForm] = useState<any[]>([]);

  const [cfg, setCfg] = useState<TicketsConfig | null>(null);
  const [cfgLoading, setCfgLoading] = useState<boolean>(true);

  const [showExportModal, setShowExportModal] = useState<boolean>(false);

  // Mesas (picker)
  const [showTablesModal, setShowTablesModal] = useState<boolean>(false);
  const [availability, setAvailability] = useState<VipAvailability | null>(null);
  const [availableNumbers, setAvailableNumbers] = useState<number[]>([]);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [loadingAvail, setLoadingAvail] = useState<boolean>(false);
  const [availError, setAvailError] = useState<string | null>(null);

  const [discounts, setDiscounts] = useState<DiscountCfg[]>([]);
  const [showDiscountsModal, setShowDiscountsModal] = useState<boolean>(false);

  // Filtros (compatibles con FiltersBar)
  const [q, setQ] = useState<string>("");
  const [fStatus, setFStatus] = useState<FilterStatus>("all");
  const [fType, setFType] = useState<"all" | "general" | "vip">("all");
  const [fGender, setFGender] = useState<"all" | "hombre" | "mujer">("all");
  const [fPay, setFPay] = useState<"all" | "efectivo" | "transferencia" | "mercadopago">("all");
  const [orderBy, setOrderBy] = useState<"purchaseDate" | "totalPrice">("purchaseDate");
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

  const [formVip, setFormVip] = useState<AddVipForm & { vipTableNumber: number | null }>({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerDni: "",
    paymentMethod: "efectivo",
    vipLocationId: "",
    vipTableNumber: null,
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

  const [qrModalOpen, setQrModalOpen] = useState<boolean>(false);
  const [qrModalCode, setQrModalCode] = useState<string | null>(null);

  const [sendingId, setSendingId] = useState<string | null>(null);

  // ========= helpers evento =========
  const fetchActiveEventId = async (): Promise<string | null> => {
    try {
      // tu API original
      const res = await fetch("/api/admin/events/active", { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      const id: string | undefined = data?.event?.id || data?.eventId || data?.id;
      return id ?? null;
    } catch {
      return null;
    }
  };

  const ensureEventId = async () => {
    if (activeEventId) return activeEventId;
    setLoadingEvent(true);
    const id = await fetchActiveEventId();
    setActiveEventId(id);
    setLoadingEvent(false);
    return id;
  };

  useEffect(() => {
    (async () => {
      await ensureEventId(); // primero, evento
      fetchTickets();
      fetchConfig();
      fetchDiscounts();
      fetchVipData(); // ubicaciones/config VIP dependen del evento
      // “patear” el timeout de pendientes (parche si aún no tienes cron)
      fetch("/api/tasks/timeout-pending", { method: "POST" }).catch(() => {});
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSelectedTable(null);
  }, [formVip.vipLocationId]);

  /* =========================
     Fetchers
  ========================= */
  const fetchVipData = async (): Promise<void> => {
    try {
      const eventId = activeEventId ?? (await ensureEventId());
      if (!eventId) {
        console.warn("[dashboard] No hay eventId para VIP data.");
        return;
      }

      const [locRes, cfgRes] = await Promise.all([
        fetch(`/api/vip-tables/locations?eventId=${eventId}`, { cache: "no-store" }),
        fetch(`/api/vip-tables/config?eventId=${eventId}`, { cache: "no-store" }),
      ]);

      if (!locRes.ok) {
        console.error(`[dashboard] Error ${locRes.status} al obtener locations`);
        return;
      }
      if (!cfgRes.ok) {
        console.error(`[dashboard] Error ${cfgRes.status} al obtener config`);
        return;
      }

      const locJson = await locRes.json();
      const cfgJson = await cfgRes.json();

      if (locJson.ok && Array.isArray(locJson.locations)) {
        setVipLocations(locJson.locations);
      } else {
        console.warn("[dashboard] Locations no válidas:", locJson);
      }

      if (cfgJson.ok && Array.isArray(cfgJson.configs)) {
        setVipConfigs(cfgJson.configs);
      } else {
        console.warn("[dashboard] Configs no válidas:", cfgJson);
      }
    } catch (err) {
      console.error("[dashboard] Error fetching VIP data:", err);
    }
  };

  const fetchTickets = async (): Promise<void> => {
    try {
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

  const fetchVipAvailability = async (vipLocationId: string): Promise<void> => {
  setLoadingAvail(true);
  setAvailError(null);
  try {
    const r = await fetch(
      `/api/vip-tables/availability?vipLocationId=${encodeURIComponent(vipLocationId)}`,
      { cache: "no-store" }
    );
    const data = await r.json();

    if (!r.ok || !data?.ok) {
      throw new Error(data?.error || "No se pudo obtener disponibilidad");
    }

    // ✅ Guardamos toda la data del endpoint
    setAvailability(data);

    // ✅ Extraemos las mesas reales
    const allTables = Array.isArray(data.tables) ? data.tables : [];

    // ✅ Filtramos las disponibles
    const available = allTables.filter((t: any) => t.available);

    // ✅ Creamos una lista de números disponibles
    const libres = available.map((t: any) => t.tableNumber);

    setAvailableNumbers(libres);
  } catch (e) {
    const err = e as Error;
    console.error("[VIP availability] error", err);
    setAvailError(err.message || "Error obteniendo disponibilidad");
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

        // Precargar form para ConfigModal
        setConfigForm((prev) => ({
          ...prev,
          totalLimitPersons: data.totals?.limitPersons ?? 0,
          genHPrice: data.tickets?.general?.hombre?.price ?? 0,
          genMPrice: data.tickets?.general?.mujer?.price ?? 0,
        }));
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

  // ✅ Creación General SIEMPRE con eventId del estado
  const addGeneral: React.FormEventHandler = (e) => {
    e.preventDefault();
    (async () => {
      const eventId = activeEventId ?? (await ensureEventId());
      if (!eventId) {
        alert("No se encontró el evento activo. Reintentá en unos segundos.");
        return;
      }
      if (!cfg) {
        alert("No se pudo cargar la configuración de tickets.");
        return;
      }

      try {
        // precios desde config
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
          eventId, // ✅ agregado
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

  const saveConfig: React.FormEventHandler = (e) => {
    e.preventDefault();
    // Si tu ConfigModal guarda por su cuenta (con axios dentro), podés dejar vacío.
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
    if (fGender !== "all") arr = arr.filter((t) => (t.gender || "") === fGender);
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

  const sumVipRemainingTables = useMemo(() => {
  if (!cfg?.vipTables) return 0;

  return cfg.vipTables.reduce((acc, t) => {
    const remaining = Math.max(0, (t.limit ?? 0) - (t.sold ?? 0));
    return acc + remaining;
  }, 0);
}, [cfg]);

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
          fStatus={fStatus as any}          // ✅ compatible con FiltersBar(Status)
          setFStatus={setFStatus as any}    // ✅ compatible con FiltersBar
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
                    // aseguramos tener eventId antes de abrir
                    if (!activeEventId) await ensureEventId();
                    await Promise.all([fetchConfig(), fetchDiscounts()]);
                    setShowAddGeneral(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm w-full sm:w-auto"
                >
                  <Plus className="w-4 h-4 mr-2" /> Agregar General
                </Button>
                <Button
                  onClick={async () => {
                    // aseguramos eventId
                    if (!activeEventId) await ensureEventId();
                    await Promise.all([fetchConfig(), fetchDiscounts(), fetchVipData()]);
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
            {loading || loadingEvent ? (
              <div className="text-center py-16">
                <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-muted-foreground">
                  Cargando entradas{loadingEvent ? " y evento..." : "..."}
                </p>
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
                        Ubicación
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
                            vipLocationId: ticket.vipLocationId ?? undefined,
                            vipTableNumber: ticket.vipTableNumber ?? undefined,
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
                        // si tu fila usa rangos, podés mapear desde cfg.vipConfigs
                        vipRanges={(cfg?.vipConfigs as any) || []}
                        statusFilter={fStatus as any}
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
      <AddVipModal
  open={showAddVip}
  onOpenChange={setShowAddVip}
  form={formVip}
  setForm={setFormVip} // ✅ usa directamente el setter del useState
  configs={vipConfigs}
  locations={vipLocations}
  cfg={cfg}
  onSubmit={async (e) => { /* ... */ }}
  isMobile={isMobile}
/>
      <ExportModal open={showExportModal} onOpenChange={setShowExportModal} />

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

      <AddVipModal
        open={showAddVip}
        onOpenChange={setShowAddVip}
        form={formVip}
       setForm={setFormVip}
        configs={vipConfigs}
        locations={vipLocations}
        cfg={cfg}
        onSubmit={async (e) => {
          e.preventDefault();

          const eventId = activeEventId ?? (await ensureEventId());
          if (!eventId) {
            alert("No se encontró el evento activo. Reintentá en unos segundos.");
            return;
          }

          const vipTableNumber = formVip.vipTableNumber;

          if (!formVip.vipLocationId) {
            alert("Seleccioná una ubicación VIP");
            return;
          }

          if (!vipTableNumber) {
            alert("Seleccioná una mesa");
            return;
          }

          try {
            const payload = {
              ticketType: "vip" as const,
              eventId, // ✅ siempre presente
              customerName: formVip.customerName.trim(),
              customerEmail: formVip.customerEmail.trim(),
              customerPhone: formVip.customerPhone.trim(),
              customerDni: formVip.customerDni.trim(),
              paymentMethod: formVip.paymentMethod,
              vipLocationId: formVip.vipLocationId,
              vipTableNumber: formVip.vipTableNumber,
              totalPrice: 0,
              forceTotalPrice: true,
            };

            const response = await fetch("/api/admin/tickets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            if (!response.ok) {
              const err = await response.json().catch(() => ({}));
              throw new Error(err?.error || "No se pudo crear la entrada VIP");
            }

            alert("🎉 Entrada VIP creada correctamente.");

            setFormVip({
              customerName: "",
              customerEmail: "",
              customerPhone: "",
              customerDni: "",
              paymentMethod: "efectivo",
              vipLocationId: "",
              vipTableNumber: null,
            });

            setShowAddVip(false);
            await Promise.all([fetchTickets(), fetchConfig()]);
          } catch (error: any) {
            alert(error.message || "Ocurrió un error creando la entrada VIP");
          }
        }}
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
        cfg={cfg as any}
        currentLocation={formVip.vipLocationId as any}
        onRefresh={() => {
          if (formVip.vipLocationId) fetchVipAvailability(formVip.vipLocationId);
        }}
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
