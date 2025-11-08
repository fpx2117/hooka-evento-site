import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const json = (p: any, s = 200) => NextResponse.json(p, { status: s });

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("eventId")?.trim();

    if (!eventId) return json({ ok: false, error: "Falta eventId" }, 400);

    // 🔹 Trae todas las configuraciones del evento
    const configs = await prisma.vipTableConfig.findMany({
      where: { eventId },
      include: {
        vipLocation: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // 🔹 Recalculamos soldCount dinámicamente
    const recalculated = await Promise.all(
      configs.map(async (cfg) => {
        // Buscamos todas las mesas asociadas a esta config
        const tables = await prisma.vipTable.findMany({
          where: { vipTableConfigId: cfg.id },
          include: {
            tickets: {
              select: { paymentStatus: true },
            },
          },
        });

        // ✅ Contamos las mesas con al menos un ticket aprobado (en cualquier idioma/capitalización)
        const soldCount = tables.filter((table) =>
          table.tickets.some((t) => {
            const status = t.paymentStatus?.toLowerCase?.() ?? "";
            return status === "approved" || status === "aprobado";
          })
        ).length;

        // ✅ Actualizamos en la base si cambió
        if (soldCount !== cfg.soldCount) {
          await prisma.vipTableConfig.update({
            where: { id: cfg.id },
            data: { soldCount },
          });
        }

        return { ...cfg, soldCount };
      })
    );

    return json({ ok: true, total: recalculated.length, configs: recalculated });
  } catch (e) {
    console.error("[vip-tables][config][GET]", e);
    return json({ ok: false, error: "Error listando configuraciones" }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { eventId, vipLocationId, price, stockLimit, capacityPerTable = 10 } =
      await req.json();

    if (!eventId || !vipLocationId || price == null || stockLimit == null)
      return json({ ok: false, error: "Faltan campos obligatorios" }, 400);

    const existing = await prisma.vipTableConfig.findFirst({
      where: { eventId, vipLocationId },
    });

    const cfg = existing
      ? await prisma.vipTableConfig.update({
          where: { id: existing.id },
          data: { price, stockLimit, capacityPerTable },
        })
      : await prisma.vipTableConfig.create({
          data: { eventId, vipLocationId, price, stockLimit, capacityPerTable },
        });

    return json({ ok: true, config: cfg }, existing ? 200 : 201);
  } catch (e: any) {
    console.error("[vip-tables][config][POST]", e);
    if (e?.code === "P2002")
      return json(
        { ok: false, error: "Ya existe una config para esa ubicación" },
        409
      );
    return json({ ok: false, error: "Error creando o actualizando config" }, 500);
  }
}
