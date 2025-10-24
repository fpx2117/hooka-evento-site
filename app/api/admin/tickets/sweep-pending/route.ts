export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PaymentStatus as PS, TicketType as TT } from "@prisma/client";

const ELIGIBLE: PS[] = [PS.pending, PS.in_process, PS.failed_preference];

async function archiveOne(ticketId: string) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.ticket.findUnique({ where: { id: ticketId } });
    if (!t) return { skipped: true, reason: "not_found" };
    if (!ELIGIBLE.includes(t.paymentStatus as PS))
      return { skipped: true, reason: "status_not_eligible" };

    // crear archivo
    await tx.ticketArchive.create({
      data: {
        archivedFromId: t.id,
        eventId: t.eventId,
        archivedAt: new Date(),
        archivedBy: "system-cron",
        archiveReason: "payment_timeout",
        // snapshot de datos
        ticketType: t.ticketType,
        gender: t.gender,
        quantity: t.quantity,
        vipLocation: t.vipLocation,
        vipTables: t.vipTables,
        capacityPerTable: t.capacityPerTable,
        tableNumber: t.tableNumber,
        totalPrice: t.totalPrice,
        customerName: t.customerName,
        customerEmail: t.customerEmail,
        customerPhone: t.customerPhone,
        customerDni: t.customerDni,
        paymentId: t.paymentId,
        paymentStatus: PS.cancelled, // archivamos como cancelado por timeout
        paymentMethod: t.paymentMethod,
        qrCode: t.qrCode,
        validationCode: t.validationCode,
        validated: t.validated,
        validatedAt: t.validatedAt,
        purchaseDate: t.purchaseDate,
        eventDate: t.eventDate,
        expiresAt: t.expiresAt,
        ticketConfigId: t.ticketConfigId,
        emailSentAt: t.emailSentAt,
      },
    });

    // si por algún motivo fuese VIP y estaba approved (no debería en esta barrida), reponer stock
    if (
      t.ticketType === TT.vip &&
      t.paymentStatus === PS.approved &&
      t.vipLocation &&
      t.vipTables
    ) {
      const cfg = await tx.vipTableConfig.findUnique({
        where: {
          eventId_location: { eventId: t.eventId, location: t.vipLocation },
        },
        select: { id: true, soldCount: true, stockLimit: true },
      });
      if (cfg) {
        await tx.vipTableConfig.update({
          where: { id: cfg.id },
          data: { soldCount: Math.max(0, cfg.soldCount - t.vipTables) },
        });
      }
    }

    // borrar de tickets
    await tx.ticket.delete({ where: { id: t.id } });
    return { archived: true };
  });
}

export async function POST(req: NextRequest) {
  // (opcional) auth mínima con cabecera secreta
  const key = req.headers.get("x-cron-key");
  if (process.env.CRON_SECRET && key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // buscar elegibles
  const items = await prisma.ticket.findMany({
    where: {
      paymentStatus: { in: ELIGIBLE },
      expiresAt: { lte: now },
    },
    select: { id: true },
    take: 1000, // lote de seguridad
  });

  let archived = 0;
  for (const it of items) {
    const r = await archiveOne(it.id);
    if ((r as any).archived) archived++;
  }

  return NextResponse.json({
    ok: true,
    checked: items.length,
    archived,
    now,
  });
}
