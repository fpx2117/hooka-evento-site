// app/api/table-reservations/[id]/approve/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { PaymentStatus, PaymentMethod } from "@prisma/client";

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const body = await req.json().catch(() => ({}));
    // Permite setear paymentMethod si es manual (transferencia/efectivo)
    const paymentMethod =
      (body?.paymentMethod as keyof typeof PaymentMethod) ?? "transferencia";

    const resv = await prisma.tableReservation.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        eventId: true,
        vipTableConfigId: true,
        location: true,
        tables: true,
        capacity: true,
        totalPrice: true,
        paymentStatus: true,
        paymentMethod: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        customerDni: true,
      },
    });
    if (!resv)
      return NextResponse.json(
        { error: "Reserva no encontrada" },
        { status: 404 }
      );

    if (resv.paymentStatus === "approved") {
      // Idempotencia: si ya hay ticket aprobado vinculado, no repetir
      const already = await prisma.ticket.findFirst({
        where: {
          tableReservationId: resv.id,
          paymentStatus: "approved" as PaymentStatus,
        },
        select: { id: true },
      });
      if (already)
        return NextResponse.json({ ok: true, message: "Reserva ya aprobada" });
    }

    await prisma.$transaction(async (tx) => {
      // 1) Marcar aprobada
      await tx.tableReservation.update({
        where: { id: resv.id },
        data: {
          paymentStatus: "approved",
          paymentMethod: paymentMethod as PaymentMethod,
        },
      });

      // 2) Incrementar soldCount de mesas
      if (resv.vipTableConfigId) {
        await tx.vipTableConfig.update({
          where: { id: resv.vipTableConfigId },
          data: { soldCount: { increment: resv.tables } },
        });
      }

      // 3) Crear Ticket VIP por personas (descuento de cupo global)
      const ev = await tx.event.findUnique({
        where: { id: resv.eventId },
        select: { date: true },
      });

      await tx.ticket.create({
        data: {
          eventId: resv.eventId,
          eventDate: ev?.date,
          ticketType: "vip",
          quantity: resv.capacity, // personas
          totalPrice: resv.totalPrice,
          paymentStatus: "approved",
          paymentMethod: paymentMethod as PaymentMethod,
          tableReservationId: resv.id,
          // opcionales de cliente (no se usan para género en VIP)
          customerName: resv.customerName,
          customerEmail: resv.customerEmail,
          customerPhone: resv.customerPhone,
          customerDni: resv.customerDni,
          // guardamos la ubicación como metadata simple en Ticket (si lo agregaste)
          location: resv.location as any,
        } as any,
      });
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[table-reservations/:id/approve][POST] error:", e);
    return NextResponse.json(
      { error: "Error aprobando la reserva" },
      { status: 500 }
    );
  }
}
