// app/api/admin/tickets/discounts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";
import { Prisma, DiscountType, Gender } from "@prisma/client";

/* =========================
   Auth (igual que en /api/admin/tickets)
========================= */
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);

async function verifyAuth(request: NextRequest) {
  const token = request.cookies.get("admin-token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

/* =========================
   Utils
========================= */
function json(payload: any, init?: number | ResponseInit) {
  const initObj: ResponseInit =
    typeof init === "number" ? { status: init } : init || {};
  const headers = new Headers(initObj.headers || {});
  headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return NextResponse.json(payload, { ...initObj, headers });
}

const s = (v: unknown) =>
  v === undefined || v === null ? undefined : String(v).trim();

const n = (v: unknown, def?: number) => {
  if (v === undefined || v === null || v === "") return def;
  const num = Number(v);
  return Number.isFinite(num) ? num : def;
};

const b = (v: unknown, def = false) => {
  if (typeof v === "boolean") return v;
  const str = s(v)?.toLowerCase();
  if (str === "true" || str === "1" || str === "yes" || str === "si")
    return true;
  if (str === "false" || str === "0" || str === "no") return false;
  return def;
};

function toTicketType(v?: string): "general" | "vip" | undefined {
  const t = (v || "").toLowerCase();
  return t === "general" || t === "vip" ? t : undefined;
}
function toDiscountType(v?: string): DiscountType | undefined {
  const t = (v || "").toLowerCase();
  return t === "percent" ? "percent" : t === "amount" ? "amount" : undefined;
}

/** gender: admite "hombre" | "mujer" | "null" (string) -> null; undefined = no-proveer */
function parseGenderParam(raw: string | null): Gender | null | undefined {
  if (raw === null) return undefined; // no filtrar
  const t = (raw || "").toLowerCase();
  if (!t || t === "null") return null;
  if (t === "hombre") return "hombre";
  if (t === "mujer") return "mujer";
  return undefined; // inválido
}

async function getActiveEventId() {
  const ev = await prisma.event.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  return ev?.id || null;
}

/* =========================
   GET /api/admin/tickets/discounts
   Filtros opcionales: ticketType=general|vip, isActive=true|false, gender=hombre|mujer|null
========================= */
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth) return json({ error: "Unauthorized" }, 401);

  try {
    const eventId = await getActiveEventId();
    if (!eventId) return json({ error: "No hay evento activo" }, 400);

    const sp = request.nextUrl.searchParams;
    const ticketType = toTicketType(sp.get("ticketType") || undefined);
    const isActiveRaw = sp.get("isActive");
    const genderParsed = parseGenderParam(sp.get("gender"));

    if (sp.has("gender") && genderParsed === undefined) {
      return json({ error: "Parámetro gender inválido" }, 400);
    }

    const where: any = { eventId };
    if (ticketType) where.ticketType = ticketType;
    if (isActiveRaw !== null) where.isActive = b(isActiveRaw, true);
    if (genderParsed !== undefined) where.gender = genderParsed;

    const rules = await prisma.discountRule.findMany({
      where,
      orderBy: [
        { ticketType: "asc" },
        { minQty: "asc" },
        { priority: "desc" }, // mayor prioridad desempata
        { createdAt: "asc" },
      ],
    });

    return json({ ok: true, rules });
  } catch (e) {
    console.error("[discounts][GET] error:", e);
    return json({ error: "Error al listar descuentos" }, 500);
  }
}

/* =========================
   POST /api/admin/tickets/discounts
   Body:
   {
     ticketType: "general" | "vip",
     minQty: number,
     type: "percent" | "amount",
     value: number,
     priority?: number,
     isActive?: boolean,
     gender?: "hombre" | "mujer" | null
   }
========================= */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth) return json({ error: "Unauthorized" }, 401);

  try {
    const eventId = await getActiveEventId();
    if (!eventId) return json({ error: "No hay evento activo" }, 400);

    const body = (await request.json().catch(() => ({}))) as any;

    const ticketType = toTicketType(s(body.ticketType));
    const minQty = n(body.minQty);
    const dType = toDiscountType(s(body.type));
    const value = n(body.value);
    const priority = n(body.priority, 0) ?? 0;
    const isActive = body.isActive !== undefined ? b(body.isActive) : true;

    // gender: por defecto null
    let finalGender: Gender | null = null;
    if (body.gender !== undefined) {
      const g = parseGenderParam(String(body.gender));
      if (g === undefined) return json({ error: "gender inválido" }, 400);
      finalGender = g ?? null;
    }

    // Validaciones
    if (!ticketType) return json({ error: "ticketType inválido" }, 400);
    if (typeof minQty !== "number" || minQty < 1)
      return json({ error: "minQty debe ser >= 1" }, 400);
    if (!dType) return json({ error: "type inválido" }, 400);
    if (typeof value !== "number" || value < 0)
      return json({ error: "value debe ser >= 0" }, 400);
    if (dType === "percent" && (value <= 0 || value > 100))
      return json(
        { error: "Para percent, value debe estar entre 1 y 100" },
        400
      );

    try {
      const rule = await prisma.discountRule.create({
        data: {
          eventId,
          ticketType,
          gender: finalGender,
          minQty,
          type: dType,
          value: new Prisma.Decimal(value),
          priority,
          isActive,
        },
      });
      return json({ ok: true, rule }, 201);
    } catch (e: any) {
      if (e?.code === "P2002") {
        // Unique(eventId, ticketType, gender, minQty)
        return json(
          {
            error:
              "Ya existe una regla con ese ticketType / gender / minQty para el evento",
          },
          409
        );
      }
      throw e;
    }
  } catch (e) {
    console.error("[discounts][POST] error:", e);
    return json({ error: "Error al crear descuento" }, 500);
  }
}

