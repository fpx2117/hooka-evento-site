// app/api/export/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

/* =========================
   Tipos
========================= */
type Format = "excel" | "pdf";

type Filters = {
  eventId?: string;
  dateFrom?: string;
  dateTo?: string;
};

type FlatRow = {
  type: "general" | "vip";
  customerName: string;
  gender: string | null;
  customerEmail: string;
  customerPhone: string;
  customerDni: string;
  quantity: number;
  paymentMethod: string;
  paymentStatus: string;
  validationCode: string;
  totalPrice: number;

  vipLocation?: string | null;
  tableNumber?: number | null;
  capacityPerTable?: number | null;
};

/* =========================
   Helpers
========================= */
function buildDateFilter(
  dateField: "purchaseDate" | "createdAt",
  opts?: { dateFrom?: string; dateTo?: string }
) {
  const where: any = {};
  const { dateFrom, dateTo } = opts || {};
  if (dateFrom) {
    where[dateField] = { ...(where[dateField] || {}), gte: new Date(dateFrom) };
  }
  if (dateTo) {
    const end = new Date(dateTo);
    end.setDate(end.getDate() + 1);
    where[dateField] = { ...(where[dateField] || {}), lt: end };
  }
  return where;
}

function toArrayBuffer(data: ArrayBuffer | SharedArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) {
    return data;
  }

  if (data instanceof SharedArrayBuffer) {
    // Copiamos su contenido a un ArrayBuffer normal
    const uint8 = new Uint8Array(data);
    const clone = new Uint8Array(uint8.length);
    clone.set(uint8);
    return clone.buffer; // ✅ garantizado ArrayBuffer puro
  }

  // Caso Uint8Array
  const buffer = data.buffer as ArrayBuffer | SharedArrayBuffer;
  if (buffer instanceof SharedArrayBuffer) {
    const clone = new Uint8Array(data.byteLength);
    clone.set(data);
    return clone.buffer; // ✅ fuerza ArrayBuffer
  }

  // ✅ caso normal
  return buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

