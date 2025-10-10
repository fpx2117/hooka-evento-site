// app/api/tickets/config/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 1 mesa VIP = N personas (default 10)
const VIP_UNIT_SIZE = Number(process.env.VIP_UNIT_SIZE || 10);

// ============ Utils ============
function json(payload: any, init?: number | ResponseInit) {
  const initObj: ResponseInit =
    typeof init === "number" ? { status: init } : init || {};
  const headers = new Headers(initObj.headers || {});
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return NextResponse.json(payload, { ...initObj, headers });
}

function toNumber(v: any, def?: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : (def as number);
}

async function getOrCreateActiveEvent() {
  // Busca evento activo y trae sus configs
  let event = await prisma.event.findFirst({
    where: { isActive: true },
    include: { ticketConfig: true, vipConfigs: true },
  });

  if (!event) {
    const name = (process.env.EVENT_NAME || "Evento").trim();
    const code = (process.env.EVENT_CODE || "DEFAULT").trim();
    const dateStr = (process.env.EVENT_DATE || "2025-11-02").trim();
    const date = new Date(`${dateStr}T00:00:00Z`);

    const created = await prisma.event.create({
      data: { code, name, date, isActive: true },
    });

    // Configs mínimas iniciales (precios = 0, límites = 0)
    await prisma.ticketConfig.createMany({
      data: [
        // precios por género (sin cupo por género)
        {
          eventId: created.id,
          ticketType: "general",
          gender: "hombre",
          price: 0,
          stockLimit: 0,
        },
        {
          eventId: created.id,
          ticketType: "general",
          gender: "mujer",
          price: 0,
          stockLimit: 0,
        },
        // VIP/TOTAL: NO incluimos gender => queda NULL
        { eventId: created.id, ticketType: "vip", price: 0, stockLimit: 0 },
        { eventId: created.id, ticketType: "total", price: 0, stockLimit: 0 },
      ],
      skipDuplicates: true,
    });

    event = await prisma.event.findUnique({
      where: { id: created.id },
      include: { ticketConfig: true, vipConfigs: true },
    });
  }

  return event!;
}

function findCfg(
  event: { ticketConfig: any[] },
  ticketType: string,
  gender: "hombre" | "mujer" | null
) {
  return event.ticketConfig.find(
    (t) => t.ticketType === ticketType && t.gender === (gender as any)
  );
}

// ============ GET ===========
// Devuelve configuración del evento ACTIVO con stock TOTAL (en PERSONAS)
// VIP se expresa en PERSONAS; mesas restantes = floor(remaining / VIP_UNIT_SIZE)
export async function GET(_req: NextRequest) {
  try {
    const event = await getOrCreateActiveEvent();

    // Vendidos aprobados del evento (general por género)
    const [soldGenH, soldGenM] = await Promise.all([
      prisma.ticket.count({
        where: {
          eventId: event.id,
          ticketType: "general",
          gender: "hombre",
          paymentStatus: "approved",
        },
      }),
      prisma.ticket.count({
        where: {
          eventId: event.id,
          ticketType: "general",
          gender: "mujer",
          paymentStatus: "approved",
        },
      }),
    ]);

    // VIP: mesas vendidas = sum(quantity) tickets VIP (aprobados) del evento
    const vipTickets = await prisma.ticket.findMany({
      where: {
        eventId: event.id,
        ticketType: "vip",
        paymentStatus: "approved",
      },
      select: { quantity: true },
    });
    const vipTablesSold = vipTickets.reduce((a, t) => a + (t.quantity || 0), 0);
    const vipPersonsSold = vipTablesSold * VIP_UNIT_SIZE;

    // Configs de precios (general H/M)
    const cfgGenH = findCfg(event, "general", "hombre");
    const cfgGenM = findCfg(event, "general", "mujer");

    // VIP en PERSONAS (fila con gender NULL)
    const cfgVip = findCfg(event, "vip", null);
    const vipLimitPersons = cfgVip ? Number(cfgVip.stockLimit) : 0;
    const vipRemainingPersons = Math.max(0, vipLimitPersons - vipPersonsSold);
    const vipRemainingTables = Math.floor(vipRemainingPersons / VIP_UNIT_SIZE);

    // TOTAL en PERSONAS (fila con gender NULL)
    const cfgTotal = findCfg(event, "total", null);
    const totalLimitPersons = cfgTotal ? Number(cfgTotal.stockLimit) : 0;

    const soldTotalPersons = soldGenH + soldGenM + vipPersonsSold;
    const remainingTotalPersons = Math.max(
      0,
      totalLimitPersons - soldTotalPersons
    );

    const payload = {
      eventId: event.code,
      eventName: event.name,
      eventDate: event.date.toISOString().slice(0, 10),
      isActive: event.isActive,

      totals: {
        unitVipSize: VIP_UNIT_SIZE,
        limitPersons: totalLimitPersons,
        soldPersons: soldTotalPersons,
        remainingPersons: remainingTotalPersons,
      },

      tickets: {
        general: {
          hombre: {
            price: Number(cfgGenH?.price ?? 0),
            // MOSTRAMOS EL TOTAL porque no hay cupo por género
            limit: totalLimitPersons,
            sold: soldGenH, // solo informativo
            remaining: remainingTotalPersons,
          },
          mujer: {
            price: Number(cfgGenM?.price ?? 0),
            limit: totalLimitPersons,
            sold: soldGenM,
            remaining: remainingTotalPersons,
          },
        },
        vip: {
          price: Number(cfgVip?.price ?? 0),
          // VIP en PERSONAS
          limit: vipLimitPersons,
          sold: vipPersonsSold,
          remaining: vipRemainingPersons,
          unitSize: VIP_UNIT_SIZE,
          remainingTables: vipRemainingTables,
        },
      },

      // Si usás ubicaciones de mesas separadas
      vipTables: event.vipConfigs.map((c: any) => ({
        location: c.location as "piscina" | "dj" | "general",
        price: Number(c.price),
        limit: c.stockLimit,
        sold: c.soldCount,
        remaining: Math.max(0, c.stockLimit - c.soldCount),
        capacityPerTable: c.capacityPerTable,
      })),
    };

    return json(payload);
  } catch (e) {
    console.error("[tickets/config][GET] error:", e);
    return json({ message: "Error interno al obtener configuración" }, 500);
  }
}

