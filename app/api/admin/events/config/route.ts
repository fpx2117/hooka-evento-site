import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma, TicketType as TT, Gender as G } from "@prisma/client";
import { jwtVerify } from "jose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* -------------------------------------------------------------------------- */
/*                              🔐 AUTH HELPER                                */
/* -------------------------------------------------------------------------- */
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "change-this-secret"
);

async function verifyAuth(request: NextRequest) {
  const token = request.cookies.get("admin-token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                                🔢 HELPERS                                  */
/* -------------------------------------------------------------------------- */
function toDecimal(n: unknown): Prisma.Decimal {
  const num = Number(n || 0);
  return new Prisma.Decimal(isFinite(num) ? num.toFixed(2) : "0");
}

/* -------------------------------------------------------------------------- */
/*                                ✅ GET CONFIG                               */
/* -------------------------------------------------------------------------- */
/**
 * ✅ GET /api/admin/events/config
 * Devuelve toda la configuración del evento activo o más reciente.
 */
export async function GET() {
  try {
    // ===============================
    // 🔍 Buscar evento activo o más reciente
    // ===============================
    let event = await prisma.event.findFirst({
      where: { isActive: true },
      orderBy: { date: "desc" },
      select: {
        id: true,
        name: true,
        date: true,
        isActive: true,
        totalLimitPersons: true,
        soldPersons: true,
        remainingPersons: true,
      },
    });

    if (!event) {
      event = await prisma.event.findFirst({
        orderBy: { date: "desc" },
        select: {
          id: true,
          name: true,
          date: true,
          isActive: true,
          totalLimitPersons: true,
          soldPersons: true,
          remainingPersons: true,
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
    // 🪑 Configuraciones de mesas VIP
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
        mapUrl: true,
      },
    });

    // ===============================
    // 🎟️ Configuraciones de tickets generales
    // ===============================
    const generalTickets = await prisma.ticketConfig.findMany({
      where: {
        eventId: event.id,
        ticketType: TT.general,
      },
      select: {
        id: true,
        ticketType: true,
        gender: true,
        price: true,
        stockLimit: true,
        soldCount: true,
      },
    });

    const male = generalTickets.find((t) => t.gender === G.hombre);
    const female = generalTickets.find((t) => t.gender === G.mujer);

    // ===============================
    // 📊 Calcular totales actualizados
    // ===============================
    const totalLimit =
      (male?.stockLimit ?? 0) +
      (female?.stockLimit ?? 0) +
      vipConfigs.reduce((acc, c) => acc + (c.stockLimit ?? 0), 0);

    const totalSold =
      (male?.soldCount ?? 0) +
      (female?.soldCount ?? 0) +
      vipConfigs.reduce((acc, c) => acc + (c.soldCount ?? 0), 0);

    const remaining = Math.max(0, totalLimit - totalSold);

    // ✅ Guardar los totales actualizados en el evento
    await prisma.event.update({
      where: { id: event.id },
      data: {
        totalLimitPersons: totalLimit,
        soldPersons: totalSold,
        remainingPersons: remaining,
      },
    });

    const totals = {
      vipTablesTotal: vipConfigs.length,
      limitPersons: totalLimit,
      soldPersons: totalSold,
      remainingPersons: remaining,
    };

    // ===============================
    // ✅ Respuesta final
    // ===============================
    return NextResponse.json(
      {
        ok: true,
        event,
        totals,
        tickets: {
          general: {
            hombre: male || null,
            mujer: female || null,
          },
        },
        vipLocations,
        vipConfigs,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[admin/events/config][GET][ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Error al obtener la configuración del evento." },
      { status: 500 }
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                                🧩 PATCH CONFIG                             */
/* -------------------------------------------------------------------------- */
/**
 * ✅ PATCH /api/admin/events/config
 * Actualiza precios y cupos generales (TicketConfig general hombre/mujer)
 * - eventId, genHPrice, genMPrice, totalLimitPersons
 */
export async function PATCH(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { eventId, name, date, totalLimitPersons, genHPrice, genMPrice } =
      await req.json();

    if (!eventId || typeof eventId !== "string") {
      return NextResponse.json(
        { error: "eventId requerido" },
        { status: 400 }
      );
    }

    // ✅ Verificar evento existente
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Evento no encontrado" },
        { status: 404 }
      );
    }

    const total = Math.max(0, Number(totalLimitPersons || 0));
    const malePrice = toDecimal(genHPrice);
    const femalePrice = toDecimal(genMPrice);

    // Dividir cupo total entre géneros
    const stockMale = Math.ceil(total / 2);
    const stockFemale = Math.floor(total / 2);

    // ===============================
    // 🧾 Upsert Configuración General
    // ===============================
    const upsertMale = prisma.ticketConfig.upsert({
      where: {
        eventId_ticketType_gender: {
          eventId,
          ticketType: TT.general,
          gender: G.hombre,
        },
      },
      create: {
        eventId,
        ticketType: TT.general,
        gender: G.hombre,
        price: malePrice,
        stockLimit: stockMale,
        soldCount: 0,
      },
      update: {
        price: malePrice,
        stockLimit: stockMale,
      },
    });

    const upsertFemale = prisma.ticketConfig.upsert({
      where: {
        eventId_ticketType_gender: {
          eventId,
          ticketType: TT.general,
          gender: G.mujer,
        },
      },
      create: {
        eventId,
        ticketType: TT.general,
        gender: G.mujer,
        price: femalePrice,
        stockLimit: stockFemale,
        soldCount: 0,
      },
      update: {
        price: femalePrice,
        stockLimit: stockFemale,
      },
    });

    const [maleCfg, femaleCfg] = await prisma.$transaction([
      upsertMale,
      upsertFemale,
    ]);

    // ===============================
    // 🧮 Recalcular totales del evento
    // ===============================
    const vipConfigs = await prisma.vipTableConfig.findMany({
      where: { eventId },
      select: { stockLimit: true, soldCount: true },
    });

    const totalLimit =
      (maleCfg.stockLimit ?? 0) +
      (femaleCfg.stockLimit ?? 0) +
      vipConfigs.reduce((acc, c) => acc + (c.stockLimit ?? 0), 0);

    const totalSold =
      (maleCfg.soldCount ?? 0) +
      (femaleCfg.soldCount ?? 0) +
      vipConfigs.reduce((acc, c) => acc + (c.soldCount ?? 0), 0);

    const remaining = Math.max(0, totalLimit - totalSold);

    // ===============================
    // 💾 Actualizar evento
    // ===============================
    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: {
        name: name || undefined,
        date: date ? new Date(date) : undefined,
        totalLimitPersons: totalLimit,
        soldPersons: totalSold,
        remainingPersons: remaining,
      },
      select: {
        id: true,
        name: true,
        date: true,
        totalLimitPersons: true,
        soldPersons: true,
        remainingPersons: true,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Configuración actualizada correctamente",
      data: {
        event: updatedEvent,
        tickets: { general: { hombre: maleCfg, mujer: femaleCfg } },
        totals: {
          limitPersons: totalLimit,
          soldPersons: totalSold,
          remainingPersons: remaining,
        },
      },
    });
  } catch (error) {
    console.error("[admin/events/config][PATCH][ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Error al guardar la configuración." },
      { status: 500 }
    );
  }
}
