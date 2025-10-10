// app/admin/dashboard/page.tsx
"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import QRCode from "qrcode";

/* =========================
   Tipos
========================= */
interface AdminTicket {
  id: string;
  ticketType: string;
  quantity: number;
  totalPrice: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDni?: string;
  gender?: string;
  paymentMethod: string;
  paymentStatus: "pending" | "approved" | "rejected";
  qrCode?: string;
  validationCode?: string;
  validated: boolean;
  purchaseDate: string;
}

type AdminForm = {
  ticketType: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDni: string;
  gender: string;
  paymentMethod: string;
  totalPrice: number;
};

/* =========================
   Helpers QR
========================= */
function buildValidateUrl(code: string) {
  // La página que abre el QR: /admin/validate?code=XXXXXX
  if (typeof window !== "undefined") {
    return `${window.location.origin}/admin/validate?code=${encodeURIComponent(code)}`;
  }
  return `/admin/validate?code=${encodeURIComponent(code)}`;
}

async function makeQrDataUrl(code: string, scale = 4) {
  const url = buildValidateUrl(code);
  return await QRCode.toDataURL(url, { margin: 1, scale });
}

/* =========================
   Fila tabla (sin hooks en el map del padre)
========================= */
function TicketRow({
  ticket,
  onApprove,
  onEdit,
  onDelete,
  onShowQr,
}: {
  ticket: AdminTicket;
  onApprove: (t: AdminTicket) => void;
  onEdit: (t: AdminTicket) => void;
  onDelete: (id: string) => void;
  onShowQr: (code: string) => void;
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
    <tr className="border-b hover:bg-muted/50">
      <td className="p-2">
        <div>
          <p className="font-medium">{ticket.customerName}</p>
          <p className="text-sm text-muted-foreground">
            {ticket.customerEmail}
          </p>
        </div>
      </td>
      <td className="p-2">{ticket.customerDni || "-"}</td>
      <td className="p-2 capitalize">{ticket.ticketType}</td>
      <td className="p-2 capitalize">{ticket.gender || "-"}</td>
      <td className="p-2">
        ${(Number(ticket.totalPrice) || 0).toLocaleString()}
      </td>
      <td className="p-2 capitalize">{ticket.paymentMethod}</td>
      <td className="p-2">
        <span
          className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
            ticket.paymentStatus === "approved"
              ? "bg-green-100 text-green-800"
              : ticket.paymentStatus === "rejected"
                ? "bg-red-100 text-red-800"
                : "bg-yellow-100 text-yellow-800"
          }`}
        >
          {ticket.paymentStatus}
        </span>
      </td>
      <td className="p-2">
        <div className="flex items-center gap-2">
          <code className="text-xs bg-muted px-2 py-1 rounded">
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
              className="shrink-0"
            >
              <img
                src={qrSrc}
                alt="QR de validación"
                width={48}
                height={48}
                className="rounded border hover:opacity-80 transition"
              />
            </button>
          )}
        </div>
      </td>
      <td className="p-2 text-right">
        <div className="flex items-center justify-end gap-2">
          {ticket.paymentStatus !== "approved" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onApprove(ticket)}
            >
              Aprobar
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => onEdit(ticket)}>
            <Edit className="w-4 h-4 text-primary" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(ticket.id)}>
            <Trash2 className="w-4 h-4 text-destructive" />
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
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTicket, setEditingTicket] = useState<AdminTicket | null>(null);
  const [formData, setFormData] = useState<AdminForm>({
    ticketType: "general",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerDni: "",
    gender: "hombre",
    paymentMethod: "efectivo",
    totalPrice: 13000,
  });

  // Estado del modal de QR grande
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrModalCode, setQrModalCode] = useState<string | null>(null);
  const [qrModalSrc, setQrModalSrc] = useState<string | null>(null);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const response = await fetch("/api/admin/tickets");
      if (response.status === 401) {
        router.push("/admin/login");
        return;
      }
      const data = await response.json();

      // Normalizamos variantes legacy y "Code"
      const normalized: AdminTicket[] = (data.tickets || []).map((t: any) => ({
        ...t,
        customerDni:
          t.customerDni ?? t.customerDNI ?? t.customer_dni ?? t.dni ?? "",
        qrCode: t.qrCode ?? t.Code ?? undefined,
      }));

      setTickets(normalized);
    } catch (error) {
      console.error("[v0] Error fetching tickets:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  };

  const resetForm = () =>
    setFormData({
      ticketType: "general",
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      customerDni: "",
      gender: "hombre",
      paymentMethod: "efectivo",
      totalPrice: 13000,
    });

  const handleAddTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch("/api/admin/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setShowAddModal(false);
        fetchTickets();
        resetForm();
      } else {
        const err = await response.json().catch(() => ({}));
        console.error("[v0] Error adding ticket:", err);
      }
    } catch (error) {
      console.error("[v0] Error adding ticket:", error);
    }
  };

  const handleEditTicket = (ticket: AdminTicket) => {
    setEditingTicket(ticket);
    setFormData({
      ticketType: ticket.ticketType,
      customerName: ticket.customerName,
      customerEmail: ticket.customerEmail,
      customerPhone: ticket.customerPhone,
      customerDni: ticket.customerDni || "",
      gender: ticket.gender || "hombre",
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
        method: "PATCH", // coincide con tu route.ts
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingTicket.id,
          ...formData,
        }),
      });

      if (response.ok) {
        setShowEditModal(false);
        setEditingTicket(null);
        fetchTickets();
        resetForm();
      } else {
        const err = await response.json().catch(() => ({}));
        console.error("[v0] Error updating ticket:", err);
      }
    } catch (error) {
      console.error("[v0] Error updating ticket:", error);
    }
  };

  const approveTicket = async (ticket: AdminTicket) => {
    try {
      const resp = await fetch("/api/admin/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: ticket.id,
          paymentStatus: "approved",
        }),
      });
      if (resp.ok) {
        fetchTickets();
      } else {
        const err = await resp.json().catch(() => ({}));
        console.error("[v0] Error approving ticket:", err);
      }
    } catch (e) {
      console.error("[v0] Error approving ticket:", e);
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
        console.error("[v0] Error deleting ticket:", err);
      }
    } catch (error) {
      console.error("[v0] Error deleting ticket:", error);
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
        const dataUrl = await makeQrDataUrl(qrModalCode, 8); // más grande
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-display font-bold">
            Panel de Administración
          </h1>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => router.push("/admin/validate")}
            >
              Validar QR
            </Button>
            <Button variant="ghost" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Entradas
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Validadas</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.validated}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ingresos</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${stats.revenue.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Entradas Vendidas</CardTitle>
                <CardDescription>
                  Gestiona todas las entradas del evento
                </CardDescription>
              </div>
              <Button onClick={() => setShowAddModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Agregar Entrada
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">
                Cargando...
              </p>
            ) : tickets.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                No hay entradas registradas
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Cliente</th>
                      <th className="text-left p-2">DNI</th>
                      <th className="text-left p-2">Tipo</th>
                      <th className="text-left p-2">Género</th>
                      <th className="text-left p-2">Precio</th>
                      <th className="text-left p-2">Método Pago</th>
                      <th className="text-left p-2">Estado</th>
                      <th className="text-left p-2">Código</th>
                      <th className="text-right p-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((t) => (
                      <TicketRow
                        key={t.id}
                        ticket={t}
                        onApprove={approveTicket}
                        onEdit={handleEditTicket}
                        onDelete={handleDeleteTicket}
                        onShowQr={openQrModal}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Modal Agregar */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agregar Entrada Manual</DialogTitle>
            <DialogDescription>
              Para pagos en efectivo o transferencia
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddTicket} className="space-y-4">
            {/* Nombre */}
            <div className="space-y-2">
              <Label>Nombre Completo</Label>
              <Input
                value={formData.customerName}
                onChange={(e) =>
                  setFormData({ ...formData, customerName: e.target.value })
                }
                required
              />
            </div>

            {/* DNI */}
            <div className="space-y-2">
              <Label>DNI</Label>
              <Input
                value={formData.customerDni}
                onChange={(e) =>
                  setFormData({ ...formData, customerDni: e.target.value })
                }
                placeholder="12345678"
                required
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.customerEmail}
                onChange={(e) =>
                  setFormData({ ...formData, customerEmail: e.target.value })
                }
                required
              />
            </div>

            {/* Teléfono */}
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input
                value={formData.customerPhone}
                onChange={(e) =>
                  setFormData({ ...formData, customerPhone: e.target.value })
                }
                required
              />
            </div>

            {/* Género (con ajuste de precio si querés mantenerlo) */}
            <div className="space-y-2">
              <Label>Género</Label>
              <Select
                value={formData.gender}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    gender: value,
                    // si querés mantener el precio según género:
                    totalPrice: value === "hombre" ? 13000 : 11000,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar género" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hombre">Hombre - $13.000</SelectItem>
                  <SelectItem value="mujer">Mujer - $11.000</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Método de pago */}
            <div className="space-y-2">
              <Label>Método de Pago</Label>
              <Select
                value={formData.paymentMethod}
                onValueChange={(value) =>
                  setFormData({ ...formData, paymentMethod: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar método" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tipo de Entrada */}
            <div className="space-y-2">
              <Label>Tipo de Entrada</Label>
              <Select
                value={formData.ticketType}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    ticketType: value,
                    // si querés que VIP setee un precio base por defecto, descomenta:
                    // totalPrice: value === "vip" ? 50000 : formData.totalPrice,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo de entrada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="vip">VIP / Mesa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Precio Total */}
            <div className="space-y-2">
              <Label>Precio Total</Label>
              <Input
                type="number"
                value={formData.totalPrice}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    totalPrice: Number(e.target.value),
                  })
                }
                required
              />
            </div>

            <Button type="submit" className="w-full">
              Agregar Entrada
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Editar */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Entrada</DialogTitle>
            <DialogDescription>
              Modifica los datos de la entrada
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateTicket} className="space-y-4">
            {/* Nombre */}
            <div className="space-y-2">
              <Label>Nombre Completo</Label>
              <Input
                value={formData.customerName}
                onChange={(e) =>
                  setFormData({ ...formData, customerName: e.target.value })
                }
                required
              />
            </div>

            {/* DNI */}
            <div className="space-y-2">
              <Label>DNI</Label>
              <Input
                value={formData.customerDni}
                onChange={(e) =>
                  setFormData({ ...formData, customerDni: e.target.value })
                }
                placeholder="12345678"
                required
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.customerEmail}
                onChange={(e) =>
                  setFormData({ ...formData, customerEmail: e.target.value })
                }
                required
              />
            </div>

            {/* Teléfono */}
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input
                value={formData.customerPhone}
                onChange={(e) =>
                  setFormData({ ...formData, customerPhone: e.target.value })
                }
                required
              />
            </div>

            {/* Género */}
            <div className="space-y-2">
              <Label>Género</Label>
              <Select
                value={formData.gender}
                onValueChange={(value) =>
                  setFormData({ ...formData, gender: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar género" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hombre">Hombre</SelectItem>
                  <SelectItem value="mujer">Mujer</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tipo de Entrada */}
            <div className="space-y-2">
              <Label>Tipo de Entrada</Label>
              <Select
                value={formData.ticketType}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    ticketType: value,
                    // si querés tocar precio automático al cambiar:
                    // totalPrice: value === "vip" ? Math.max(formData.totalPrice, 50000) : formData.totalPrice,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo de entrada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="vip">VIP / Mesa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Precio Total */}
            <div className="space-y-2">
              <Label>Precio Total</Label>
              <Input
                type="number"
                value={formData.totalPrice}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    totalPrice: Number(e.target.value),
                  })
                }
                required
              />
            </div>

            {/* Botones */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 bg-transparent"
                onClick={() => setShowEditModal(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1">
                Guardar Cambios
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal QR grande */}
      <Dialog open={qrModalOpen} onOpenChange={setQrModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>QR de validación</DialogTitle>
            <DialogDescription>
              Escaneá este QR para abrir la verificación.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3 py-2">
            {qrModalCode && (
              <code className="text-sm bg-muted px-2 py-1 rounded">
                {qrModalCode}
              </code>
            )}

            {qrModalSrc ? (
              <a
                href={qrModalCode ? buildValidateUrl(qrModalCode) : "#"}
                target="_blank"
                rel="noreferrer"
                title="Abrir página de verificación"
                className="block"
              >
                <img
                  src={qrModalSrc}
                  alt="QR grande"
                  className="rounded-lg border shadow-sm w-64 h-64 object-contain"
                />
              </a>
            ) : (
              <p className="text-muted-foreground text-sm">Generando QR…</p>
            )}

            <div className="flex gap-2 mt-2">
              {qrModalCode && (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      buildValidateUrl(qrModalCode)
                    );
                  }}
                >
                  Copiar enlace
                </Button>
              )}
              <Button variant="outline" onClick={() => setQrModalOpen(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
