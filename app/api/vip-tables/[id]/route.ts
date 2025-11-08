import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function json(payload: any, status = 200) {
  return NextResponse.json(payload, { status });
}

// GET /api/vip-tables/:id
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; // ✅ se debe await-iar params

    const table = await prisma.vipTable.findUnique({
      where: { id },
      include: {
        vipLocation: { select: { id: true, name: true } },
        vipTableConfig: true,
      },
    });

    if (!table) return json({ ok: false, error: "No encontrada" }, 404);
    return json({ ok: true, table });
  } catch (e) {
    console.error("[vip-tables/:id] GET", e);
    return json({ ok: false, error: "Error obteniendo mesa" }, 500);
  }
}

// PATCH /api/vip-tables/:id
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; // ✅ await necesario
    const body = await req.json();

    const updated = await prisma.vipTable.update({
      where: { id },
      data: body,
    });

    return json({ ok: true, updated });
  } catch (e) {
    console.error("[vip-tables/:id] PATCH", e);
    return json({ ok: false, error: "Error actualizando mesa" }, 500);
  }
}

// DELETE /api/vip-tables/:id
export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; // ✅ await necesario

    await prisma.vipTable.delete({ where: { id } });
    return json({ ok: true, deleted: true });
  } catch (e) {
    console.error("[vip-tables/:id] DELETE", e);
    return json({ ok: false, error: "Error eliminando mesa" }, 500);
  }
}
