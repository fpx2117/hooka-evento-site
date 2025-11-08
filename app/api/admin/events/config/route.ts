import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * ✅ GET /api/events/config
 * Devuelve toda la configuración del evento activo:
 * - Evento activo o más reciente
 * - Ubicaciones VIP (VipLocation)
 * - Configuraciones de mesas VIP (VipTableConfig)
 * - Totales calculados
 */
export async function GET() {
  try {
    // ===============================
    // 🔍 Buscar evento activo
    // ===============================
    let event = await prisma.event.findFirst({
      where: { isActive: true },
      orderBy: { date: "desc" },
      select: {
        id: true,
        name: true,
        date: true,
        isActive: true,
      },
    });

    // Si no hay evento activo, usar el más reciente
    if (!event) {
      event = await prisma.event.findFirst({
        orderBy: { date: "desc" },
        select: {
          id: true,
          name: true,
          date: true,
          isActive: true,
        },
      });
    }

    if (!event) {
      return NextResponse.json(
        { ok: false, error: "No hay eventos activos o registrados." },
        { status: 404 }
      );
    }

    // ===============================
    // 🧩 Obtener ubicaciones VIP
    // ===============================
    const vipLocations = await prisma.vipLocation.findMany({
      where: { eventId: event.id },
      select: {
        id: true,
        name: true,
        
      },
      orderBy: { name: "asc" },
    });

    // ===============================
    // 🪑 Obtener configuraciones de mesas VIP
    // ===============================
    const vipConfigs = await prisma.vipTableConfig.findMany({
      where: { eventId: event.id },
      select: {
        id: true,
        vipLocationId: true,
        price: true,
        stockLimit: true,
        soldCount: true,
        capacityPerTable: true,
      },
    });

    // ===============================
    // 📊 Calcular totales
    // ===============================
    const totalLimit = vipConfigs.reduce((acc, c) => acc + (c.stockLimit ?? 0), 0);
    const totalSold = vipConfigs.reduce((acc, c) => acc + (c.soldCount ?? 0), 0);
    const remaining = totalLimit - totalSold;

    const totals = {
      unitVipSize: 1,
      limitPersons: totalLimit,
      soldPersons: totalSold,
      remainingPersons: remaining,
    };

    // ===============================
    // ✅ Respuesta final
    // ===============================
    const data = {
      eventId: event.id,
      eventName: event.name,
      eventDate: event.date,
      isActive: event.isActive,
      totals,
      tickets: { general: {} },
      vipLocations,
      vipConfigs,
    };

    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    console.error("[event/config][GET][ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Error al obtener la configuración del evento." },
      { status: 500 }
    );
  }
}
