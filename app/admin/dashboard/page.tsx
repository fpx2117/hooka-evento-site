// app/admin/dashboard/page.tsx
"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import DiscountsModal from "@/components/DiscountsModal";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LogOut,
  Plus,
  Trash2,
  Users,
  DollarSign,
  CheckCircle,
  Edit,
  QrCode,
  Ticket,
  Crown,
  SlidersHorizontal,
  Filter,
  ArrowUpDown,
  Search,
  TrendingUp,
  Mail,
} from "lucide-react";
import QRCode from "qrcode";

/* =========================
   Tipos
========================= */
interface AdminTicket {
  id: string;
  ticketType: "general" | "vip";
  quantity: number;
  totalPrice: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDni?: string;
  gender?: "hombre" | "mujer" | null;
  paymentMethod: "efectivo" | "transferencia" | "mercadopago";
  paymentStatus: "pending" | "approved" | "rejected";
  qrCode?: string | null;
  validationCode?: string | null;
  validated: boolean;
  purchaseDate: string;
}

type AddGeneralForm = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDni: string;
  gender: "hombre" | "mujer";
  paymentMethod: "efectivo" | "transferencia" | "mercadopago";
  quantity: number;
};
type AddVipForm = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDni: string;
  paymentMethod: "efectivo" | "transferencia" | "mercadopago";
  quantity: number; // MESAS
};

type AdminForm = {
  ticketType: "general" | "vip";
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDni: string;
  gender: "hombre" | "mujer" | "";
  paymentMethod: "efectivo" | "transferencia" | "mercadopago";
  totalPrice: number;
};

type DiscountCfg = {
  id?: string;
  ticketType: "general" | "vip";
  minQty: number;
  type: "percent" | "amount";
  value: number;
  priority?: number;
  isActive?: boolean;
};

// ✅ TicketsConfig con TOTAL en personas + VIP en personas
type TicketsConfig = {
  eventId: string;
  eventName: string;
  eventDate: string;
  isActive: boolean;
  totals: {
    unitVipSize: number;
    limitPersons: number;
    soldPersons: number;
    remainingPersons: number;
  };
  tickets: {
    general: {
      hombre?: {
        price: number;
        limit: number;
        sold: number;
        remaining: number;
      };
      mujer?: { price: number; limit: number; sold: number; remaining: number };
    };
    vip?: {
      price: number;
      limit: number; // PERSONAS
      sold: number; // PERSONAS
      remaining: number; // PERSONAS
      unitSize: number;
      remainingTables: number;
    };
  };
  vipTables: Array<{
    location: "piscina" | "dj" | "general";
    price: number;
    limit: number;
    sold: number;
    remaining: number;
    capacityPerTable?: number | null;
  }>;
  discounts?: DiscountCfg[];
};

