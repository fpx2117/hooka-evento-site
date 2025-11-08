export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VipTableStatus } from "@prisma/client";
import { getVipSequentialRanges } from "@/lib/vip-tables";

/* -------------------------------------------------------------------------- */
/*                               🔧 UTILIDADES                                */
/* -------------------------------------------------------------------------- */
const VIP_UNIT_SIZE = Math.max(1, Number(process.env.VIP_UNIT_SIZE || 10));

function json(payload: unknown, init?: number | ResponseInit) {
  const initObj: ResponseInit =
    typeof init === "number" ? { status: init } : init || {};
  const headers = new Headers(initObj.headers || {});
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("Content-Type", "application/json; charset=utf-8");
  return NextResponse.json(payload, { ...initObj, headers });
}

const nn0 = (n: unknown): number => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

const clampPosInt = (n: unknown, def = 1): number => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : def;
};

/* -------------------------------------------------------------------------- */
/*                     🔹 BUSCAR O CREAR EVENTO ACTIVO                        */
/* -------------------------------------------------------------------------- */
async function getOrCreateActiveEvent() {
  let event = await prisma.event.findFirst({
    where: { isActive: true },
    include: {
      ticketConfigs: true,
      vipConfigs: true,
      vipLocations: true,
      vipTables: true,
    },
  });

  if (!event) {
    const capEnv = Number(process.env.EVENT_CAPACITY);
    const capacity = Number.isFinite(capEnv) && capEnv > 0 ? capEnv : 250;

    const created = await prisma.event.create({
      data: {
        code: process.env.EVENT_CODE || "DEFAULT",
        name: process.env.EVENT_NAME || "Evento Principal",
        date: new Date(process.env.EVENT_DATE || new Date()),
        isActive: true,
        totalLimitPersons: capacity,
        soldPersons: 0,
        remainingPersons: capacity,
      },
    });

    await prisma.ticketConfig.createMany({
      data: [
        {
          eventId: created.id,
          ticketType: "general",
          gender: "hombre",
          price: 0,
          stockLimit: 0,
          soldCount: 0,
        },
        {
          eventId: created.id,
          ticketType: "general",
          gender: "mujer",
          price: 0,
          stockLimit: 0,
          soldCount: 0,
        },
      ],
    });

    event = await prisma.event.findUnique({
      where: { id: created.id },
      include: {
        ticketConfigs: true,
        vipConfigs: true,
        vipLocations: true,
        vipTables: true,
      },
    });
  }

  return event!;
}

