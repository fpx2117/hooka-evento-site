// app/api/table-reservations/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { PaymentStatus, TableLocation, PaymentMethod } from "@prisma/client";

const s = (v: unknown) =>
  v === undefined || v === null ? undefined : String(v).trim();
const onlyDigits = (v?: string) => (v || "").replace(/\D+/g, "");
const parseLocation = (v?: string | null): TableLocation => {
  const k = (v || "").toLowerCase();
  if (k === "dj") return "dj";
  if (k === "piscina") return "piscina";
  return "general";
};

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const row = await prisma.tableReservation.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        eventId: true,
        vipTableConfigId: true,
        location: true,
        tables: true,
        capacity: true,
        guests: true,
        totalPrice: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        customerDni: true,
        reservationDate: true,
        paymentStatus: true,
        paymentMethod: true,
        qrCode: true,
        validationCode: true,
        validated: true,
        validatedAt: true,
        createdAt: true,
        expiresAt: true,
      },
    });
    if (!row)
      return NextResponse.json(
        { error: "Reserva no encontrada" },
        { status: 404 }
      );
    return NextResponse.json({ data: row });
  } catch (e) {
    console.error("[table-reservations/:id][GET] error:", e);
    return NextResponse.json(
      { error: "Error obteniendo la reserva" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/table-reservations/:id
 * Permite:
 * - actualizar datos del cliente
 * - (opcional) mover la reserva de ubicación si hay disponibilidad
 * - cancelar (paymentStatus = cancelled)
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const body = await req.json();
    const action = s(body.action); // "update" | "cancel"
    const id = params.id;

    const existing = await prisma.tableReservation.findUnique({
      where: { id },
      select: {
        id: true,
        eventId: true,
        vipTableConfigId: true,
        location: true,
        tables: true,
        paymentStatus: true,
      },
    });
    if (!existing)
      return NextResponse.json(
        { error: "Reserva no encontrada" },
        { status: 404 }
      );

    if (action === "cancel") {
      if (existing.paymentStatus === "approved") {
        return NextResponse.json(
          { error: "No se puede cancelar una reserva aprobada" },
          { status: 400 }
        );
      }
      const updated = await prisma.tableReservation.update({
        where: { id },
        data: { paymentStatus: "cancelled" as PaymentStatus },
        select: { id: true, paymentStatus: true },
      });
      return NextResponse.json({ data: updated });
    }

    // Actualización de datos del cliente y (opcional) cambio de ubicación
    const customerName = s(body.customer?.name);
    const customerEmail = s(body.customer?.email);
    const customerPhone = s(body.customer?.phone)
      ? onlyDigits(body.customer?.phone)
      : undefined;
    const customerDni = s(body.customer?.dni)
      ? onlyDigits(body.customer?.dni)
      : undefined;

    let data: any = {};
    if (customerName !== undefined) data.customerName = customerName;
    if (customerEmail !== undefined) data.customerEmail = customerEmail;
    if (customerPhone !== undefined) data.customerPhone = customerPhone;
    if (customerDni !== undefined) data.customerDni = customerDni;

    // Cambio de ubicación (si se envía)
    if (body.location) {
      const newLoc = parseLocation(body.location);
      if (newLoc !== existing.location) {
        const cfg = await prisma.vipTableConfig.findFirst({
          where: { eventId: existing.eventId, location: newLoc },
          select: { id: true, stockLimit: true, soldCount: true },
        });
        if (!cfg)
          return NextResponse.json(
            { error: "Nueva ubicación no configurada" },
            { status: 400 }
          );

        // Para mover, chequeamos disponibilidad de MESAS en la nueva ubicación
        const pend = await prisma.tableReservation.aggregate({
          where: {
            eventId: existing.eventId,
            vipTableConfigId: cfg.id,
            location: newLoc,
            paymentStatus: { in: ["pending", "in_process"] as PaymentStatus[] },
          },
          _sum: { tables: true },
        });
        const reservedPending = Number(pend._sum.tables || 0);
        const remaining = Math.max(
          0,
          Number(cfg.stockLimit || 0) -
            Number(cfg.soldCount || 0) -
            reservedPending
        );
        if (remaining < existing.tables) {
          return NextResponse.json(
            { error: "Sin disponibilidad en la nueva ubicación" },
            { status: 409 }
          );
        }

        data.location = newLoc;
        data.vipTableConfigId = cfg.id;
      }
    }

    const updated = await prisma.tableReservation.update({
      where: { id },
      data,
      select: {
        id: true,
        vipTableConfigId: true,
        location: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        customerDni: true,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (e) {
    console.error("[table-reservations/:id][PATCH] error:", e);
    return NextResponse.json(
      { error: "Error actualizando la reserva" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const existing = await prisma.tableReservation.findUnique({
      where: { id: params.id },
      select: { id: true, paymentStatus: true },
    });
    if (!existing)
      return NextResponse.json(
        { error: "Reserva no encontrada" },
        { status: 404 }
      );
    if (existing.paymentStatus === "approved") {
      return NextResponse.json(
        { error: "No se puede eliminar una reserva aprobada" },
        { status: 400 }
      );
    }
    await prisma.tableReservation.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[table-reservations/:id][DELETE] error:", e);
    return NextResponse.json(
      { error: "Error eliminando la reserva" },
      { status: 500 }
    );
  }
}