/* =========================
   Helpers QR
========================= */
function buildValidateUrl(code: string) {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/admin/validate?code=${encodeURIComponent(
      code
    )}`;
  }
  return `/admin/validate?code=${encodeURIComponent(code)}`;
}

async function makeQrDataUrl(code: string, scale = 4) {
  const url = buildValidateUrl(code);
  return await QRCode.toDataURL(url, { margin: 1, scale });
}

/* =========================
   Fila tabla
========================= */
function TicketRow({
  ticket,
  onApprove,
  onEdit,
  onDelete,
  onShowQr,
  onSendEmail,
  sending = false,
}: {
  ticket: AdminTicket;
  onApprove: (t: AdminTicket) => void;
  onEdit: (t: AdminTicket) => void;
  onDelete: (id: string) => void;
  onShowQr: (code: string) => void;
  onSendEmail: (t: AdminTicket) => void;
  sending?: boolean;
}) {
  const [qrSrc, setQrSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!ticket.validationCode) {
        setQrSrc(null);
        return;
      }
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

  return (
    <tr className="border-b border-border/50 hover:bg-gray/50 transition-colors">
      <td className="p-4">
        <div className="space-y-1">
          <p className="font-semibold text-foreground">{ticket.customerName}</p>
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
            <Ticket className="w-4 h-4 text-blue-500" />
          )}
          <span className="capitalize font-medium text-sm">
            {ticket.ticketType}
          </span>
        </div>
      </td>
      <td className="p-4">
        <span className="capitalize text-sm text-muted-foreground">
          {ticket.gender || "—"}
        </span>
      </td>
      <td className="p-4">
        <span className="font-semibold text-foreground">
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
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
            ticket.paymentStatus === "approved"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              : ticket.paymentStatus === "rejected"
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          }`}
        >
          {ticket.paymentStatus === "approved" && "✓ "}
          {ticket.paymentStatus === "rejected" && "✕ "}
          {ticket.paymentStatus === "pending" && "⏱ "}
          {ticket.paymentStatus}
        </span>
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
                alt="QR de validación"
                width={40}
                height={40}
                className="rounded-md border-2 border-border shadow-sm hover:shadow-md transition-shadow"
              />
            </button>
          )}
        </div>
      </td>
      <td className="p-4 text-right">
        <div className="flex items-center justify-end gap-2">
          {ticket.paymentStatus !== "approved" && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onApprove(ticket)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
              Aprobar
            </Button>
          )}
          {ticket.paymentStatus === "approved" && (
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
            className="hover:bg-blue-50 dark:hover:bg-blue-950"
          >
            <Edit className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(ticket.id)}
            className="hover:bg-red-50 dark:hover:bg-red-950"
          >
            <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

/* =========================
   Dashboard
========================= */
export default function AdminDashboard() {
  const router = useRouter();
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [loading, setLoading] = useState(true);

  // Config desde BD
  const [cfg, setCfg] = useState<TicketsConfig | null>(null);
  const [cfgLoading, setCfgLoading] = useState(true);

  // Discounts
  const [discounts, setDiscounts] = useState<DiscountCfg[]>([]);
  const [showDiscountsModal, setShowDiscountsModal] = useState(false);
  const [creatingDiscount, setCreatingDiscount] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [discountForm, setDiscountForm] = useState({
    ticketType: "general" as "general" | "vip",
    minQty: 4,
    type: "percent" as "percent" | "amount",
    value: 10,
    priority: 0,
    isActive: "true" as "true" | "false",
  });

  // Filtros
  const [q, setQ] = useState("");
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

  // Modales existentes
  const [showAddGeneral, setShowAddGeneral] = useState(false);
  const [showAddVip, setShowAddVip] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);

  const [editingTicket, setEditingTicket] = useState<AdminTicket | null>(null);

  // Formularios altas
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
    quantity: 1,
  });

  // Form editar ticket
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

  // ✅ Form configuración (TOTAL + precios H/M + VIP personas)
  const [configForm, setConfigForm] = useState({
    totalLimitPersons: 0,
    genHPrice: 0,
    genMPrice: 0,
    vipPrice: 0,
    vipLimitPersons: 0,
  });

  // Modal QR grande
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrModalCode, setQrModalCode] = useState<string | null>(null);
  const [qrModalSrc, setQrModalSrc] = useState<string | null>(null);

  // estado de envío por fila
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    fetchTickets();
    fetchConfig();
  }, []);

  const fetchTickets = async () => {
    try {
      const response = await fetch("/api/admin/tickets", { cache: "no-store" });
      if (response.status === 401) {
        router.push("/admin/login");
        return;
      }
      const data = await response.json();
      const normalized: AdminTicket[] = (data.tickets || []).map((t: any) => ({
        ...t,
        customerDni:
          t.customerDni ?? t.customerDNI ?? t.customer_dni ?? t.dni ?? "",
        qrCode: t.qrCode ?? t.Code ?? undefined,
      }));
      setTickets(normalized);
    } catch (error) {
      console.error("[dashboard] Error fetching tickets:", error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Lee totals, VIP (PERSONAS) y discounts
  const fetchConfig = async () => {
    try {
      const r = await fetch(`/api/admin/tickets/config`, {
        cache: "no-store",
      });
      if (r.ok) {
        const data: TicketsConfig = await r.json();
        setCfg(data);
        setDiscounts((data as any).discounts || []);
        setConfigForm({
          totalLimitPersons: data.totals?.limitPersons ?? 0,
          genHPrice: data.tickets.general.hombre?.price ?? 0,
          genMPrice: data.tickets.general.mujer?.price ?? 0,
          vipPrice: data.tickets.vip?.price ?? 0,
          vipLimitPersons: data.tickets.vip?.limit ?? 0,
        });
      }
    } catch (e) {
      console.error("[dashboard] Error fetching config:", e);
    } finally {
      setCfgLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  };

  // Aprobar ticket
  const approveTicket = async (ticket: AdminTicket) => {
    try {
      const resp = await fetch("/api/admin/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ticket.id, paymentStatus: "approved" }),
      });
      if (resp.ok) {
        fetchTickets();
      } else {
        const err = await resp.json().catch(() => ({}));
        console.error("[dashboard] Error approving ticket:", err);
      }
    } catch (e) {
      console.error("[dashboard] Error approving ticket:", e);
    }
  };

  const handleDeleteTicket = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta entrada?")) return;
    try {
      const response = await fetch(`/api/admin/tickets?id=${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        fetchTickets();
      } else {
        const err = await response.json().catch(() => ({}));
        console.error("[dashboard] Error deleting ticket:", err);
      }
    } catch (error) {
      console.error("[dashboard] Error deleting ticket:", error);
    }
  };

  // Editar (modal)
  const handleEditTicket = (ticket: AdminTicket) => {
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
  };

  const handleUpdateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTicket) return;
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
        const err = await response.json().catch(() => ({}));
        console.error("[dashboard] Error updating ticket:", err);
      }
    } catch (error) {
      console.error("[dashboard] Error updating ticket:", error);
    }
  };

  // ===== Altas manuales (General/VIP) con precio desde BD =====
  const generalUnitPrice = useMemo(() => {
    if (!cfg) return 0;
    const g = formGeneral.gender;
    return g === "hombre"
      ? cfg.tickets.general.hombre?.price || 0
      : cfg.tickets.general.mujer?.price || 0;
  }, [cfg, formGeneral.gender]);

  const generalRemaining = useMemo(() => {
    if (!cfg) return 0;
    const g = formGeneral.gender;
    return g === "hombre"
      ? cfg.tickets.general.hombre?.remaining || 0
      : cfg.tickets.general.mujer?.remaining || 0;
  }, [cfg, formGeneral.gender]);

  const generalTotal = useMemo(
    () =>
      Math.max(0, generalUnitPrice) * Math.max(1, formGeneral.quantity || 1),
    [generalUnitPrice, formGeneral.quantity]
  );

  const vipUnitPrice = useMemo(() => cfg?.tickets.vip?.price || 0, [cfg]);
  const vipRemainingTables = useMemo(
    () => cfg?.tickets.vip?.remainingTables || 0,
    [cfg]
  );
  const vipTotal = useMemo(
    () => Math.max(0, vipUnitPrice) * Math.max(1, formVip.quantity || 1),
    [vipUnitPrice, formVip.quantity]
  );

  const resetGeneral = () =>
    setFormGeneral({
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      customerDni: "",
      gender: "hombre",
      paymentMethod: "efectivo",
      quantity: 1,
    });
  const resetVip = () =>
    setFormVip({
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      customerDni: "",
      paymentMethod: "efectivo",
      quantity: 1,
    });

  const addGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cfg) return;
    if (formGeneral.quantity > generalRemaining) {
      alert("No hay cupo disponible para la cantidad solicitada.");
      return;
    }
    try {
      const payload = {
        ticketType: "general",
        gender: formGeneral.gender,
        quantity: formGeneral.quantity,
        customerName: formGeneral.customerName,
        customerEmail: formGeneral.customerEmail,
        customerPhone: formGeneral.customerPhone,
        customerDni: formGeneral.customerDni,
        paymentMethod: formGeneral.paymentMethod,
      };
      const r = await fetch("/api/admin/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        setShowAddGeneral(false);
        resetGeneral();
        fetchTickets();
        fetchConfig();
      } else {
        const err = await r.json().catch(() => ({}));
        console.error("[dashboard] Error add general:", err);
      }
    } catch (e) {
      console.error("[dashboard] Error add general:", e);
    }
  };

  const addVip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cfg) return;
    if (formVip.quantity > vipRemainingTables) {
      alert("No hay mesas VIP disponibles para esa cantidad.");
      return;
    }
    try {
      const payload = {
        ticketType: "vip",
        quantity: formVip.quantity,
        customerName: formVip.customerName,
        customerEmail: formVip.customerEmail,
        customerPhone: formVip.customerPhone,
        customerDni: formVip.customerDni,
        paymentMethod: formVip.paymentMethod,
      };
      const r = await fetch("/api/admin/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        setShowAddVip(false);
        resetVip();
        fetchTickets();
        fetchConfig();
      } else {
        const err = await r.json().catch(() => ({}));
        console.error("[dashboard] Error add vip:", err);
      }
    } catch (e) {
      console.error("[dashboard] Error add vip:", e);
    }
  };

  // Modal QR grande
  function openQrModal(code: string) {
    setQrModalCode(code);
    setQrModalOpen(true);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      if (!qrModalOpen || !qrModalCode) {
        setQrModalSrc(null);
        return;
      }
      try {
        const dataUrl = await makeQrDataUrl(qrModalCode, 8);
        if (active) setQrModalSrc(dataUrl);
      } catch {
        if (active) setQrModalSrc(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [qrModalOpen, qrModalCode]);

  const stats = {
    total: tickets.length,
    validated: tickets.filter((t) => t.validated).length,
    revenue: tickets.reduce((sum, t) => sum + (Number(t.totalPrice) || 0), 0),
  };

  // ✅ Guardar configuración (TOTAL + precios H/M + VIP personas)
  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        totalEntriesLimit: Number(configForm.totalLimitPersons),
        general: {
          hombre: { price: Number(configForm.genHPrice) },
          mujer: { price: Number(configForm.genMPrice) },
        },
        vip: {
          price: Number(configForm.vipPrice),
          stockLimit: Number(configForm.vipLimitPersons),
        },
      };

      const r = await fetch("/api/admin/tickets/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        console.error("[dashboard] Error saving config:", err);
        alert("No se pudo guardar la configuración");
        return;
      }

      setShowConfigModal(false);
      await fetchConfig();
    } catch (e) {
      console.error("[dashboard] Error saving config:", e);
      alert("Ocurrió un error guardando la configuración");
    }
  };

  // ======= Descuentos =======
  const sortedDiscounts = useMemo(() => {
    const list = [...discounts];
    list.sort((a, b) => {
      if (a.ticketType !== b.ticketType)
        return a.ticketType < b.ticketType ? -1 : 1;
      if ((b.minQty || 0) !== (a.minQty || 0))
        return (b.minQty || 0) - (a.minQty || 0);
      return (b.priority || 0) - (a.priority || 0);
    });
    return list;
  }, [discounts]);

  const createDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingDiscount(true);
    try {
      const newRule: DiscountCfg = {
        id:
          (globalThis.crypto as any)?.randomUUID?.() ||
          `d_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ticketType: discountForm.ticketType,
        minQty: Number(discountForm.minQty),
        type: discountForm.type,
        value: Number(discountForm.value),
        priority: Number(discountForm.priority) || 0,
        isActive: discountForm.isActive === "true",
      };

      const next = [...discounts, newRule];

      const r = await fetch("/api/admin/tickets/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discounts: next }),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        console.error("[dashboard] Error saving discounts:", err);
        alert(err?.error || "No se pudo guardar el descuento");
        return;
      }

      setDiscountForm((f) => ({
        ...f,
        minQty: 4,
        type: "percent",
        value: 10,
        priority: 0,
        isActive: "true",
      }));
      await fetchConfig();
    } catch (e) {
      console.error("[dashboard] Error creating discount:", e);
      alert("Ocurrió un error creando el descuento");
    } finally {
      setCreatingDiscount(false);
    }
  };

  const deleteDiscount = async (id: string) => {
    if (!confirm("¿Eliminar esta regla de descuento?")) return;
    setDeletingId(id);
    try {
      const next = discounts.filter((d) => d.id !== id);

      const r = await fetch("/api/admin/tickets/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discounts: next }),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        console.error("[dashboard] Error deleting discount:", err);
        alert(err?.error || "No se pudo eliminar");
        return;
      }
      await fetchConfig();
    } catch (e) {
      console.error("[dashboard] Error deleting discount:", e);
      alert("Ocurrió un error eliminando el descuento");
    } finally {
      setDeletingId(null);
    }
  };

  // ======= Filtro + Orden local =======
  const filteredSortedTickets = useMemo(() => {
    let arr = tickets.slice();

    const qLower = q.trim().toLowerCase();
    if (qLower) {
      arr = arr.filter((t) => {
        return (
          t.customerName.toLowerCase().includes(qLower) ||
          t.customerEmail.toLowerCase().includes(qLower) ||
          (t.customerDni || "").toLowerCase().includes(qLower)
        );
      });
    }
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
      const pa = a.totalPrice || 0;
      const pb = b.totalPrice || 0;
      return order === "asc" ? pa - pb : pb - pa;
    });

    return arr;
  }, [tickets, q, fStatus, fType, fGender, fPay, orderBy, order]);

  // enviar email de confirmación (solo approved)
  const sendConfirmationEmail = async (ticket: AdminTicket) => {
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
        console.error("[dashboard] send mail error:", err);
        alert(err?.error || "No se pudo enviar el mail.");
        return;
      }

      alert("Email de confirmación enviado ✅");
    } catch (e) {
      console.error("[dashboard] send mail error:", e);
      alert("Ocurrió un error enviando el mail.");
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 dark:from-slate-950 dark:via-blue-950/20 dark:to-slate-950">
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-xl sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
                <Ticket className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">
                  Panel de Administración
                </h1>
                <p className="text-sm text-muted-foreground">
                  Gestión de entradas y eventos
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => router.push("/admin/validate")}
                className="border-border/50 hover:bg-accent"
              >
                <QrCode className="w-4 h-4 mr-2" />
                Validar QR
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowConfigModal(true)}
                className="bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-950 dark:hover:bg-blue-900 dark:text-blue-300"
              >
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                Configuración
              </Button>
              {/* Botón Descuentos */}
              <Button
                variant="secondary"
                onClick={async () => {
                  setShowDiscountsModal(true);
                  await fetchConfig();
                }}
                className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 dark:bg-emerald-950 dark:hover:bg-emerald-900 dark:text-emerald-300"
                title="Configurar descuentos por cantidad"
              >
                <DollarSign className="w-4 h-4 mr-2" />
                Descuentos
              </Button>
              <Button
                variant="ghost"
                onClick={handleLogout}
                className="hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Salir
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-card to-card/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Entradas
              </CardTitle>
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {stats.total}
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Entradas registradas
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-card to-card/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Validadas
              </CardTitle>
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {stats.validated}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.total > 0
                  ? Math.round((stats.validated / stats.total) * 100)
                  : 0}
                % del total
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-card to-card/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ingresos
              </CardTitle>
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                ${stats.revenue.toLocaleString("es-AR")}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Ingresos totales
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-card to-card/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Cupos Disponibles
              </CardTitle>
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
                <Ticket className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
            </CardHeader>
            <CardContent className="text-sm">
              {cfgLoading ? (
                <div className="text-muted-foreground">Cargando…</div>
              ) : cfg ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total:</span>
                    <b className="text-foreground">
                      {cfg.totals.remainingPersons} restantes
                    </b>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">VIP (mesas):</span>
                    <b className="text-foreground">
                      {cfg.tickets.vip?.remainingTables ?? 0} mesas
                    </b>
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground">
                  Sin configuración disponible
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* FILTROS */}
        <Card className="mb-6 border-border/50 shadow-sm">
          <CardHeader className="bg-white">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <Filter className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-base">Filtros y Búsqueda</CardTitle>
                <CardDescription>
                  Filtrá y ordená las entradas listadas abajo
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              <div className="lg:col-span-2">
                <Label className="text-sm font-medium mb-2 block">
                  Búsqueda
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Nombre, email o DNI"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="pl-10 border-border/50"
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">Estado</Label>
                <Select
                  value={fStatus}
                  onValueChange={(v: any) => setFStatus(v)}
                >
                  <SelectTrigger className="border-border/50">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="approved">Aprobado</SelectItem>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="rejected">Rechazado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">Tipo</Label>
                <Select value={fType} onValueChange={(v: any) => setFType(v)}>
                  <SelectTrigger className="border-border/50">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="vip">VIP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">Género</Label>
                <Select
                  value={fGender}
                  onValueChange={(v: any) => setFGender(v)}
                >
                  <SelectTrigger className="border-border/50">
                    <SelectValue placeholder="Género" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="hombre">Hombre</SelectItem>
                    <SelectItem value="mujer">Mujer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">Pago</Label>
                <Select value={fPay} onValueChange={(v: any) => setFPay(v)}>
                  <SelectTrigger className="border-border/50">
                    <SelectValue placeholder="Método" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border/50 flex items-end gap-3">
              <div className="flex-1">
                <Label className="text-sm font-medium mb-2 block">
                  Ordenar por
                </Label>
                <Select
                  value={orderBy}
                  onValueChange={(v: any) => setOrderBy(v)}
                >
                  <SelectTrigger className="border-border/50">
                    <SelectValue placeholder="Campo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchaseDate">Fecha compra</SelectItem>
                    <SelectItem value="totalPrice">Precio total</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOrder(order === "asc" ? "desc" : "asc")}
                className="border-border/50"
              >
                <ArrowUpDown className="w-4 h-4 mr-2" />
                {order === "asc" ? "Ascendente" : "Descendente"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabla de tickets */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="bg-white">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="text-xl">Entradas Vendidas</CardTitle>
                <CardDescription className="mt-1">
                  Gestiona todas las entradas del evento (
                  {filteredSortedTickets.length}{" "}
                  {filteredSortedTickets.length === 1 ? "entrada" : "entradas"})
                </CardDescription>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={() => setShowAddGeneral(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Agregar General
                </Button>
                <Button
                  onClick={() => setShowAddVip(true)}
                  className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-sm"
                >
                  <Crown className="w-4 h-4 mr-2" />
                  Agregar VIP
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-16">
                <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-muted-foreground">Cargando entradas...</p>
              </div>
            ) : filteredSortedTickets.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                  <Ticket className="w-8 h-8 text-muted-foreground" />
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
                <table className="w-full">
                  <thead className="bg-muted/50 border-b border-border/50">
                    <tr>
                      <th className="text-left p-4 text-sm font-semibold text-muted-foreground">
                        Cliente
                      </th>
                      <th className="text-left p-4 text-sm font-semibold text-muted-foreground">
                        DNI
                      </th>
                      <th className="text-left p-4 text-sm font-semibold text-muted-foreground">
                        Tipo
                      </th>
                      <th className="text-left p-4 text-sm font-semibold text-muted-foreground">
                        Género
                      </th>
                      <th className="text-left p-4 text-sm font-semibold text-muted-foreground">
                        Precio
                      </th>
                      <th className="text-left p-4 text-sm font-semibold text-muted-foreground">
                        Método Pago
                      </th>
                      <th className="text-left p-4 text-sm font-semibold text-muted-foreground">
                        Estado
                      </th>
                      <th className="text-left p-4 text-sm font-semibold text-muted-foreground">
                        Código
                      </th>
                      <th className="text-right p-4 text-sm font-semibold text-muted-foreground">
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
                        onEdit={handleEditTicket}
                        onDelete={handleDeleteTicket}
                        onShowQr={(c) => {
                          setQrModalCode(c);
                          setQrModalOpen(true);
                        }}
                        onSendEmail={sendConfirmationEmail}
                        sending={sendingId === t.id}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* ===== Modal Agregar General ===== */}
      <Dialog open={showAddGeneral} onOpenChange={setShowAddGeneral}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <Ticket className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <DialogTitle className="text-xl">
                  Agregar Entrada General
                </DialogTitle>
                <DialogDescription>
                  El precio se toma automáticamente desde la base de datos
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={addGeneral} className="space-y-6 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Nombre Completo</Label>
                <Input
                  value={formGeneral.customerName}
                  onChange={(e) =>
                    setFormGeneral({
                      ...formGeneral,
                      customerName: e.target.value,
                    })
                  }
                  placeholder="Juan Pérez"
                  className="border-border/50"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">DNI</Label>
                <Input
                  value={formGeneral.customerDni}
                  onChange={(e) =>
                    setFormGeneral({
                      ...formGeneral,
                      customerDni: e.target.value,
                    })
                  }
                  placeholder="12345678"
                  className="border-border/50"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Email</Label>
                <Input
                  type="email"
                  value={formGeneral.customerEmail}
                  onChange={(e) =>
                    setFormGeneral({
                      ...formGeneral,
                      customerEmail: e.target.value,
                    })
                  }
                  placeholder="juan@ejemplo.com"
                  className="border-border/50"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Teléfono</Label>
                <Input
                  value={formGeneral.customerPhone}
                  onChange={(e) =>
                    setFormGeneral({
                      ...formGeneral,
                      customerPhone: e.target.value,
                    })
                  }
                  placeholder="+54 9 11 1234-5678"
                  className="border-border/50"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Género</Label>
                <Select
                  value={formGeneral.gender}
                  onValueChange={(value: "hombre" | "mujer") =>
                    setFormGeneral({ ...formGeneral, gender: value })
                  }
                >
                  <SelectTrigger className="border-border/50">
                    <SelectValue placeholder="Seleccionar género" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hombre">Hombre</SelectItem>
                    <SelectItem value="mujer">Mujer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Método de Pago</Label>
                <Select
                  value={formGeneral.paymentMethod}
                  onValueChange={(value: any) =>
                    setFormGeneral({ ...formGeneral, paymentMethod: value })
                  }
                >
                  <SelectTrigger className="border-border/50">
                    <SelectValue placeholder="Seleccionar método" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Cantidad</Label>
                <Input
                  type="number"
                  min={1}
                  value={formGeneral.quantity}
                  onChange={(e) =>
                    setFormGeneral({
                      ...formGeneral,
                      quantity: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  className="border-border/50"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Disponible: {generalRemaining}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 p-4 flex items-center justify-between border border-blue-200/50 dark:border-blue-800/50">
              <span className="text-base font-semibold text-blue-900 dark:text-blue-100">
                Total a cobrar
              </span>
              <b className="text-2xl text-blue-600 dark:text-blue-400">
                ${generalTotal.toLocaleString("es-AR")}
              </b>
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 border-border/50 bg-transparent"
                onClick={() => setShowAddGeneral(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                Guardar Entrada General
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== Modal Agregar VIP ===== */}
      <Dialog open={showAddVip} onOpenChange={setShowAddVip}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg">
                <Crown className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl">
                  Agregar Entrada VIP
                </DialogTitle>
                <DialogDescription>
                  Precio por mesa (10 personas) desde la base de datos
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={addVip} className="space-y-6 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Nombre Completo</Label>
                <Input
                  value={formVip.customerName}
                  onChange={(e) =>
                    setFormVip({ ...formVip, customerName: e.target.value })
                  }
                  placeholder="Juan Pérez"
                  className="border-border/50"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">DNI</Label>
                <Input
                  value={formVip.customerDni}
                  onChange={(e) =>
                    setFormVip({ ...formVip, customerDni: e.target.value })
                  }
                  placeholder="12345678"
                  className="border-border/50"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Email</Label>
                <Input
                  type="email"
                  value={formVip.customerEmail}
                  onChange={(e) =>
                    setFormVip({ ...formVip, customerEmail: e.target.value })
                  }
                  placeholder="juan@ejemplo.com"
                  className="border-border/50"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Teléfono</Label>
                <Input
                  value={formVip.customerPhone}
                  onChange={(e) =>
                    setFormVip({ ...formVip, customerPhone: e.target.value })
                  }
                  placeholder="+54 9 11 1234-5678"
                  className="border-border/50"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Cantidad de Mesas</Label>
                <Input
                  type="number"
                  min={1}
                  value={formVip.quantity}
                  onChange={(e) =>
                    setFormVip({
                      ...formVip,
                      quantity: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  className="border-border/50"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Mesas disponibles: {vipRemainingTables}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Método de Pago</Label>
                <Select
                  value={formVip.paymentMethod}
                  onValueChange={(value: any) =>
                    setFormVip({ ...formVip, paymentMethod: value })
                  }
                >
                  <SelectTrigger className="border-border/50">
                    <SelectValue placeholder="Seleccionar método" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/50 dark:to-orange-950/50 p-4 flex items-center justify-between border border-amber-200/50 dark:border-amber-800/50">
              <span className="text-base font-semibold text-amber-900 dark:text-amber-100">
                Total a cobrar
              </span>
              <b className="text-2xl text-amber-600 dark:text-amber-400">
                ${vipTotal.toLocaleString("es-AR")}
              </b>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 border-border/50 bg-transparent"
                onClick={() => setShowAddVip(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white"
              >
                Guardar VIP
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== Modal Editar Ticket ===== */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <Edit className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <DialogTitle className="text-xl">Editar Entrada</DialogTitle>
                <DialogDescription>
                  Modifica los datos de la entrada
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleUpdateTicket} className="space-y-5 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Nombre Completo</Label>
                <Input
                  value={editForm.customerName}
                  onChange={(e) =>
                    setEditForm({ ...editForm, customerName: e.target.value })
                  }
                  className="border-border/50"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">DNI</Label>
                <Input
                  value={editForm.customerDni}
                  onChange={(e) =>
                    setEditForm({ ...editForm, customerDni: e.target.value })
                  }
                  placeholder="12345678"
                  className="border-border/50"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Email</Label>
                <Input
                  type="email"
                  value={editForm.customerEmail}
                  onChange={(e) =>
                    setEditForm({ ...editForm, customerEmail: e.target.value })
                  }
                  className="border-border/50"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Teléfono</Label>
                <Input
                  value={editForm.customerPhone}
                  onChange={(e) =>
                    setEditForm({ ...editForm, customerPhone: e.target.value })
                  }
                  className="border-border/50"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tipo de Entrada</Label>
                <Select
                  value={editForm.ticketType}
                  onValueChange={(value: "general" | "vip") =>
                    setEditForm({ ...editForm, ticketType: value })
                  }
                >
                  <SelectTrigger className="border-border/50">
                    <SelectValue placeholder="Seleccionar tipo de entrada" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="vip">VIP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editForm.ticketType === "general" && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Género</Label>
                  <Select
                    value={editForm.gender || "hombre"}
                    onValueChange={(value: "hombre" | "mujer") =>
                      setEditForm({ ...editForm, gender: value })
                    }
                  >
                    <SelectTrigger className="border-border/50">
                      <SelectValue placeholder="Seleccionar género" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hombre">Hombre</SelectItem>
                      <SelectItem value="mujer">Mujer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Método de Pago</Label>
                <Select
                  value={editForm.paymentMethod}
                  onValueChange={(value: any) =>
                    setEditForm({ ...editForm, paymentMethod: value })
                  }
                >
                  <SelectTrigger className="border-border/50">
                    <SelectValue placeholder="Seleccionar método" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Precio Total</Label>
                <Input
                  type="number"
                  value={editForm.totalPrice}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      totalPrice: Number(e.target.value),
                    })
                  }
                  className="border-border/50"
                />
                <p className="text-xs text-muted-foreground">
                  El servidor usa el precio de BD cuando haya configuración
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1 border-border/50 bg-transparent"
                onClick={() => setShowEditModal(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                Guardar Cambios
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== Modal Configurar precios y cupos ===== */}
      <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <SlidersHorizontal className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <DialogTitle className="text-xl">
                  Configurar precios y cupos
                </DialogTitle>
                <DialogDescription>
                  Definí el <b>stock TOTAL (personas)</b>, precios por género y
                  la configuración VIP (por mesa).
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={saveConfig} className="space-y-6 pt-4">
            {/* STOCK TOTAL (PERSONAS) */}
            <div className="rounded-xl border border-border/50 p-5 space-y-4 bg-white/50 dark:bg:black/20">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-lg">
                  Stock TOTAL (personas)
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Cupo total (personas)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={configForm.totalLimitPersons}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        totalLimitPersons: Number(e.target.value),
                      })
                    }
                    className="border-border/50"
                    required
                  />
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Vendidos:</span>
                    <b className="text-foreground">
                      {cfg?.totals?.soldPersons ?? 0}
                    </b>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-muted-foreground">Restantes:</span>
                    <b className="text-foreground">
                      {cfg?.totals?.remainingPersons ?? 0}
                    </b>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                * El total descuenta automáticamente las personas equivalentes a
                las mesas VIP (1 mesa = {cfg?.totals?.unitVipSize ?? 10}{" "}
                personas).
              </p>
            </div>

            {/* General Hombre */}
            <div className="rounded-xl border border-border/50 p-5 space-y-4  bg-white/50 dark:bg-black/20">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                  <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <h4 className="font-semibold text-lg">
                  Entrada General — Hombre
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Precio (ARS)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={configForm.genHPrice}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        genHPrice: Number(e.target.value),
                      })
                    }
                    className="border-border/50"
                    required
                  />
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Vendidos (H):</span>
                    <b className="text-foreground">
                      {cfg?.tickets.general.hombre?.sold ?? 0}
                    </b>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                * No hay cupo por género. El stock es TOTAL para el evento.
              </p>
            </div>

            {/* General Mujer */}
            <div className="rounded-xl border border-border/50 p-5 space-y-4  bg-white/50 dark:bg-black/20">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-pink-100 dark:bg-pink-950 flex items-center justify-center">
                  <Users className="w-4 h-4 text-pink-600 dark:text-pink-400" />
                </div>
                <h4 className="font-semibold text-lg">
                  Entrada General — Mujer
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Precio (ARS)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={configForm.genMPrice}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        genMPrice: Number(e.target.value),
                      })
                    }
                    className="border-border/50"
                    required
                  />
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Vendidos (M):</span>
                    <b className="text-foreground">
                      {cfg?.tickets.general.mujer?.sold ?? 0}
                    </b>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                * No hay cupo por género. El stock es TOTAL para el evento.
              </p>
            </div>

            {/* VIP (por mesa) */}
            <div className="rounded-xl border border-amber-200/50 dark:border-amber-800/50 p-5 space-y-4 bg-gradient-to-br from-amber-50/50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/20">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-sm">
                  <Crown className="w-4 h-4 text-white" />
                </div>
                <h4 className="font-semibold text-lg">
                  Entrada VIP (por mesa)
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Precio por mesa (ARS)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={configForm.vipPrice}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        vipPrice: Number(e.target.value),
                      })
                    }
                    className="border-border/50"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Cupo VIP (PERSONAS)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={configForm.vipLimitPersons}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        vipLimitPersons: Number(e.target.value),
                      })
                    }
                    className="border-border/50"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    (1 mesa ={" "}
                    {cfg?.tickets.vip?.unitSize ??
                      cfg?.totals?.unitVipSize ??
                      10}{" "}
                    personas)
                  </p>
                </div>
              </div>

              <div className="rounded-lg bg-amber-100/50 dark:bg-amber-950/30 p-3 text-sm border border-amber-200/50 dark:border-amber-800/50">
                <div className="flex items-center justify-between">
                  <span className="text-amber-900 dark:text-amber-100">
                    Vendidas (personas):
                  </span>
                  <b className="text-amber-900 dark:text-amber-100">
                    {cfg?.tickets.vip?.sold ?? 0}
                  </b>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-amber-900 dark:text-amber-100">
                    Restantes:
                  </span>
                  <b className="text-amber-900 dark:text-amber-100">
                    {cfg?.tickets.vip?.remaining ?? 0} personas (
                    {cfg?.tickets.vip?.remainingTables ?? 0} mesas)
                  </b>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1 border-border/50 bg-transparent"
                onClick={() => setShowConfigModal(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                Guardar configuración
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <DiscountsModal
        open={showDiscountsModal}
        onOpenChange={setShowDiscountsModal}
      />

      {/* Modal QR grande */}
      <Dialog open={qrModalOpen} onOpenChange={setQrModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader className="pb-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <QrCode className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <DialogTitle className="text-xl">QR de validación</DialogTitle>
                <DialogDescription>
                  Escaneá este QR para abrir la verificación
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-6">
            {qrModalCode && (
              <code className="text-sm bg-muted/60 px-3 py-2 rounded-lg font-mono border border-border/50">
                {qrModalCode}
              </code>
            )}
            {qrModalSrc ? (
              <a
                href={qrModalCode ? buildValidateUrl(qrModalCode) : "#"}
                target="_blank"
                rel="noreferrer"
                title="Abrir página de verificación"
                className="block group"
              >
                <img
                  src={qrModalSrc || "/placeholder.svg"}
                  alt="QR grande"
                  className="rounded-2xl border-2 border-border shadow-lg w-72 h-72 object-contain group-hover:shadow-xl transition-shadow"
                />
              </a>
            ) : (
              <div className="w-72 h-72 rounded-2xl border-2 border-dashed border-border flex items-center justify-center">
                <div className="text-center">
                  <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                  <p className="text-muted-foreground text-sm">Generando QR…</p>
                </div>
              </div>
            )}
            <Button
              variant="outline"
              onClick={() => setQrModalOpen(false)}
              className="w-full border-border/50"
            >
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
