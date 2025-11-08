export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  PaymentStatus as PS,
  TicketType as TT,
  VipTableStatus,
} from "@prisma/client";

// ============================================================
// CONFIGURACIÓN
// ============================================================
const ELIGIBLE: PS[] = [PS.pending, PS.in_process, PS.failed_preference];
const TIMEOUT_MINUTES = Number(process.env.PENDING_TIMEOUT_MINUTES ?? "5");
const BATCH_LIMIT = Number(process.env.TIMEOUT_BATCH_LIMIT ?? "1000");
const IS_DEV = process.env.NODE_ENV === "development";

// ============================================================
// FUNCIÓN AUXILIAR → Archiva un ticket vencido o pendiente
// ============================================================
async function archiveTicket(ticketId: string) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({
      where: { id: ticketId },
      include: {
        vipTable: true,
        vipTableConfig: {
          include: { vipLocation: true },
        },
      },
    });

    if (!ticket) return { skipped: true, reason: "not_found" };
    if (!ELIGIBLE.includes(ticket.paymentStatus)) {
      return { skipped: true, reason: "status_not_eligible" };
    }

    // 🔹 Crear snapshot histórico
    await tx.ticketArchive.create({
      data: {
        archivedFromId: ticket.id,
        eventId: ticket.eventId,
        archivedAt: new Date(),
        archivedBy: "system-cron",
        archiveReason: "payment_timeout",

        ticketType: ticket.ticketType,
        gender: ticket.gender,
        quantity: ticket.quantity,

        vipTableConfigId: ticket.vipTableConfigId ?? null,
        vipTableId: ticket.vipTableId ?? null,

        totalPrice: ticket.totalPrice,

        customerName: ticket.customerName,
        customerEmail: ticket.customerEmail,
        customerPhone: ticket.customerPhone,
        customerDni: ticket.customerDni,

        paymentId: ticket.paymentId,
        paymentStatus: ticket.paymentStatus,
        paymentMethod: ticket.paymentMethod,

        qrCode: ticket.qrCode,
        validationCode: ticket.validationCode,
        validated: ticket.validated,
        validatedAt: ticket.validatedAt,

        purchaseDate: ticket.purchaseDate,
        eventDate: ticket.eventDate,
        expiresAt: ticket.expiresAt,

        ticketConfigId: ticket.ticketConfigId,
        emailSentAt: ticket.emailSentAt,

        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      },
    });

    // 🔹 Si era VIP → liberar mesa y actualizar stock
    if (ticket.ticketType === TT.vip && ticket.vipTableConfigId) {
      const cfg = await tx.vipTableConfig.findUnique({
        where: { id: ticket.vipTableConfigId },
        select: { id: true, soldCount: true },
      });

      if (cfg) {
        await tx.vipTableConfig.update({
          where: { id: cfg.id },
          data: { soldCount: Math.max(0, (cfg.soldCount ?? 0) - 1) },
        });
      }

      if (ticket.vipTableId) {
        await tx.vipTable.update({
          where: { id: ticket.vipTableId },
          data: { status: VipTableStatus.available },
        });
      }
    }

    // 🔹 Eliminar ticket original
    await tx.ticket.delete({ where: { id: ticket.id } });

    return { archived: true };
  });
}

// ============================================================
// CONTROLADOR PRINCIPAL
// ============================================================
async function handle(req: NextRequest) {
  try {
    // 🔐 Autenticación del cron
    const key = req.headers.get("x-cron-key");
    const expectedKey = process.env.CRON_SECRET?.trim();

    // ⚙️ Si estás en desarrollo, se permite ejecutar sin clave
    if (!IS_DEV) {
      if (expectedKey && key !== expectedKey) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      console.log("⚠️  Cron ejecutado en modo desarrollo (sin validar clave)");
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() - TIMEOUT_MINUTES * 60_000);

    // 🔎 Buscar tickets pendientes o vencidos
    const pendingTickets = await prisma.ticket.findMany({
      where: {
        paymentStatus: { in: ELIGIBLE },
        OR: [{ expiresAt: { lte: now } }, { purchaseDate: { lt: cutoff } }],
      },
      select: { id: true },
      take: BATCH_LIMIT,
    });

    let archivedCount = 0;
    for (const t of pendingTickets) {
      try {
        const result = await archiveTicket(t.id);
        if (result.archived) archivedCount++;
      } catch (error) {
        console.error(`❌ Error archivando ticket ${t.id}:`, error);
      }
    }

    return NextResponse.json({
      ok: true,
      checked: pendingTickets.length,
      archived: archivedCount,
      timeoutMinutes: TIMEOUT_MINUTES,
      timestamp: now,
      devMode: IS_DEV,
    });
  } catch (error) {
    console.error("[timeout-pending][ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// ============================================================
// ENDPOINTS (GET y POST)
// ============================================================
export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
