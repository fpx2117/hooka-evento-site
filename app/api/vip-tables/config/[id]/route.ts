import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const json = (p: any, s = 200) => NextResponse.json(p, { status: s });

// 🔹 GET /api/vip-tables/config/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cfg = await prisma.vipTableConfig.findUnique({
      where: { id: params.id },
      include: {
        vipLocation: { select: { id: true, name: true } },
      },
    });

    if (!cfg) return json({ ok: false, error: "Configuración no encontrada" }, 404);

    return json({ ok: true, config: cfg });
  } catch (e) {
    console.error("[vip-tables][config][id][GET]", e);
    return json({ ok: false, error: "Error obteniendo configuración" }, 500);
  }
}

// 🔹 PUT /api/vip-tables/config/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const data = await req.json();

    const updated = await prisma.vipTableConfig.update({
      where: { id: params.id },
      data,
    });

    return json({ ok: true, updated });
  } catch (e) {
    console.error("[vip-tables][config][id][PUT]", e);
    return json({ ok: false, error: "Error actualizando configuración" }, 500);
  }
}

// 🔹 DELETE /api/vip-tables/config/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.vipTableConfig.delete({ where: { id: params.id } });
    return json({ ok: true, message: "Configuración eliminada correctamente" });
  } catch (e) {
    console.error("[vip-tables][config][id][DELETE]", e);
    return json({ ok: false, error: "Error eliminando configuración" }, 500);
  }
}
