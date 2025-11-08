import { NextResponse } from "next/server";
import {prisma} from "@/lib/prisma";

// ===================================================
// ✅ PATCH: Actualizar mesa VIP por ID
// ===================================================
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const body = await req.json();
    const { price, status, capacityPerTable } = body;

    if (!id)
      return NextResponse.json({ ok: false, error: "Falta el ID de la mesa" }, { status: 400 });

    const updatedTable = await prisma.vipTable.update({
      where: { id },
      data: {
        price: price !== undefined ? Number(price) : undefined,
        status: status || undefined,
        capacityPerTable: capacityPerTable !== undefined ? Number(capacityPerTable) : undefined,
      },
    });

    return NextResponse.json({
      ok: true,
      data: updatedTable,
      message: "Mesa VIP actualizada correctamente",
    });
  } catch (err: any) {
    console.error("[vip-tables][tables][PATCH][ERROR]", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Error al actualizar la mesa VIP" },
      { status: 500 }
    );
  }
}

// ===================================================
// ✅ DELETE: Eliminar mesa VIP por ID
// ===================================================
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    if (!id)
      return NextResponse.json({ ok: false, error: "Falta el ID de la mesa" }, { status: 400 });

    await prisma.vipTable.delete({ where: { id } });

    return NextResponse.json({ ok: true, message: "Mesa VIP eliminada correctamente" });
  } catch (err: any) {
    console.error("[vip-tables][tables][DELETE][ERROR]", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Error al eliminar la mesa VIP" },
      { status: 500 }
    );
  }
}