/* =========================
   PATCH /api/admin/tickets/discounts
   Body (se requiere id):
   {
     id: string,
     ticketType?: "general" | "vip",
     minQty?: number,
     type?: "percent" | "amount",
     value?: number,
     priority?: number,
     isActive?: boolean,
     gender?: "hombre" | "mujer" | null
   }
========================= */
export async function PATCH(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth) return json({ error: "Unauthorized" }, 401);

  try {
    const eventId = await getActiveEventId();
    if (!eventId) return json({ error: "No hay evento activo" }, 400);

    const body = (await request.json().catch(() => ({}))) as any;
    const id = s(body.id);
    if (!id) return json({ error: "id requerido" }, 400);

    const data: any = {};

    if (body.ticketType !== undefined) {
      const tt = toTicketType(s(body.ticketType));
      if (!tt) return json({ error: "ticketType inválido" }, 400);
      data.ticketType = tt;
    }

    if (body.minQty !== undefined) {
      const mq = n(body.minQty);
      if (typeof mq !== "number" || mq < 1)
        return json({ error: "minQty debe ser >= 1" }, 400);
      data.minQty = mq;
    }

    if (body.type !== undefined) {
      const dt = toDiscountType(s(body.type));
      if (!dt) return json({ error: "type inválido" }, 400);
      data.type = dt;
    }

    if (body.value !== undefined) {
      const val = n(body.value);
      if (typeof val !== "number" || val < 0)
        return json({ error: "value debe ser >= 0" }, 400);

      // validar rango si (o queda) percent
      const current = await prisma.discountRule.findUnique({
        where: { id },
        select: { type: true },
      });
      const effectiveType = (data.type ?? current?.type) as
        | DiscountType
        | undefined;

      if (effectiveType === "percent" && (val <= 0 || val > 100)) {
        return json(
          { error: "Para percent, value debe estar entre 1 y 100" },
          400
        );
      }
      data.value = new Prisma.Decimal(val);
    }

    if (body.priority !== undefined) {
      const p = n(body.priority, 0);
      if (typeof p !== "number")
        return json({ error: "priority inválida" }, 400);
      data.priority = p;
    }

    if (body.isActive !== undefined) {
      data.isActive = b(body.isActive);
    }

    if (body.gender !== undefined) {
      const g = parseGenderParam(String(body.gender));
      if (g === undefined) return json({ error: "gender inválido" }, 400);
      data.gender = g ?? null;
    }

    try {
      // (no cambiamos eventId; solo editamos por id)
      const updated = await prisma.discountRule.update({
        where: { id },
        data,
      });
      return json({ ok: true, rule: updated });
    } catch (e: any) {
      if (e?.code === "P2002") {
        return json(
          {
            error:
              "Ya existe una regla con esa combinación (ticketType / gender / minQty) en este evento",
          },
          409
        );
      }
      if (e?.code === "P2025") {
        return json({ error: "Regla no encontrada" }, 404);
      }
      throw e;
    }
  } catch (e) {
    console.error("[discounts][PATCH] error:", e);
    return json({ error: "Error al actualizar descuento" }, 500);
  }
}

/* =========================
   DELETE /api/admin/tickets/discounts?id=...
========================= */
export async function DELETE(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth) return json({ error: "Unauthorized" }, 401);

  try {
    const eventId = await getActiveEventId();
    if (!eventId) return json({ error: "No hay evento activo" }, 400);

    const sp = request.nextUrl.searchParams;
    const id = s(sp.get("id"));
    if (!id) return json({ error: "id requerido" }, 400);

    // Borrar por id + eventId para no tocar reglas de otros eventos
    const deleted = await prisma.discountRule.deleteMany({
      where: { id, eventId },
    });
    if (deleted.count === 0) {
      return json({ error: "Regla no encontrada" }, 404);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("[discounts][DELETE] error:", e);
    return json({ error: "Error al eliminar descuento" }, 500);
  }
}
