export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma, VipTableStatus } from "@prisma/client";

function json(payload: any, init?: number | ResponseInit) {
  const initObj: ResponseInit = typeof init === "number" ? { status: init } : init || {};
  const headers = new Headers(initObj.headers || {});
  headers.set("Cache-Control","no-store, no-cache, must-revalidate, proxy-revalidate");
  headers.set("Pragma","no-cache");
  headers.set("Expires","0");
  headers.set("Content-Type","application/json; charset=utf-8");
  return NextResponse.json(payload, { ...initObj, headers });
}

// GET /api/vip-tables?eventId=...&vipLocationId=...&status=available
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("eventId")?.trim();
    const vipLocationId = searchParams.get("vipLocationId")?.trim();
    const status = searchParams.get("status")?.trim();

    if (!eventId) return json({ ok: false, error: "Falta eventId" }, 400);

    const where: Prisma.VipTableWhereInput = { eventId };
    if (vipLocationId) where.vipLocationId = vipLocationId;
    if (status && Object.values(VipTableStatus).includes(status as VipTableStatus)) {
      where.status = status as VipTableStatus;
    }

    const tables = await prisma.vipTable.findMany({
      where,
      orderBy: [{ vipLocation: { name: "asc" } }, { tableNumber: "asc" }],
      select: {
        id: true, eventId: true, vipLocationId: true, vipTableConfigId: true,
        tableNumber: true, capacityPerTable: true, price: true, status: true,
        vipLocation: { select: { id: true, name: true } },
      },
    });

    return json({ ok: true, total: tables.length, tables });
  } catch (e) {
    console.error("[vip-tables] GET", e);
    return json({ ok: false, error: "Error listando mesas" }, 500);
  }
}

// POST /api/vip-tables
// body: { eventId, vipLocationId, vipTableConfigId, tableNumber, capacityPerTable?, price, status? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId, vipLocationId, vipTableConfigId, tableNumber, price, capacityPerTable = 10, status = "available" } = body;

    if (!eventId || !vipLocationId || !vipTableConfigId || !tableNumber || price == null) {
      return json({ ok: false, error: "Faltan campos obligatorios" }, 400);
    }

    const table = await prisma.vipTable.create({
      data: {
        eventId, vipLocationId, vipTableConfigId,
        tableNumber, capacityPerTable, price, status,
      },
    });

    return json({ ok: true, table }, 201);
  } catch (e: any) {
    if (e?.code === "P2002") {
      return json({ ok: false, error: "Número de mesa duplicado para esa ubicación/evento" }, 409);
    }
    console.error("[vip-tables] POST", e);
    return json({ ok: false, error: "Error creando mesa" }, 500);
  }
}

// PUT /api/vip-tables
// body: { id, ...camposActualizables }
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) return json({ ok: false, error: "Falta id" }, 400);

    const updated = await prisma.vipTable.update({
      where: { id },
      data,
      select: {
        id: true, tableNumber: true, status: true, price: true, capacityPerTable: true,
        vipLocation: { select: { id: true, name: true } },
      },
    });

    return json({ ok: true, updated });
  } catch (e) {
    console.error("[vip-tables] PUT", e);
    return json({ ok: false, error: "Error actualizando mesa" }, 500);
  }
}

// DELETE /api/vip-tables?id=...
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id")?.trim();
    if (!id) return json({ ok: false, error: "Falta id" }, 400);

    await prisma.vipTable.delete({ where: { id } });
    return json({ ok: true, message: "Mesa eliminada" });
  } catch (e) {
    console.error("[vip-tables] DELETE", e);
    return json({ ok: false, error: "Error eliminando mesa" }, 500);
  }
}