/* -------------------------------------------------------------------------- */
/*                                 🔹 GET CONFIG                              */
/* -------------------------------------------------------------------------- */
export async function GET(_req: NextRequest) {
  try {
    const event = await getOrCreateActiveEvent();

    /* ---------------------- 🎟️ Entradas generales vendidas ---------------------- */
    const [soldH, soldM] = await Promise.all([
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

    const soldGenH = nn0(soldH._sum.quantity);
    const soldGenM = nn0(soldM._sum.quantity);

    const cfgGenH = event.ticketConfigs.find(
      (t) => t.ticketType === "general" && t.gender === "hombre"
    );
    const cfgGenM = event.ticketConfigs.find(
      (t) => t.ticketType === "general" && t.gender === "mujer"
    );

    /* ---------------------------- 🪑 MESAS VIP ---------------------------- */
    const vipConfigs = await prisma.vipTableConfig.findMany({
      where: { eventId: event.id },
      include: { vipLocation: true },
      orderBy: { vipLocation: { order: "asc" } },
    });

    const { ranges } = await getVipSequentialRanges({
      prisma,
      eventId: event.id,
    }).catch(() => ({ ranges: [] as any[] }));

    const vipConfigMapped = vipConfigs.map((c) => {
      const range = ranges?.find(
        (r: any) =>
          r.vipLocationId === c.vipLocationId ||
          r.location === c.vipLocation?.name
      );
      return {
        vipLocationId: c.vipLocationId,
        locationName: c.vipLocation?.name || "Ubicación",
        price: Number(c.price),
        limit: nn0(c.stockLimit),
        sold: nn0(c.soldCount),
        remaining: Math.max(0, nn0(c.stockLimit) - nn0(c.soldCount)),
        capacityPerTable: nn0(c.capacityPerTable),
        startNumber: range?.startNumber,
        endNumber: range?.endNumber,
      };
    });

    /* ---------------------- ✅ CÁLCULO DE TOTALES ---------------------- */
    const totalGeneralLimit =
      nn0(cfgGenH?.stockLimit) + nn0(cfgGenM?.stockLimit);

    let totalLimitPersons = nn0(event.totalLimitPersons) || totalGeneralLimit;

    if (totalLimitPersons === 0 && totalGeneralLimit > 0) {
      await prisma.event.update({
        where: { id: event.id },
        data: { totalLimitPersons: totalGeneralLimit },
      });
      totalLimitPersons = totalGeneralLimit;
    }

    // Capacidad total VIP configurada
    const totalVipTables = vipConfigs.reduce(
      (acc, c) => acc + nn0(c.stockLimit),
      0
    );

    const vipReservedCapacity = vipConfigs.reduce(
      (acc, c) => acc + nn0(c.stockLimit) * nn0(c.capacityPerTable),
      0
    );

    // 🎟️ Mesas vendidas (tickets tipo VIP)
    const soldVipAgg = await prisma.ticket.aggregate({
      where: { eventId: event.id, ticketType: "vip", paymentStatus: "approved" },
      _sum: { quantity: true },
    });

    const soldVipTables = nn0(soldVipAgg._sum.quantity);

    // Capacidad promedio por mesa
    const avgCapacityPerTable =
      vipConfigs.length > 0
        ? vipConfigs.reduce((acc, c) => acc + nn0(c.capacityPerTable), 0) /
          vipConfigs.length
        : VIP_UNIT_SIZE;

    const soldVipTotalPersons = soldVipTables * avgCapacityPerTable;

    // 🎫 Totales generales
    const soldGeneralTotal = soldGenH + soldGenM;
    const soldTotalPersons = soldGeneralTotal + soldVipTotalPersons;

    // Mesas restantes (para frontend)
    const remainingVipTables = Math.max(0, totalVipTables - soldVipTables);

    // Personas restantes = capacidad total - (reservado + vendidos)
    const remainingTotalPersons = Math.max(
      0,
      totalLimitPersons - (vipReservedCapacity + soldTotalPersons)
    );

    // Persistir métricas
    await prisma.event.update({
      where: { id: event.id },
      data: {
        soldPersons: soldTotalPersons,
        remainingPersons: remainingTotalPersons,
      },
    });

    /* ---------------------------- ✅ RESPUESTA FINAL ---------------------------- */
    return json({
      ok: true,
      eventId: event.id,
      eventCode: event.code,
      eventName: event.name,
      eventDate: event.date.toISOString().slice(0, 10),
      totals: {
        unitVipSize: VIP_UNIT_SIZE,
        limitPersons: totalLimitPersons,
        soldPersons: soldTotalPersons,
        remainingPersons: remainingTotalPersons,
        totalVipTables,
        remainingVipTables, // 🟢 NUEVO: mesas VIP disponibles reales
        totalVipCapacity: vipReservedCapacity,
      },
      tickets: {
        general: {
          hombre: {
            price: Number(cfgGenH?.price || 0),
            limit: nn0(cfgGenH?.stockLimit),
            sold: soldGenH,
            remaining: Math.max(0, nn0(cfgGenH?.stockLimit) - soldGenH),
          },
          mujer: {
            price: Number(cfgGenM?.price || 0),
            limit: nn0(cfgGenM?.stockLimit),
            sold: soldGenM,
            remaining: Math.max(0, nn0(cfgGenM?.stockLimit) - soldGenM),
          },
        },
      },
      vipTables: vipConfigMapped,
    });
  } catch (e) {
    console.error("[tickets/config][GET] error:", e);
    return json(
      { ok: false, error: "Error interno al obtener configuración" },
      500
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                                 🔹 PATCH CONFIG                            */
/* -------------------------------------------------------------------------- */
export async function PATCH(req: NextRequest) {
  try {
    const event = await getOrCreateActiveEvent();
    const body = (await req.json()) as {
      totalCapacity?: number;
      general?: {
        hombre?: { price?: number | string; limit?: number };
        mujer?: { price?: number | string; limit?: number };
      };
      vipConfigs?: Array<{
        vipLocationId: string;
        price?: number | string;
        stockLimit?: number | string;
        capacityPerTable?: number | string;
      }>;
    };

    const upserts: Promise<unknown>[] = [];

    // ✅ Guardar cupo total sin sumar mesas
    if (body.totalCapacity != null) {
      upserts.push(
        prisma.event.update({
          where: { id: event.id },
          data: { totalLimitPersons: nn0(body.totalCapacity) },
        })
      );
    }

    // 🎟️ Entradas generales
    for (const gender of ["hombre", "mujer"] as const) {
      const gen = body.general?.[gender];
      if (gen) {
        const price = nn0(gen.price);
        const limit = nn0(gen.limit);
        upserts.push(
          prisma.ticketConfig.upsert({
            where: {
              eventId_ticketType_gender: {
                eventId: event.id,
                ticketType: "general",
                gender,
              },
            },
            update: { price, stockLimit: limit },
            create: {
              eventId: event.id,
              ticketType: "general",
              gender,
              price,
              stockLimit: limit,
              soldCount: 0,
            },
          })
        );
      }
    }

    // 🪑 Configuración VIP
    if (Array.isArray(body.vipConfigs)) {
      for (const cfg of body.vipConfigs) {
        const vipLocationId = cfg.vipLocationId;
        const price = nn0(cfg.price);
        const stockLimit = nn0(cfg.stockLimit);
        const capacityPerTable = clampPosInt(cfg.capacityPerTable, VIP_UNIT_SIZE);

        const existing = await prisma.vipTableConfig.findFirst({
          where: { eventId: event.id, vipLocationId },
        });

        const vipConfig = existing
          ? await prisma.vipTableConfig.update({
              where: { id: existing.id },
              data: { price, stockLimit, capacityPerTable },
            })
          : await prisma.vipTableConfig.create({
              data: {
                eventId: event.id,
                vipLocationId,
                price,
                stockLimit,
                capacityPerTable,
                soldCount: 0,
              },
            });

        const existingTables = await prisma.vipTable.count({
          where: { eventId: event.id, vipLocationId },
        });

        if (existingTables === 0 && stockLimit > 0) {
          const tables = Array.from({ length: stockLimit }, (_, i) => ({
            eventId: event.id,
            vipLocationId,
            vipTableConfigId: vipConfig.id,
            tableNumber: i + 1,
            price,
            capacityPerTable,
            status: VipTableStatus.available,
          }));
          await prisma.vipTable.createMany({ data: tables });
        }
      }
    }

    await Promise.all(upserts);
    return json({ ok: true, message: "Configuración guardada correctamente." });
  } catch (e) {
    console.error("[tickets/config][PATCH] error:", e);
    return json(
      { ok: false, error: "Error interno al guardar configuración" },
      500
    );
  }
}
