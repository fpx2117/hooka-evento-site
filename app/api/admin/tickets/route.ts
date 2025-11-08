// ========================================================
// Tickets Admin API — Versión Final 2025 ✅ (Total VIP corregido)
// ========================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  PaymentStatus as PS,
  PaymentMethod as PM,
  TicketType as TT,
  ArchiveReason as AR,
  Prisma,
} from "@prisma/client";
import { jwtVerify } from "jose";
import { ensureSixDigitCode } from "@/lib/validation-code";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key"
);

/* ============================================================
   Helpers
============================================================ */
async function verifyAuth(request: NextRequest) {
  const token = request.cookies.get("admin-token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

const normStr = (v: any) =>
  typeof v === "string" ? v.trim() || undefined : undefined;
const normNum = (v: any) =>
  v === undefined || v === null || v === "" ? undefined : Number(v);

/* ============================================================
   Obtener evento activo
============================================================ */
async function getActiveEvent() {
  return prisma.event.findFirst({
    where: { isActive: true },
    select: { id: true, date: true },
  });
}

/* ============================================================
   GET — Listar tickets con datos completos de mesa VIP
============================================================ */
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = normStr(searchParams.get("q"));

  const where: Prisma.TicketWhereInput = q
    ? {
        OR: [
          { customerName: { contains: q, mode: "insensitive" } },
          { customerEmail: { contains: q, mode: "insensitive" } },
          { customerDni: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const tickets = await prisma.ticket.findMany({
    where,
    include: {
      event: { select: { id: true, name: true, date: true } },
      vipLocation: { select: { id: true, name: true} },
      vipTable: { select: { id: true, tableNumber: true, status: true, price: true, vipTableConfigId: true } },
      vipTableConfig: { select: { id: true, capacityPerTable: true, price: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = tickets.map((t) => ({
    ...t,
    vipLocationName: t.vipLocation?.name ?? null,
    vipTableNumber: t.vipTable?.tableNumber ?? null,
  }));

  return NextResponse.json({ ok: true, tickets: result });
}

/* ============================================================
   POST — Crear ticket (VIP o general)
============================================================ */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const event = await getActiveEvent();
    if (!event)
      return NextResponse.json({ error: "No hay evento activo" }, { status: 400 });

    const customerName = normStr(body.customerName);
    const customerEmail = normStr(body.customerEmail);
    const customerPhone = normStr(body.customerPhone);
    const customerDni = normStr(body.customerDni);
    if (!customerName || !customerEmail || !customerPhone || !customerDni)
      return NextResponse.json(
        { error: "Faltan campos del cliente" },
        { status: 400 }
      );

    const ticketType = (normStr(body.ticketType) as TT) ?? TT.general;
    const paymentStatus = (normStr(body.paymentStatus) as PS) ?? PS.pending;
    const vipLocationId = normStr(body.vipLocationId);
    const vipTableIdBody = normStr(body.vipTableId);

    let vipTableId: string | undefined;
    let vipTableConfigId: string | undefined;

    // ✅ Determinar precio correcto
    let totalPrice: Prisma.Decimal = new Prisma.Decimal(0);

    if (ticketType === TT.vip && vipLocationId) {
      // 1) Si el cliente seleccionó una mesa, intentar usar su precio
      if (vipTableIdBody) {
        const mesa = await prisma.vipTable.findUnique({
          where: { id: vipTableIdBody },
          select: { id: true, price: true, vipTableConfigId: true },
        });
        if (!mesa) {
          return NextResponse.json(
            { error: "La mesa seleccionada no existe" },
            { status: 400 }
          );
        }

        if (mesa.price !== null) {
          totalPrice = new Prisma.Decimal(Number(mesa.price));
        } else if (mesa.vipTableConfigId) {
          const cfg = await prisma.vipTableConfig.findUnique({
            where: { id: mesa.vipTableConfigId },
            select: { id: true, price: true },
          });
          if (cfg?.price != null) {
            totalPrice = new Prisma.Decimal(Number(cfg.price));
            vipTableConfigId = cfg.id;
          }
        }

        vipTableId = mesa.id;
        vipTableConfigId = vipTableConfigId ?? mesa.vipTableConfigId ?? undefined;
      }

      // 2) Si aún no hay precio (o no hay mesa elegida), usar config por ubicación
      if (totalPrice.equals(0)) {
        const config = await prisma.vipTableConfig.findFirst({
          where: { eventId: event.id, vipLocationId },
          select: { id: true, price: true },
        });
        if (config?.price != null) {
          totalPrice = new Prisma.Decimal(Number(config.price));
          vipTableConfigId = config.id;
        }
      }
    } else {
      // 🎟️ Entrada general (usa totalPrice del body)
      totalPrice =
        body.totalPrice !== undefined &&
        body.totalPrice !== null &&
        String(body.totalPrice).trim() !== ""
          ? new Prisma.Decimal(Number(body.totalPrice))
          : new Prisma.Decimal(0);
    }

    // 🪑 Si es VIP aprobado pero no vino mesa específica, asignar una libre
    if (ticketType === TT.vip && vipLocationId && paymentStatus === PS.approved && !vipTableId) {
      const mesa = await prisma.vipTable.findFirst({
        where: {
          eventId: event.id,
          vipLocationId,
          status: "available",
        },
        orderBy: { tableNumber: "asc" },
      });

      if (!mesa)
        return NextResponse.json(
          { error: "No hay mesas disponibles en esta ubicación" },
          { status: 400 }
        );

      // Recalcular precio con la mesa asignada (o su config)
      if (mesa.price != null) {
        totalPrice = new Prisma.Decimal(Number(mesa.price));
      } else if (mesa.vipTableConfigId) {
        const cfg = await prisma.vipTableConfig.findUnique({
          where: { id: mesa.vipTableConfigId },
          select: { id: true, price: true },
        });
        if (cfg?.price != null) {
          totalPrice = new Prisma.Decimal(Number(cfg.price));
          vipTableConfigId = cfg.id;
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.vipTable.update({
          where: { id: mesa.id },
          data: { status: "sold" },
        });

        if (mesa.vipTableConfigId) {
          await tx.vipTableConfig.update({
            where: { id: mesa.vipTableConfigId },
            data: { soldCount: { increment: 1 } },
          });
        }
      });

      vipTableId = mesa.id;
      vipTableConfigId = vipTableConfigId ?? mesa.vipTableConfigId ?? undefined;
    }

    const ticket = await prisma.ticket.create({
      data: {
        event: { connect: { id: event.id } },
        ticketType,
        totalPrice,
        customerName,
        customerEmail,
        customerPhone,
        customerDni,
        paymentMethod: PM.mercadopago,
        paymentStatus,
        ...(vipLocationId && { vipLocation: { connect: { id: vipLocationId } } }),
        ...(vipTableId && { vipTable: { connect: { id: vipTableId } } }),
        ...(vipTableConfigId && {
          vipTableConfig: { connect: { id: vipTableConfigId } },
        }),
      },
      include: { vipLocation: true, vipTable: true, vipTableConfig: true },
    });

    if (paymentStatus === PS.approved) {
      await ensureSixDigitCode(prisma, { id: ticket.id });
    }

    return NextResponse.json({ ok: true, ticket });
  } catch (e) {
    console.error("[Ticket POST Error]", e);
    return NextResponse.json(
      { error: "Error al crear ticket" },
      { status: 500 }
    );
  }
}

/* ============================================================
   PUT — Actualizar ticket (VIP o general)
============================================================ */
export async function PUT(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const id = normStr(body.id);
    if (!id)
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });

    const current = await prisma.ticket.findUnique({
      where: { id },
      include: { vipTable: true },
    });
    if (!current)
      return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

    const newStatus = normStr(body.paymentStatus) as PS | undefined;
    const data: Prisma.TicketUpdateInput = {};

    // ====================================================
    // Caso 1: Cambio a aprobado (VIP o general)
    // ====================================================
    if (newStatus === PS.approved && current.paymentStatus !== PS.approved) {
      let vipTableIdToSet: string | undefined;
      let vipTableConfigIdToSet: string | null | undefined = undefined;
      let newTotal: Prisma.Decimal | undefined;

      await prisma.$transaction(async (tx) => {
        if (current.ticketType === TT.vip && current.vipLocationId) {
          // Asignar mesa disponible
          const mesa = await tx.vipTable.findFirst({
            where: {
              eventId: current.eventId,
              vipLocationId: current.vipLocationId,
              status: "available",
            },
            orderBy: { tableNumber: "asc" },
          });

          if (mesa) {
            await tx.vipTable.update({
              where: { id: mesa.id },
              data: { status: "sold" },
            });

            if (mesa.vipTableConfigId) {
              await tx.vipTableConfig.update({
                where: { id: mesa.vipTableConfigId },
                data: { soldCount: { increment: 1 } },
              });
            }

            vipTableIdToSet = mesa.id;
            vipTableConfigIdToSet = mesa.vipTableConfigId ?? null;

            // Recalcular total con la mesa (o su config)
            if (mesa.price != null) {
              newTotal = new Prisma.Decimal(Number(mesa.price));
            } else if (mesa.vipTableConfigId) {
              const cfg = await tx.vipTableConfig.findUnique({
                where: { id: mesa.vipTableConfigId },
                select: { price: true },
              });
              if (cfg?.price != null) {
                newTotal = new Prisma.Decimal(Number(cfg.price));
              }
            }
          }
        }

        await tx.ticket.update({
          where: { id },
          data: {
            paymentStatus: PS.approved,
            ...(vipTableIdToSet && { vipTableId: vipTableIdToSet }),
            ...(vipTableConfigIdToSet !== undefined && {
              vipTableConfigId: vipTableConfigIdToSet,
            }),
            ...(newTotal && { totalPrice: newTotal }),
          },
        });

        await ensureSixDigitCode(tx, { id });
      });

      const updated = await prisma.ticket.findUnique({
        where: { id },
        include: { vipLocation: true, vipTable: true, vipTableConfig: true },
      });

      return NextResponse.json({ ok: true, ticket: updated });
    }

    // ====================================================
    // Caso 2: Actualización normal
    // ====================================================
    if (body.customerName) data.customerName = normStr(body.customerName);
    if (body.customerEmail) data.customerEmail = normStr(body.customerEmail);
    if (body.customerPhone) data.customerPhone = normStr(body.customerPhone);
    if (body.customerDni) data.customerDni = normStr(body.customerDni);
    if (body.totalPrice !== undefined)
      data.totalPrice =
        body.totalPrice !== null && String(body.totalPrice).trim() !== ""
          ? new Prisma.Decimal(Number(body.totalPrice))
          : new Prisma.Decimal(0);
    if (newStatus) data.paymentStatus = newStatus;

    const updated = await prisma.ticket.update({
      where: { id },
      data,
      include: { vipLocation: true, vipTable: true, vipTableConfig: true },
    });

    if (updated.paymentStatus === PS.approved && !updated.validationCode) {
      await ensureSixDigitCode(prisma, { id });
    }

    return NextResponse.json({ ok: true, ticket: updated });
  } catch (e) {
    console.error("[Ticket PUT Error]", e);
    return NextResponse.json(
      { error: "Error al actualizar ticket" },
      { status: 500 }
    );
  }
}

// ✅ Alias PATCH → usa la misma lógica que PUT
export const PATCH = PUT;

/* ============================================================
   DELETE — Archivar y liberar mesa VIP
============================================================ */
export async function DELETE(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = normStr(searchParams.get("id"));
    if (!id)
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: { vipTable: true },
    });
    if (!ticket)
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      if (ticket.vipTableId) {
        await tx.vipTable.update({
          where: { id: ticket.vipTableId },
          data: { status: "available" },
        });

        if (ticket.vipTableConfigId) {
          await tx.vipTableConfig.update({
            where: { id: ticket.vipTableConfigId },
            data: { soldCount: { decrement: 1 } },
          });
        }
      }

      await tx.ticketArchive.create({
        data: {
          archivedFrom: { connect: { id: ticket.id } },
          event: { connect: { id: ticket.eventId } },
          ticketType: ticket.ticketType,
          gender: ticket.gender,
          quantity: ticket.quantity,
          totalPrice: ticket.totalPrice,
          customerName: ticket.customerName,
          customerEmail: ticket.customerEmail,
          customerPhone: ticket.customerPhone,
          customerDni: ticket.customerDni,
          paymentId: ticket.paymentId,
          paymentStatus: ticket.paymentStatus,
          paymentMethod: ticket.paymentMethod,
          archiveReason: AR.admin_cancelled,
        },
      });

      await tx.ticket.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true, archived: true });
  } catch (e) {
    console.error("[Ticket DELETE Error]", e);
    return NextResponse.json(
      { error: "Error al eliminar ticket" },
      { status: 500 }
    );
  }
}
