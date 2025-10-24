// app/admin/dashboard/types.ts

export type TableLocation = "piscina" | "dj" | "general";

export type VipAvailability = {
  ok: boolean;
  eventId: string;
  location: TableLocation;
  limit: number | null;
  taken: number[];
  remainingTables: number | null;
  price: number | null;
  capacityPerTable: number | null;
};

/**
 * Estados de pago compatibles con el backend (Prisma enum PaymentStatus)
 */
export type PaymentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "in_process"
  | "failed_preference"
  | "cancelled"
  | "refunded"
  | "charged_back";

export interface AdminTicket {
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
  paymentStatus: PaymentStatus; // <-- expandido
  qrCode?: string | null;
  validationCode?: string | null;
  validated: boolean;
  purchaseDate: string;
  expiresAt?: string | null; // <-- para timeout de pendientes
  tableNumber?: number | null;
  tableNumbers?: number[] | null;
  tableLocation?: TableLocation | null;
}

export type AddGeneralForm = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDni: string;
  gender: "hombre" | "mujer";
  paymentMethod: "efectivo" | "transferencia" | "mercadopago";
  quantity: number;
};

export type AddVipForm = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDni: string;
  paymentMethod: "efectivo" | "transferencia" | "mercadopago";
  tableLocation: TableLocation;
};

export type AdminForm = {
  ticketType: "general" | "vip";
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDni: string;
  gender: "hombre" | "mujer" | "";
  paymentMethod: "efectivo" | "transferencia" | "mercadopago";
  totalPrice: number;
};

export type DiscountCfg = {
  id?: string;
  ticketType: "general" | "vip";
  minQty: number;
  type: "percent" | "amount";
  value: number;
  priority?: number;
  isActive?: boolean;
};

export type TicketsConfig = {
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
      limit: number;
      sold: number;
      remaining: number;
      unitSize: number;
      remainingTables: number;
    } | null;
  };
  vipTables: Array<{
    location: TableLocation;
    price: number;
    limit: number;
    sold: number;
    remaining: number;
    capacityPerTable?: number | null;
    startNumber?: number | null;
    endNumber?: number | null;
  }>;
};
