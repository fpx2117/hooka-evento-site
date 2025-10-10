// app/api/tickets/public/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/tickets/public?type=ticket|vip-table&id=XXXX[&requireApproved=1]
 * Devuelve qrCode y validationCode (y algunos metadatos mínimos) para la pantalla de "success".
 *
 * Seguridad:
 *  - Por defecto requiere approved si PUBLIC_TICKETS_REQUIRE_APPROVED=true (recomendado).
 *  - También podés forzarlo por query: requireApproved=1.
 *
 * Auto-heal:
 *  - Si el registro está en approved y le faltan qrCode/validationCode, los genera con reintentos de unicidad.
 */

const REQUIRE_APPROVED_DEFAULT =
  (process.env.PUBLIC_TICKETS_REQUIRE_APPROVED || "true").toLowerCase() ===
  "true";

function json(payload: any, init?: number | ResponseInit) {
  const initObj: ResponseInit =
    typeof init === "number" ? { status: init } : init || {};
  const headers = new Headers(initObj.headers || {});
  // Evitamos caches intermedios
  headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return NextResponse.json(payload, { ...initObj, headers });
}

function generateQr(): string {
  return `TICKET-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function generateValidationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const type = sp.get("type");
    const id = sp.get("id");
    const requireApproved = sp.get("requireApproved")
      ? sp.get("requireApproved") === "1"
      : REQUIRE_APPROVED_DEFAULT;

    if (!type || !id) {
      return json({ ok: false, error: "Faltan parámetros (type, id)" }, 400);
    }
    if (type !== "ticket" && type !== "vip-table") {
      return json({ ok: false, error: "Tipo inválido" }, 400);
    }

    if (type === "ticket") {
      let rec = await prisma.ticket.findUnique({
        where: { id },
        select: {
          id: true,
          customerName: true,
          paymentStatus: true,
          qrCode: true,
          validationCode: true,
          totalPrice: true,
        },
      });
      if (!rec) return json({ ok: false, error: "Not found" }, 404);

      if (requireApproved && rec.paymentStatus !== "approved") {
        return json({ ok: false, error: "Pago no aprobado aún" }, 409);
      }

      // Si está approved y faltan códigos: los generamos (idempotente, con reintentos por unicidad)
      if (
        rec.paymentStatus === "approved" &&
        (!rec.qrCode || !rec.validationCode)
      ) {
        let attempts = 0;
        while (attempts < 3) {
          try {
            const dataToUpdate: any = {};
            if (!rec.qrCode) dataToUpdate.qrCode = generateQr();
            if (!rec.validationCode)
              dataToUpdate.validationCode = generateValidationCode();

            rec = await prisma.ticket.update({
              where: { id },
              data: dataToUpdate,
              select: {
                id: true,
                customerName: true,
                paymentStatus: true,
                qrCode: true,
                validationCode: true,
                totalPrice: true,
              },
            });
            break;
          } catch (e: any) {
            if (e?.code === "P2002") {
              attempts++;
              continue;
            }
            throw e;
          }
        }
      }

      return json({
        ok: true,
        type: "ticket",
        recordId: rec.id,
        customerName: rec.customerName,
        paymentStatus: rec.paymentStatus,
        qrCode: rec.qrCode,
        validationCode: rec.validationCode,
        totalPrice: Number(rec.totalPrice || 0),
      });
    }

    // vip-table
    let rec = await prisma.tableReservation.findUnique({
      where: { id },
      select: {
        id: true,
        customerName: true,
        paymentStatus: true,
        qrCode: true,
        validationCode: true,
        totalPrice: true,
      },
    });
    if (!rec) return json({ ok: false, error: "Not found" }, 404);

    if (requireApproved && rec.paymentStatus !== "approved") {
      return json({ ok: false, error: "Pago no aprobado aún" }, 409);
    }

    if (
      rec.paymentStatus === "approved" &&
      (!rec.qrCode || !rec.validationCode)
    ) {
      let attempts = 0;
      while (attempts < 3) {
        try {
          const dataToUpdate: any = {};
          if (!rec.qrCode) dataToUpdate.qrCode = generateQr();
          if (!rec.validationCode)
            dataToUpdate.validationCode = generateValidationCode();

          rec = await prisma.tableReservation.update({
            where: { id },
            data: dataToUpdate,
            select: {
              id: true,
              customerName: true,
              paymentStatus: true,
              qrCode: true,
              validationCode: true,
              totalPrice: true,
            },
          });
          break;
        } catch (e: any) {
          if (e?.code === "P2002") {
            attempts++;
            continue;
          }
          throw e;
        }
      }
    }

    return json({
      ok: true,
      type: "vip-table",
      recordId: rec.id,
      customerName: rec.customerName,
      paymentStatus: rec.paymentStatus,
      qrCode: rec.qrCode,
      validationCode: rec.validationCode,
      totalPrice: Number(rec.totalPrice || 0),
    });
  } catch (e) {
    console.error("[tickets/public] error:", e);
    return json({ ok: false, error: "internal" }, 500);
  }
}
