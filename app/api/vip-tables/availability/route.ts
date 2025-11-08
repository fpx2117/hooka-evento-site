import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let eventId = searchParams.get("eventId");
    const vipLocationId = searchParams.get("vipLocationId");

    // 🔹 Obtener evento activo si no se pasa eventId
    if (!eventId) {
      const activeEvent = await prisma.event.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      if (!activeEvent) {
        return NextResponse.json(
          { ok: false, error: "No hay evento activo ni se pasó eventId" },
          { status: 404 }
        );
      }
      eventId = activeEvent.id;
    }

    if (!vipLocationId) {
      return NextResponse.json(
        { ok: false, error: "Falta el parámetro vipLocationId" },
        { status: 400 }
      );
    }

    // 🔍 Obtener la configuración de mesas VIP con su mapa
    const config = await prisma.vipTableConfig.findFirst({
      where: { eventId, vipLocationId },
      select: {
        id: true,
        mapUrl: true,
      },
    });

    if (!config) {
      return NextResponse.json(
        { ok: false, error: "No se encontró configuración para esta ubicación" },
        { status: 404 }
      );
    }

    // 🔍 Buscar las mesas VIP de esa configuración (relación corregida)
    const tables = await prisma.vipTable.findMany({
      where: {
        vipTableConfig: {
          eventId,
          vipLocationId,
        },
      },
      orderBy: { tableNumber: "asc" },
      select: {
        id: true,
        tableNumber: true,
        status: true,
        price: true,
        capacityPerTable: true,
        vipTableConfig: {
          select: {
            vipLocation: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    // 🔹 Si no hay mesas, devolver respuesta vacía pero válida
    if (!tables.length) {
      return NextResponse.json({
        ok: true,
        message: "No hay mesas registradas para esta ubicación",
        total: 0,
        availableCount: 0,
        mapUrl: config.mapUrl,
        tables: [],
      });
    }

    // 🧩 Normalizar estado y datos
    const formatted = tables.map((t) => {
      const status = (t.status || "").toString().toLowerCase();
      return {
        id: t.id,
        tableNumber: t.tableNumber,
        status,
        price: Number(t.price),
        capacityPerTable: t.capacityPerTable,
        available: status === "available",
        locationName: t.vipTableConfig?.vipLocation?.name ?? null,
      };
    });

    const availableTables = formatted.filter((t) => t.available);

    // ✅ Respuesta final
    return NextResponse.json({
      ok: true,
      total: formatted.length,
      availableCount: availableTables.length,
      mapUrl: config.mapUrl,
      tables: formatted,
    });
  } catch (err) {
    console.error("[vip-tables][availability][GET][ERROR]", err);
    return NextResponse.json(
      { ok: false, error: "No se pudo obtener la disponibilidad" },
      { status: 500 }
    );
  }
}
