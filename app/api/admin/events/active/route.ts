import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * ✅ GET /api/admin/events/active
 * Devuelve el evento activo (isActive = true),
 * o el más reciente si no hay uno activo.
 */
export async function GET() {
  try {
    // Buscar evento activo
    let event = await prisma.event.findFirst({
      where: { isActive: true },
      orderBy: { date: "desc" },
      select: {
        id: true,
        name: true,
        code: true,
        date: true,
        isActive: true,
      },
    });

    // Si no hay evento activo, obtener el más reciente
    if (!event) {
      event = await prisma.event.findFirst({
        orderBy: { date: "desc" },
        select: {
          id: true,
          name: true,
          code: true,
          date: true,
          isActive: true,
        },
      });

      if (!event) {
        return NextResponse.json(
          {
            ok: false,
            error: "No hay eventos registrados en la base de datos.",
          },
          { status: 404 }
        );
      }
    }

    // Respuesta exitosa
    return NextResponse.json({ ok: true, event });
  } catch (error) {
    console.error("[admin][events][active][GET] ❌ Error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Error interno al obtener el evento activo.",
      },
      { status: 500 }
    );
  }
}
