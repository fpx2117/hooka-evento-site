import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const json = (data: any, status = 200) => NextResponse.json(data, { status });

/* ============================================================
   GET /api/vip-tables/locations?eventId=...
============================================================ */
export async function GET(req: NextRequest) {
  try {
    const eventId = req.nextUrl.searchParams.get("eventId");

    // 🚨 Verifica que haya un evento activo en la base
    if (!eventId) {
      const activeEvent = await prisma.event.findFirst({
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });

      if (!activeEvent) {
        return json({ ok: false, error: "No hay evento activo" }, 404);
      }

      // ✅ Si hay uno, usarlo por defecto
      return GET({
        ...req,
        nextUrl: new URL(`${req.nextUrl.origin}${req.nextUrl.pathname}?eventId=${activeEvent.id}`),
      } as NextRequest);
    }

    // ✅ Busca ubicaciones del evento
    const eventExists = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });

    if (!eventExists)
      return json({ ok: false, error: "El evento no existe" }, 404);

    const locations = await prisma.vipLocation.findMany({
      where: { eventId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        order: true,
        isActive: true,
        configs: {
          where: { eventId },
          select: {
            id: true,
            price: true,
            capacityPerTable: true,
            stockLimit: true,
            soldCount: true,
          },
        },
        _count: { select: { tables: true } },
      },
    });

    const formatted = locations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      order: loc.order,
      isActive: loc.isActive,
      tablesCount: loc._count.tables,
      config: loc.configs?.[0] || null,
    }));

    return json({ ok: true, total: formatted.length, locations: formatted });
  } catch (error) {
    console.error("[vip-tables][locations][GET]", error);
    return json({ ok: false, error: "Error al listar ubicaciones" }, 500);
  }
}

/* ============================================================
   POST /api/vip-tables/locations
============================================================ */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId, name } = body;
    const order = Number(body.order) || 0;

    if (!eventId || !name)
      return json({ ok: false, error: "Faltan campos obligatorios" }, 400);

    const eventExists = await prisma.event.findUnique({ where: { id: eventId } });
    if (!eventExists)
      return json({ ok: false, error: "El evento especificado no existe" }, 404);

    const exists = await prisma.vipLocation.findFirst({
      where: { eventId, name: { equals: name, mode: "insensitive" } },
    });

    if (exists)
      return json({ ok: false, error: "Ya existe una ubicación con ese nombre" }, 409);

    const location = await prisma.vipLocation.create({
      data: { eventId, name, order, isActive: true },
    });

    return json({ ok: true, location }, 201);
  } catch (error) {
    console.error("[vip-tables][locations][POST]", error);
    return json({ ok: false, error: "Error creando ubicación" }, 500);
  }
}