function fileResponse(data: ArrayBuffer | Uint8Array, filename: string, type: string) {
  const ab = toArrayBuffer(data);
  return new Response(ab, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function findLogoPath(): string | null {
  const files = ["logov1@2x.png", "logov1.png", "logo.png", "logo.jpg"];
  for (const f of files) {
    const p = path.join(process.cwd(), "public", f);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function readLogoBase64(): { base64: string; ext: "png" | "jpeg" } | null {
  const file = findLogoPath();
  if (!file) return null;
  const buf = fs.readFileSync(file);
  const isPng = file.toLowerCase().endsWith(".png");
  return { base64: buf.toString("base64"), ext: isPng ? "png" : "jpeg" };
}

function readLogoBytes(): { bytes: Uint8Array; isPng: boolean } | null {
  const file = findLogoPath();
  if (!file) return null;
  const buf = fs.readFileSync(file);
  return { bytes: new Uint8Array(buf), isPng: file.toLowerCase().endsWith(".png") };
}

function formatSector(name?: string | null): string {
  if (!name) return "—";
  const lower = name.toLowerCase();
  if (lower === "dj") return "SECTOR DJ";
  if (lower === "piscina") return "SECTOR PISCINA";
  if (lower === "general") return "SECTOR GENERAL";
  return `SECTOR ${name.toUpperCase()}`;
}

/* =========================
   ENDPOINT PRINCIPAL
========================= */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const format: Format = body.format;
    const filters: Filters = body.filters || {};

    if (!format) return new Response("Falta parámetro: format", { status: 400 });

    const whereTickets: any = {};
    if (filters.eventId) whereTickets.eventId = filters.eventId;
    Object.assign(
      whereTickets,
      buildDateFilter("purchaseDate", { dateFrom: filters.dateFrom, dateTo: filters.dateTo })
    );

    // ✅ Consulta Prisma ajustada a tu schema
    const ticketsRaw = await prisma.ticket.findMany({
      where: whereTickets,
      orderBy: { purchaseDate: "desc" },
      select: {
        ticketType: true,
        customerName: true,
        gender: true,
        customerEmail: true,
        customerPhone: true,
        customerDni: true,
        quantity: true,
        paymentMethod: true,
        paymentStatus: true,
        validationCode: true,
        totalPrice: true,
        vipLocation: true, // enum directo
        vipLocationRef: { select: { name: true } }, // relación real
        vipTable: { select: { tableNumber: true, capacityPerTable: true } }, // relación real
      },
    });

    const rows: FlatRow[] = ticketsRaw.map((r) => {
      const isVip = r.ticketType === "vip";
      return {
        type: isVip ? "vip" : "general",
        customerName: r.customerName ?? "",
        gender: r.gender ?? null,
        customerEmail: r.customerEmail ?? "",
        customerPhone: r.customerPhone ?? "",
        customerDni: r.customerDni ?? "",
        quantity: isVip ? 1 : r.quantity ?? 0,
        paymentMethod: String(r.paymentMethod),
        paymentStatus: String(r.paymentStatus),
        validationCode: r.validationCode ?? "—",
        totalPrice: Number(r.totalPrice ?? 0),

        vipLocation: r.vipLocationRef?.name ?? (r.vipLocation ?? null),
        tableNumber: r.vipTable?.tableNumber ?? null,
        capacityPerTable: r.vipTable?.capacityPerTable ?? null,
      };
    });

    if (format === "excel") {
      const data = await toExcel(rows);
      return fileResponse(data, "reporte_unificado.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } else {
      const data = await toPdf(rows);
      return fileResponse(data, "reporte_unificado.pdf", "application/pdf");
    }
  } catch (err) {
    console.error("[export error]", err);
    return new Response("Error al generar exportación", { status: 500 });
  }
}

/* =========================
   EXCEL EXPORT
========================= */
async function toExcel(rows: FlatRow[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Reporte");

  ws.columns = [
    { header: "Tipo", key: "type", width: 10 },
    { header: "Nombre", key: "customerName", width: 28 },
    { header: "Género", key: "gender", width: 12 },
    { header: "Email", key: "customerEmail", width: 30 },
    { header: "Teléfono", key: "customerPhone", width: 18 },
    { header: "DNI", key: "customerDni", width: 14 },
    { header: "Cantidad", key: "quantity", width: 10 },
    { header: "Método Pago", key: "paymentMethod", width: 16 },
    { header: "Estado Pago", key: "paymentStatus", width: 16 },
    { header: "Código", key: "validationCode", width: 16 },
    { header: "Total", key: "totalPrice", width: 14 },
    { header: "Ubicación VIP", key: "vipLocation", width: 20 },
    { header: "N° Mesa", key: "tableNumber", width: 12 },
    { header: "Capacidad", key: "capacityPerTable", width: 14 },
  ];

  ws.addRows(
    rows.map((r) => [
      r.type === "vip" ? "VIP" : "General",
      r.customerName,
      r.gender ?? "—",
      r.customerEmail,
      r.customerPhone,
      r.customerDni,
      r.quantity,
      r.paymentMethod,
      r.paymentStatus,
      r.validationCode,
      r.totalPrice,
      formatSector(r.vipLocation),
      r.tableNumber ?? "—",
      r.capacityPerTable ?? "—",
    ])
  );

  return wb.xlsx.writeBuffer();
}

/* =========================
   PDF EXPORT
========================= */
async function toPdf(rows: FlatRow[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.addPage([595, 842]);
  let y = 800;

  page.drawText("Reporte de Entradas", { x: 40, y, size: 18, font: fontB });
  y -= 25;

  rows.forEach((r, i) => {
    if (y < 60) {
      pdf.addPage([595, 842]);
      y = 800;
    }
    const tipo = r.type === "vip" ? "VIP" : "General";
    page.drawText(
      `${i + 1}. ${r.customerName} (${tipo}) - ${formatSector(r.vipLocation)} - Mesa ${
        r.tableNumber ?? "—"
      }`,
      { x: 40, y, size: 10, font }
    );
    y -= 15;
  });

  return pdf.save();
}
