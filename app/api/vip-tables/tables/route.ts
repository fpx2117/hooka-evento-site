import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VipTableStatus, PaymentStatus } from "@prisma/client";

const json = (p: any, s = 200) => NextResponse.json(p, { status: s });

/* ============================================================
   🔹 GET /api/vip-tables/tables?eventId=...&vipLocationId=...
   → Lista mesas VIP (opcionalmente filtradas por ubicación)
============================================================ */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("eventId");
    const vipLocationId = searchParams.get("vipLocationId");

    if (!eventId)
      return json({ ok: false, error: "Falta el parámetro eventId" }, 400);

    const where: any = { eventId };
    if (vipLocationId) where.vipLocationId = vipLocationId;

    const tables = await prisma.vipTable.findMany({
      where,
      orderBy: { tableNumber: "asc" },
      include: {
        tickets: {
          select: {
            id: true,
            paymentStatus: true,
          },
        },
        vipLocation: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

   const formatted = tables.map((t) => {
  const hasApproved = t.tickets.some(
    (tk) => tk.paymentStatus === PaymentStatus.approved
  );

  return {
    id: t.id,
    tableNumber: t.tableNumber,
    vipLocationId: t.vipLocationId,
    vipLocation: t.vipLocation,
    price: Number(t.price ?? 0),
    capacityPerTable: t.capacityPerTable ?? 0,
    status: hasApproved
      ? VipTableStatus.sold
      : t.status ?? VipTableStatus.available,
    ticketStatus: hasApproved ? "approved" : "pending",
    isAvailable: !hasApproved,
  };
});

    return json({ ok: true, total: formatted.length, data: formatted });
  } catch (error) {
    console.error("[vip-tables][tables][GET]", error);
    return json({ ok: false, error: "Error al listar las mesas" }, 500);
  }
}

/* ============================================================
   🔹 POST /api/vip-tables/tables
   → Crea mesas automáticamente desde configuración
============================================================ */
export async function POST(req: NextRequest) {
  try {
    const { eventId, vipLocationId, vipTableConfigId, startNumber, endNumber } =
      await req.json();

    if (!eventId || !vipLocationId || !vipTableConfigId)
      return json({ ok: false, error: "Faltan campos obligatorios" }, 400);

    const config = await prisma.vipTableConfig.findUnique({
      where: { id: vipTableConfigId },
      select: { price: true, capacityPerTable: true },
    });

    if (!config)
      return json({ ok: false, error: "Configuración no encontrada" }, 404);

    if (isNaN(startNumber) || isNaN(endNumber) || startNumber > endNumber)
      return json({ ok: false, error: "Rango de mesas inválido" }, 400);

    const tablesData = Array.from(
      { length: endNumber - startNumber + 1 },
      (_, i) => ({
        eventId,
        vipLocationId,
        vipTableConfigId,
        tableNumber: startNumber + i,
        price: config.price,
        capacityPerTable: config.capacityPerTable,
        status: VipTableStatus.available,
      })
    );

    await prisma.vipTable.createMany({ data: tablesData });

    return json(
      { ok: true, message: "Mesas creadas correctamente", count: tablesData.length },
      201
    );
  } catch (error) {
    console.error("[vip-tables][tables][POST]", error);
    return json({ ok: false, error: "Error creando mesas" }, 500);
  }
}

/* ============================================================
   🔹 PATCH /api/vip-tables/tables
   → Permite actualizar el estado de una mesa (opcional)
============================================================ */
export async function PATCH(req: NextRequest) {
  try {
    const { id, status } = await req.json();

    if (!id || !status)
      return json({ ok: false, error: "Faltan campos obligatorios" }, 400);

    if (!(status in VipTableStatus))
      return json({ ok: false, error: "Estado inválido" }, 400);

    const updated = await prisma.vipTable.update({
      where: { id },
      data: { status },
    });

    return json({ ok: true, table: updated });
  } catch (error) {
    console.error("[vip-tables][tables][PATCH]", error);
    return json({ ok: false, error: "Error actualizando mesa VIP" }, 500);
  }
}
