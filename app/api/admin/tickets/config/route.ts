// app/api/tickets/config/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 1 mesa VIP = N personas (default 10) — clamp mínimo 1
const VIP_UNIT_SIZE = Math.max(1, Number(process.env.VIP_UNIT_SIZE || 10));

// ============ Utils ============
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

function toNumber(v: any, def?: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : (def as number);
}

function clampNonNegative(n: number | undefined) {
  if (n === undefined || !Number.isFinite(n)) return 0;
  return Math.max(0, n);
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

    // Semillas de ubicaciones (opcional): no creamos por defecto
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
// Devuelve configuración del evento ACTIVO
// - General H/M (precios) sin cupo por género
// - TOTAL en PERSONAS
// - VIP por ubicación (DJ / Piscina / General) en MESAS (stockLimit) + capacidad por mesa
// - Compat: tickets.vip agregado a partir de ubicaciones
export async function GET(_req: NextRequest) {
  try {
    const event = await getOrCreateActiveEvent();

    // Vendidos aprobados del evento (GENERAL por género) — usar SUM(quantity)
    const [soldGenHAggr, soldGenMAggr] = await Promise.all([
      prisma.ticket.aggregate({
        where: {
          eventId: event.id,
          ticketType: "general",
          gender: "hombre",
          paymentStatus: "approved",
        },
        _sum: { quantity: true },
      }),
      prisma.ticket.aggregate({
        where: {
          eventId: event.id,
          ticketType: "general",
          gender: "mujer",
          paymentStatus: "approved",
        },
        _sum: { quantity: true },
      }),
    ]);

    const soldGenH = clampNonNegative(soldGenHAggr._sum.quantity || 0);
    const soldGenM = clampNonNegative(soldGenMAggr._sum.quantity || 0);

    // Configs de precios (general H/M)
    const cfgGenH = findCfg(event, "general", "hombre");
    const cfgGenM = findCfg(event, "general", "mujer");

    // TOTAL en PERSONAS (fila con gender NULL)
    const cfgTotal = findCfg(event, "total", null);
    const totalLimitPersons = clampNonNegative(
      cfgTotal ? Number(cfgTotal.stockLimit) : 0
    );

    // VIP por ubicación (VipTableConfig):
    // limit MESAS = stockLimit
    // vendidos MESAS = soldCount
    // capacidad por mesa = capacityPerTable (default 10)
    const vipTablesRaw = event.vipConfigs || [];

    const vipTables = vipTablesRaw.map((c: any) => {
      const limitTables = clampNonNegative(c.stockLimit);
      const soldTables = clampNonNegative(c.soldCount);
      const remainingTables = Math.max(0, limitTables - soldTables);
      const capacityPerTable =
        clampNonNegative(c.capacityPerTable) || VIP_UNIT_SIZE;
      return {
        location: c.location as "piscina" | "dj" | "general",
        price: Number(c.price) || 0,
        limit: limitTables, // MESAS
        sold: soldTables, // MESAS
        remaining: remainingTables, // MESAS
        capacityPerTable,
      };
    });

    // Agregados VIP (compat: personas + mesas)
    const vipTotalPersonsLimit = vipTables.reduce(
      (acc, t) => acc + t.limit * (t.capacityPerTable || VIP_UNIT_SIZE),
      0
    );
    const vipTotalPersonsSold = vipTables.reduce(
      (acc, t) => acc + t.sold * (t.capacityPerTable || VIP_UNIT_SIZE),
      0
    );
    const vipTotalPersonsRemaining = Math.max(
      0,
      vipTotalPersonsLimit - vipTotalPersonsSold
    );
    const vipTotalRemainingTables = vipTables.reduce(
      (acc, t) => acc + t.remaining,
      0
    );
    const unitVipSizeDefault =
      vipTables.find((t) => t.capacityPerTable)?.capacityPerTable ||
      VIP_UNIT_SIZE;

    // Totales del evento (personas)
    const soldTotalPersons = soldGenH + soldGenM + vipTotalPersonsSold;
    const remainingTotalPersons = Math.max(
      0,
      totalLimitPersons - soldTotalPersons
    );

    const payload = {
      eventId: event.id, // UUID real
      eventCode: event.code, // código humano
      eventName: event.name,
      eventDate: event.date.toISOString().slice(0, 10),
      isActive: event.isActive,

      totals: {
        unitVipSize: unitVipSizeDefault,
        limitPersons: totalLimitPersons,
        soldPersons: soldTotalPersons,
        remainingPersons: remainingTotalPersons,
      },

      tickets: {
        general: {
          hombre: {
            price: Number(cfgGenH?.price ?? 0),
            limit: totalLimitPersons, // mostramos total (no cupo por género)
            sold: soldGenH,
            remaining: remainingTotalPersons,
          },
          mujer: {
            price: Number(cfgGenM?.price ?? 0),
            limit: totalLimitPersons,
            sold: soldGenM,
            remaining: remainingTotalPersons,
          },
        },

        // ⚠️ Compat (no usar en UI nueva):
        // Datos agregados desde ubicaciones para no romper clientes viejos.
        vip: {
          price: undefined, // no hay un precio único si hay varias ubicaciones
          limit: vipTotalPersonsLimit, // PERSONAS
          sold: vipTotalPersonsSold, // PERSONAS
          remaining: vipTotalPersonsRemaining, // PERSONAS
          unitSize: unitVipSizeDefault,
          remainingTables: vipTotalRemainingTables, // total mesas restantes
        },
      },

      // Config por ubicación (usar en la UI nueva)
      vipTables,
    };

    return json(payload);
  } catch (e) {
    console.error("[tickets/config][GET] error:", e);
    return json({ message: "Error interno al obtener configuración" }, 500);
  }
}

// ============ PATCH ===========
// Actualiza precios (general H/M), límite TOTAL (PERSONAS) y VIP por ubicación (MESAS)
// Formato esperado:
// {
//   totalEntriesLimit: number,
//   general: { hombre: { price }, mujer: { price } },
//   vipTables: [
//     { location: "dj"|"piscina"|"general", price: number, stockLimit: number, capacityPerTable?: number }
//   ]
// }
export async function PATCH(req: NextRequest) {
  try {
    const event = await getOrCreateActiveEvent();
    const body = await req.json().catch(() => ({}) as any);

    // precios general
    const genHPrice = toNumber(body?.general?.hombre?.price);
    const genMPrice = toNumber(body?.general?.mujer?.price);

    // TOTAL (PERSONAS)
    const totalEntriesLimit = clampNonNegative(
      toNumber(body?.totalEntriesLimit)
    );

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
            price: 0,
            stockLimit: totalEntriesLimit,
          },
        });
      }
    }

    // ---- VIP por ubicación (MESAS) ----
    const vipTables = Array.isArray(body?.vipTables) ? body.vipTables : [];

    for (const row of vipTables) {
      const location = (row?.location || "").toString().toLowerCase();
      if (!["dj", "piscina", "general"].includes(location)) continue;

      const price = clampNonNegative(toNumber(row?.price, 0));
      const stockLimit = clampNonNegative(toNumber(row?.stockLimit, 0));
      const capacityPerTable = clampNonNegative(
        toNumber(row?.capacityPerTable, VIP_UNIT_SIZE)
      );

      // upsert por (eventId, location)
      const existing = await prisma.vipTableConfig.findFirst({
        where: { eventId: event.id, location },
        select: { id: true },
      });

      if (existing) {
        await prisma.vipTableConfig.update({
          where: { id: existing.id },
          data: { price, stockLimit, capacityPerTable },
        });
      } else {
        await prisma.vipTableConfig.create({
          data: {
            eventId: event.id,
            location,
            price,
            stockLimit,
            capacityPerTable,
            soldCount: 0, // se irá actualizando cuando vendas
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
