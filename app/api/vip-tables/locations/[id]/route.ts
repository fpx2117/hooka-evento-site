import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Helper para responder con JSON limpio
function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 👇 se usa await para resolver params
    const { id } = await context.params;

    if (!id) {
      return json({ ok: false, error: "Falta ID de ubicación" }, 400);
    }

    await prisma.vipLocation.delete({
      where: { id },
    });

    return json({ ok: true, message: "Ubicación eliminada correctamente ✅" });
  } catch (error) {
    console.error("[vip-tables][locations][DELETE]", error);
    return json({ ok: false, error: "Error al eliminar la ubicación" }, 500);
  }
}
