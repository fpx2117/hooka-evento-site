// app/api/admin/tickets/config/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Gender, PaymentStatus, TicketType } from "@prisma/client";
import { getVipSequentialRanges } from "@/lib/vip-tables";

// ===============================
// 🔧 Configuración general
// ===============================
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

const hasValue = (v: unknown) => v !== undefined && v !== null;

// ===============================
// 🔹 Obtener o crear evento activo
// ===============================
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
    const created = await prisma.event.create({
      data: {
        code: process.env.EVENT_CODE || "DEFAULT",
        name: process.env.EVENT_NAME || "Evento Principal",
        date: new Date(process.env.EVENT_DATE || "2025-11-02"),
        isActive: true,
      },
    });

    // Crear configuraciones básicas de tickets
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

function findTicketCfg(
  event: { ticketConfigs: Array<any> },
  ticketType: TicketType,
  gender: Gender | null
) {
  return event.ticketConfigs.find(
    (t) => t.ticketType === ticketType && t.gender === gender
  );
}

// ===============================
// 🔹 GET — Obtener configuración
// ===============================
export async function GET(_req: NextRequest) {
  try {
    const event = await getOrCreateActiveEvent();

    // Tickets vendidos por género (GENERAL)
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

    const cfgGenH = findTicketCfg(event, "general", "hombre");
    const cfgGenM = findTicketCfg(event, "general", "mujer");

    const totalLimitPersons = nn0(
      event.ticketConfigs.find(
        (t) => t.ticketType === "general" && t.gender === null
      )?.stockLimit
    );

    // Configuración VIP por ubicación
    const vipConfigs = await prisma.vipTableConfig.findMany({
      where: { eventId: event.id },
      include: { vipLocation: true },
      orderBy: { vipLocation: { order: "asc" } },
    });

    const baseVip = vipConfigs.map((c) => ({
      vipLocationId: c.vipLocationId,
      locationName: c.vipLocation?.name || "Ubicación",
      price: Number(c.price),
      limit: c.stockLimit,
      sold: c.soldCount,
      remaining: Math.max(0, c.stockLimit - c.soldCount),
      capacityPerTable: c.capacityPerTable,
    }));

    // Rango secuencial (si existe helper)
    const { total: totalTables, ranges } = await getVipSequentialRanges({
      prisma,
      eventId: event.id,
    }).catch(() => ({ total: 0, ranges: [] }));

    const vipTables = baseVip.map((v) => {
      const range = ranges?.find(
  (r: any) =>
    r.vipLocationId === v.vipLocationId ||
    r.location === v.locationName ||
    r.locationName === v.locationName
);
      return { ...v, startNumber: range?.startNumber, endNumber: range?.endNumber };
    });

    const vipSoldPersons = vipTables.reduce(
      (acc, v) => acc + v.sold * v.capacityPerTable,
      0
    );

    const soldTotalPersons = soldGenH + soldGenM + vipSoldPersons;
    const remainingTotalPersons = Math.max(
      0,
      totalLimitPersons - soldTotalPersons
    );

    return json({
      eventId: event.id,
      eventCode: event.code,
      eventName: event.name,
      eventDate: event.date.toISOString().slice(0, 10),
      isActive: event.isActive,
      totals: {
        unitVipSize: VIP_UNIT_SIZE,
        limitPersons: totalLimitPersons,
        soldPersons: soldTotalPersons,
        remainingPersons: remainingTotalPersons,
        totalTables,
      },
      tickets: {
        general: {
          hombre: {
            price: Number(cfgGenH?.price || 0),
            limit: totalLimitPersons,
            sold: soldGenH,
            remaining: remainingTotalPersons,
          },
          mujer: {
            price: Number(cfgGenM?.price || 0),
            limit: totalLimitPersons,
            sold: soldGenM,
            remaining: remainingTotalPersons,
          },
        },
      },
      vipTables,
    });
  } catch (e) {
    console.error("[tickets/config][GET] error:", e);
    return json({ ok: false, error: "Error interno al obtener configuración" }, 500);
  }
}

// ===============================
// 🔹 PATCH — Actualizar configuración
// ===============================
export async function PATCH(req: NextRequest) {
  try {
    const event = await getOrCreateActiveEvent();
    const body = (await req.json()) as {
      general?: {
        hombre?: { price?: number | string };
        mujer?: { price?: number | string };
      };
      totalEntriesLimit?: number | string;
      vipConfigs?: Array<{
        vipLocationId: string;
        price?: number | string;
        stockLimit?: number | string;
        capacityPerTable?: number | string;
      }>;
    };

    const upserts: Promise<unknown>[] = [];

    // Entradas generales
    if (body.general?.hombre?.price !== undefined) {
      const price = nn0(body.general.hombre.price);
      upserts.push(
        prisma.ticketConfig.upsert({
          where: {
            eventId_ticketType_gender: {
              eventId: event.id,
              ticketType: "general",
              gender: "hombre",
            },
          },
          update: { price },
          create: {
            eventId: event.id,
            ticketType: "general",
            gender: "hombre",
            price,
            stockLimit: 0,
            soldCount: 0,
          },
        })
      );
    }

    if (body.general?.mujer?.price !== undefined) {
      const price = nn0(body.general.mujer.price);
      upserts.push(
        prisma.ticketConfig.upsert({
          where: {
            eventId_ticketType_gender: {
              eventId: event.id,
              ticketType: "general",
              gender: "mujer",
            },
          },
          update: { price },
          create: {
            eventId: event.id,
            ticketType: "general",
            gender: "mujer",
            price,
            stockLimit: 0,
            soldCount: 0,
          },
        })
      );
    }

    // Límite total de personas
    if (hasValue(body.totalEntriesLimit)) {
      const stockLimit = nn0(body.totalEntriesLimit);
      const existing = await prisma.ticketConfig.findFirst({
        where: { eventId: event.id, ticketType: "general", gender: null },
      });

      if (existing) {
        upserts.push(
          prisma.ticketConfig.update({
            where: { id: existing.id },
            data: { stockLimit },
          })
        );
      } else {
        upserts.push(
          prisma.ticketConfig.create({
            data: {
              eventId: event.id,
              ticketType: "general",
              price: 0,
              stockLimit,
              soldCount: 0,
              gender: null,
            },
          })
        );
      }
    }

    // VIP Configs
    if (Array.isArray(body.vipConfigs)) {
      for (const cfg of body.vipConfigs) {
        const vipLocationId = cfg.vipLocationId;
        const price = nn0(cfg.price);
        const stockLimit = nn0(cfg.stockLimit);
        const capacityPerTable = clampPosInt(cfg.capacityPerTable, VIP_UNIT_SIZE);

        const existing = await prisma.vipTableConfig.findFirst({
          where: { eventId: event.id, vipLocationId },
        });

        if (existing) {
          upserts.push(
            prisma.vipTableConfig.update({
              where: { id: existing.id },
              data: { price, stockLimit, capacityPerTable },
            })
          );
        } else {
          upserts.push(
            prisma.vipTableConfig.create({
              data: {
                eventId: event.id,
                vipLocationId,
                price,
                stockLimit,
                capacityPerTable,
                soldCount: 0,
              },
            })
          );
        }
      }
    }

    await Promise.all(upserts);
    return json({ ok: true });
  } catch (e) {
    console.error("[tickets/config][PATCH] error:", e);
    return json({ ok: false, error: "Error interno al guardar configuración" }, 500);
  }
}
