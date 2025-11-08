/**
 * ============================================================
 * 🔸 TYPES ACTUALIZADOS (Next.js + Prisma) — alineados al schema
 * ============================================================
 */

/** Enums (como string unions para el front) */
export type PaymentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "in_process"
  | "failed_preference"
  | "cancelled"
  | "refunded"
  | "charged_back";

export type VipTableStatus = "available" | "reserved" | "sold" | "blocked";

export type TicketType = "general" | "vip";
export type Gender = "hombre" | "mujer";

/** Ubicación VIP (modelo VipLocation) */
export interface VipLocation {
  id: string;
  eventId: string;
  name: string;          // Ej: "DJ", "Piscina", "General"
  order: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Configuración de mesas por ubicación (modelo VipTableConfig) */
export interface VipTableConfig {
  id: string;
  eventId: string;
  vipLocationId: string;
  mapUrl: string | null;      // String? en schema

  price: number;               // Decimal en BD -> number en UI
  stockLimit: number;
  capacityPerTable: number;
  soldCount: number;           // default(0) en schema

  createdAt?: string;
  updatedAt?: string;

  vipLocation?: Pick<VipLocation, "id" | "name">;
}

/** Mesa VIP (modelo VipTable) */
export interface VipTable {
  id: string;
  eventId: string;
  vipLocationId: string;
  limit: number;
  sold: number;       // Int? en schema

  vipTableConfigId: string | null; // String? en schema
  tableNumber: number;
  price: number;                   // Decimal en BD -> number en UI
  capacityPerTable: number;
  status: VipTableStatus;

  createdAt?: string;
  updatedAt?: string;

  vipLocation?: VipLocation;
  vipTableConfig?: VipTableConfig | null;
}

/** Disponibilidad por ubicación (respuesta /vip-tables/availability) */
export interface VipAvailability {
  ok: boolean;
  eventId: string;
  vipLocationId: string;
  locationName: string;

  limit: number | null;               // total global/rango si aplica
  taken: number[];                    // mesas ocupadas (global o por sector)
  remainingTables: number | null;     // libres en el sector
  price: number | null;
  capacityPerTable: number | null;

  // opcionales si la API los expone
  startNumber?: number | null;
  endNumber?: number | null;
  takenLocal?: number[];              // ocupadas en numeración local (1..stockLimit)
}

/** Ticket (ADMIN view) */
export interface AdminTicket {
  id: string;
  ticketType: TicketType;
  quantity: number;
  totalPrice: number;

  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDni?: string;

  gender?: Gender | null;
  paymentMethod: "efectivo" | "transferencia" | "mercadopago";
  paymentStatus: PaymentStatus;

  qrCode?: string | null;
  validationCode?: string | null;
  validated: boolean;

  purchaseDate: string;
  expiresAt?: string | null;

  // Relaciones VIP
  vipLocationId?: string | null;
  vipLocationName?: string | null;
  vipTableId?: string | null;
  vipTableNumber?: number | null;

  /** 👇 Añadí esta relación opcional */
  vipTable?: {
    id: string;
    tableNumber: number;
    status?: VipTableStatus;
  } | null;
}

/** Formularios */
export interface AddGeneralForm {
  eventId?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDni: string;
  gender: "hombre" | "mujer";
  paymentMethod: "efectivo" | "transferencia" | "mercadopago";
  quantity: number;
}

export type AddVipForm = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDni: string;
  paymentMethod: "efectivo" | "transferencia" | "mercadopago";
  vipLocationId: string; // ✅ reemplaza el viejo TableLocation
};

/** Formulario administrativo combinado */
export interface AdminForm {
  customerName: string;
  customerDni: string;
  customerEmail: string;
  customerPhone: string;
  ticketType: TicketType; // "general" | "vip"
  gender?: Gender | "";   // vacío si es VIP
  paymentMethod: "efectivo" | "transferencia" | "mercadopago";
  totalPrice: number;

  // VIP
  vipLocationId?: string | null;
  vipTableNumber?: number | null;
}



/** Descuentos (modelo DiscountRule simplificado al front) */
export interface DiscountCfg {
  id?: string;
  ticketType: TicketType;
  minQty: number;
  type: "percent" | "amount";
  value: number;
  priority?: number;
  isActive?: boolean;
}

/** Config global del evento (respuesta /admin/tickets/config) */
export interface TicketsConfig {
  eventId: string;
  eventName: string;
  eventDate: string; // ISO yyyy-mm-dd
  isActive: boolean;

  totals: {
    unitVipSize: number;       // personas por mesa (default 10)
    limitPersons: number;      // cupo total de personas (ticketType "total")
    soldPersons: number;       // vendidos (general + vip personas)
    remainingPersons: number;  // restantes
    // opcional si la API lo expone:
    totalTables?: number;      // total de mesas enumeradas globalmente
  };

  tickets: {
    general: {
      hombre?: { price: number; limit: number; sold: number; remaining: number };
      mujer?:  { price: number; limit: number; sold: number; remaining: number };
    };
  };

  // Para UI de VIP (catálogo + configuración + mesas físicas opcionales)
  vipLocations: VipLocation[];
  vipConfigs: VipTableConfig[];
  vipTables?: VipTable[];
}
