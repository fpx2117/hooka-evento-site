// app/api/admin/events/route.ts
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs";

const prisma = new PrismaClient();

/**
 * GET /api/admin/events
 *   ?active=1|true|0|false (opcional)
 *
 * Respuesta:
 * { events: Array<{ id, name, code, date, isActive }> }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const activeParam = searchParams.get("active");

    let where: { isActive?: boolean } = {};
    if (activeParam !== null) {
      const val = activeParam.toLowerCase();
      where.isActive = val === "1" || val === "true";
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
      },
    });

    return new Response(JSON.stringify({ events }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[events] GET error:", err);
    return new Response(
      JSON.stringify({ error: "No se pudieron obtener los eventos" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
