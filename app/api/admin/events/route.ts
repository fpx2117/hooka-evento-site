// app/api/admin/events/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * ===============================
 * ✅ GET /api/admin/events
 * Query opcional: ?active=true|false|1|0
 * ===============================
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const activeParam = searchParams.get("active");

    const where: { isActive?: boolean } = {};

    if (activeParam !== null) {
      const val = activeParam.trim().toLowerCase();
      if (["1", "true", "0", "false"].includes(val)) {
        where.isActive = val === "1" || val === "true";
      }
    }

    const events = await prisma.event.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { date: "desc" }],
      select: {
        id: true,
        name: true,
        code: true,
        date: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, data: events });
  } catch (err: any) {
    console.error("[admin/events][GET][ERROR]", err);
    return NextResponse.json(
      { ok: false, error: "Error al obtener los eventos" },
      { status: 500 }
    );
  }
}

/**
 * ===============================
 * ✅ POST /api/admin/events
 * Crear nuevo evento
 * Body:
 * { name, code, date, isActive? }
 * ===============================
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, code, date, isActive = false } = body;

    if (!name || !code || !date) {
      return NextResponse.json(
        { ok: false, error: "Faltan campos obligatorios" },
        { status: 400 }
      );
    }

    // Validar unicidad del código
    const existing = await prisma.event.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json(
        { ok: false, error: "Ya existe un evento con ese código" },
        { status: 409 }
      );
    }

    // ✅ Corregido: convertir correctamente la fecha al horario argentino (UTC-3)
    // Esto evita que se guarde el día siguiente.
    const [year, month, day] = date.split("-");
    const localDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 3, 0, 0)); 
    // (UTC+3 == hora Argentina) → neutraliza el desfase

    const newEvent = await prisma.event.create({
      data: {
        name,
        code,
        date: localDate,
        isActive: Boolean(isActive),
      },
    });

    return NextResponse.json({ ok: true, data: newEvent }, { status: 201 });
  } catch (err: any) {
    console.error("[admin/events][POST][ERROR]", err);
    return NextResponse.json(
      { ok: false, error: "Error al crear el evento" },
      { status: 500 }
    );
  }
}

/**
 * ===============================
 * ✅ PATCH /api/admin/events
 * Actualizar evento existente
 * Body:
 * { id, name?, code?, date?, isActive? }
 * ===============================
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, code, date, isActive } = body;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Falta el ID del evento" },
        { status: 400 }
      );
    }

    const existing = await prisma.event.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Evento no encontrado" },
        { status: 404 }
      );
    }

    // Si se activa este, desactivar otros
    if (isActive === true) {
      await prisma.event.updateMany({
        where: { id: { not: id } },
        data: { isActive: false },
      });
    }

    // ✅ Ajuste local para horario argentino en caso de actualizar fecha
    let parsedDate = existing.date;
    if (date) {
      const [year, month, day] = date.split("-");
      parsedDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 3, 0, 0));
    }

    const updated = await prisma.event.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        code: code ?? existing.code,
        date: parsedDate,
        isActive: typeof isActive === "boolean" ? isActive : existing.isActive,
      },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (err: any) {
    console.error("[admin/events][PATCH][ERROR]", err);
    return NextResponse.json(
      { ok: false, error: "Error al actualizar el evento" },
      { status: 500 }
    );
  }
}

/**
 * ===============================
 * ✅ DELETE /api/admin/events
 * Eliminar evento por ID
 * Body:
 * { id }
 * ===============================
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Falta el ID del evento" },
        { status: 400 }
      );
    }

    const existing = await prisma.event.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Evento no encontrado" },
        { status: 404 }
      );
    }

    await prisma.event.delete({ where: { id } });

    return NextResponse.json({
      ok: true,
      message: `Evento "${existing.name}" eliminado correctamente`,
    });
  } catch (err: any) {
    console.error("[admin/events][DELETE][ERROR]", err);
    return NextResponse.json(
      { ok: false, error: "Error al eliminar el evento" },
      { status: 500 }
    );
  }
}
