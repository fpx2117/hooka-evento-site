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

const hasValue = (v: unknown) => v !== undefined && v !== null;

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
        // SOLO TOTAL (personas) — NO hay vip global
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

    // VIP por ubicación (VipTableConfig)
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

    // Agregados VIP a modo de totales (no reintroducen "vip global")
    const vipTotalPersonsLimit = vipTables.reduce(
      (acc, t) => acc + t.limit * (t.capacityPerTable || VIP_UNIT_SIZE),
      0
    );
    const vipTotalPersonsSold = vipTables.reduce(
      (acc, t) => acc + t.sold * (t.capacityPerTable || VIP_UNIT_SIZE),
      0
    );

    // Totales del evento (personas)
    const soldTotalPersons = soldGenH + soldGenM + vipTotalPersonsSold;
    const remainingTotalPersons = Math.max(
      0,
      totalLimitPersons - soldTotalPersons
    );

    const payload = {
      eventId: event.id,
      eventCode: event.code,
      eventName: event.name,
      eventDate: event.date.toISOString().slice(0, 10),
      isActive: event.isActive,

      totals: {
        unitVipSize:
          vipTables.find((t) => t.capacityPerTable)?.capacityPerTable ||
          VIP_UNIT_SIZE,
        limitPersons: totalLimitPersons,
        soldPersons: soldTotalPersons,
        remainingPersons: remainingTotalPersons,
      },

      tickets: {
        general: {
          hombre: {
            price: Number(cfgGenH?.price ?? 0),
            limit: totalLimitPersons, // no hay cupo por género
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
      },

      // Config por ubicación (usar en la UI)
      vipTables,
    };

    return json(payload);
  } catch (e) {
    console.error("[tickets/config][GET] error:", e);
    return json({ message: "Error interno al obtener configuración" }, 500);
  }
}

// ============ PATCH ===========
export async function PATCH(req: NextRequest) {
  try {
    const event = await getOrCreateActiveEvent();
    const body = await req.json().catch(() => ({}) as any);

    // precios general (solo si vienen)
    const genHRaw = body?.general?.hombre?.price;
    const genMRaw = body?.general?.mujer?.price;
    const hasGenH = hasValue(genHRaw);
    const hasGenM = hasValue(genMRaw);

    // TOTAL (PERSONAS) — solo si viene
    const totalLimitRaw = body?.totalEntriesLimit;
    const hasTotalLimit = hasValue(totalLimitRaw);

    // ---- General Hombre (precio) ----
    if (hasGenH) {
      const genHPrice = toNumber(genHRaw);
      if (!Number.isFinite(genHPrice) || genHPrice < 0) {
        return json({ message: "Precio general hombre inválido" }, 400);
      }
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
          stockLimit: 0,
        },
      });
    }

    // ---- General Mujer (precio) ----
    if (hasGenM) {
      const genMPrice = toNumber(genMRaw);
      if (!Number.isFinite(genMPrice) || genMPrice < 0) {
        return json({ message: "Precio general mujer inválido" }, 400);
      }
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
    if (hasTotalLimit) {
      const totalEntriesLimit = toNumber(totalLimitRaw);
      if (!Number.isFinite(totalEntriesLimit) || totalEntriesLimit < 0) {
        return json({ message: "totalEntriesLimit inválido" }, 400);
      }

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
      const capacityPerTable = Math.max(
        1,
        clampNonNegative(toNumber(row?.capacityPerTable, VIP_UNIT_SIZE))
      );

      // upsert POR ÍNDICE COMPUESTO del schema: @@unique([eventId, location])
      const existing = await prisma.vipTableConfig.findUnique({
        where: { eventId_location: { eventId: event.id, location } },
        select: { id: true, soldCount: true },
      });

      if (existing) {
        const safeLimit = Math.max(stockLimit, existing.soldCount || 0);
        await prisma.vipTableConfig.update({
          where: { id: existing.id },
          data: { price, stockLimit: safeLimit, capacityPerTable },
        });
      } else {
        await prisma.vipTableConfig.create({
          data: {
            eventId: event.id,
            location,
            price,
            stockLimit,
            capacityPerTable,
            soldCount: 0,
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