// ============ PATCH ===========
// Actualiza precios (general H/M, VIP) y límites (TOTAL personas y VIP personas)
// ⚠️ Sin pasar `gender: null` en ninguna operación.
export async function PATCH(req: NextRequest) {
  try {
    const event = await getOrCreateActiveEvent();
    const body = await req.json().catch(() => ({}) as any);

    // precios general
    const genHPrice = toNumber(body?.general?.hombre?.price);
    const genMPrice = toNumber(body?.general?.mujer?.price);

    // VIP (PERSONAS)
    const vipPrice = toNumber(body?.vip?.price);
    const vipLimit = toNumber(body?.vip?.stockLimit);

    // TOTAL (PERSONAS)
    const legacyGenHLimit = toNumber(body?.general?.hombre?.stockLimit);
    const legacyGenMLimit = toNumber(body?.general?.mujer?.stockLimit);
    const totalEntriesLimit =
      toNumber(body?.totalEntriesLimit) ??
      (legacyGenHLimit ?? 0) + (legacyGenMLimit ?? 0);

    // ---- General Hombre (precio) ----
    if (genHPrice !== undefined) {
      await prisma.ticketConfig.upsert({
        where: {
          eventId_ticketType_gender: {
            eventId: event.id,
            ticketType: "general",
            gender: "hombre",
          },
        },
        update: { price: genHPrice },
        create: {
          eventId: event.id,
          ticketType: "general",
          gender: "hombre",
          price: genHPrice,
          stockLimit: 0, // no usamos cupo por género
        },
      });
    }

    // ---- General Mujer (precio) ----
    if (genMPrice !== undefined) {
      await prisma.ticketConfig.upsert({
        where: {
          eventId_ticketType_gender: {
            eventId: event.id,
            ticketType: "general",
            gender: "mujer",
          },
        },
        update: { price: genMPrice },
        create: {
          eventId: event.id,
          ticketType: "general",
          gender: "mujer",
          price: genMPrice,
          stockLimit: 0,
        },
      });
    }

    // ---- TOTAL (PERSONAS) ----
    if (totalEntriesLimit !== undefined) {
      // upsert manual para evitar pasar gender: null
      const existingTotal = await prisma.ticketConfig.findFirst({
        where: { eventId: event.id, ticketType: "total", gender: null },
        select: { id: true },
      });

      if (existingTotal) {
        await prisma.ticketConfig.update({
          where: { id: existingTotal.id },
          data: { stockLimit: totalEntriesLimit },
        });
      } else {
        await prisma.ticketConfig.create({
          data: {
            eventId: event.id,
            ticketType: "total",
            // omitimos gender para que quede NULL
            price: 0,
            stockLimit: totalEntriesLimit,
          },
        });
      }
    }

    // ---- VIP (PERSONAS) ----
    if (vipPrice !== undefined || vipLimit !== undefined) {
      // upsert manual para evitar pasar gender: null
      const existingVip = await prisma.ticketConfig.findFirst({
        where: { eventId: event.id, ticketType: "vip", gender: null },
        select: { id: true },
      });

      if (existingVip) {
        await prisma.ticketConfig.update({
          where: { id: existingVip.id },
          data: {
            ...(vipPrice !== undefined ? { price: vipPrice } : {}),
            ...(vipLimit !== undefined ? { stockLimit: vipLimit } : {}),
          },
        });
      } else {
        await prisma.ticketConfig.create({
          data: {
            eventId: event.id,
            ticketType: "vip",
            // omitimos gender para que quede NULL
            price: vipPrice ?? 0,
            stockLimit: vipLimit ?? 0,
          },
        });
      }
    }

    return json({ ok: true });
  } catch (e) {
    console.error("[tickets/config][PATCH] error:", e);
    return json({ message: "Error interno al guardar configuración" }, 500);
  }
}
