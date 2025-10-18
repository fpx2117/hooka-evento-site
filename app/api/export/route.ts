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
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
};

type FlatRow = {
  // Básicos
  type: "general" | "vip";
  customerName: string;
  gender: string | null;
  customerEmail: string;
  customerPhone: string;
  customerDni: string;
  quantity: number; // ✅ Cantidad de entradas (general) o 1 (vip)
  paymentMethod: string;
  paymentStatus: string;
  validationCode: string;
  totalPrice: number;

  // VIP
  vipLocation?: string | null;
  tableNumber?: number | null; // ✅ número de mesa
  vipTables?: number | null;
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
  const dateFrom = opts?.dateFrom;
  const dateTo = opts?.dateTo;

  if (dateFrom) {
    where[dateField] = { ...(where[dateField] || {}), gte: new Date(dateFrom) };
  }
  if (dateTo) {
    const end = new Date(dateTo);
    end.setDate(end.getDate() + 1); // incluir todo el día
    where[dateField] = { ...(where[dateField] || {}), lt: end };
  }
  return where;
}

function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  if (data.buffer instanceof ArrayBuffer) {
    return data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength
    );
  }
  const copy = new Uint8Array(data);
  const out = new Uint8Array(copy.length);
  out.set(copy);
  return out.buffer;
}

function fileResponse(
  data: ArrayBuffer | Uint8Array,
  filename: string,
  contentType: string
) {
  const ab = toArrayBuffer(data);
  return new Response(ab, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(ab.byteLength),
    },
  });
}

// Logo desde /public
function findLogoPath(): string | null {
  const candidates = [
    "logov1@2x.png",
    "logov1.png",
    "logo.png",
    "logo.jpg",
    "logo.jpeg",
  ].map((f) => path.join(process.cwd(), "public", f));
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function readLogoBase64(): { base64: string; ext: "png" | "jpeg" } | null {
  const file = findLogoPath();
  if (!file) return null;
  const buf = fs.readFileSync(file);
  const isPng = file.toLowerCase().endsWith(".png");
  // ✅ ext estrictamente tipado (evita "string is not assignable to 'png'|'jpeg'|'gif'")
  return { base64: buf.toString("base64"), ext: isPng ? "png" : "jpeg" };
}

function readLogoBytes(): { bytes: Uint8Array; isPng: boolean } | null {
  const file = findLogoPath();
  if (!file) return null;
  const buf = fs.readFileSync(file);
  return {
    bytes: new Uint8Array(buf),
    isPng: file.toLowerCase().endsWith(".png"),
  };
}

// ✅ Sector formateado para VIP
function formatSector(location: string | null | undefined): string {
  if (!location) return "—";
  const upper = location.trim().toLowerCase();
  if (upper === "dj") return "SECTOR - DJ";
  if (upper === "piscina") return "SECTOR - PISCINA";
  if (upper === "general") return "SECTOR - GENERAL";
  return `SECTOR - ${upper.toUpperCase()}`;
}

/* =========================
   ENDPOINT ÚNICO
========================= */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const format: Format = body?.format;
    const filters: Filters = body?.filters || {};

    if (!format) {
      return new Response("Falta parámetro: format", { status: 400 });
    }

    // ------- Tickets (general/vip) -------
    const whereTickets: any = {};
    if (filters.eventId) whereTickets.eventId = filters.eventId;

    // IMPORTANTE: si tu modelo usa createdAt en lugar de purchaseDate,
    // cambia aquí "purchaseDate" por "createdAt"
    Object.assign(
      whereTickets,
      buildDateFilter("purchaseDate", {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      })
    );

    const ticketsRaw = await prisma.ticket.findMany({
      where: whereTickets,
      orderBy: { purchaseDate: "desc" }, // o { createdAt: "desc" } si usás createdAt
      select: {
        ticketType: true,
        customerName: true,
        gender: true,
        customerEmail: true,
        customerPhone: true,
        customerDni: true,
        quantity: true, // ✅ cantidad para General
        paymentMethod: true,
        paymentStatus: true,
        validationCode: true,
        totalPrice: true,
        // VIP
        vipLocation: true,
        tableNumber: true, // ✅ número de mesa
        vipTables: true,
        capacityPerTable: true,
      },
    });

    const rows: FlatRow[] = ticketsRaw.map((r) => {
      const isVip = (r.ticketType as any) === "vip";
      return {
        type: isVip ? "vip" : "general",
        customerName: r.customerName ?? "",
        gender: (r.gender as any) ?? null,
        customerEmail: r.customerEmail ?? "",
        customerPhone: r.customerPhone ?? "",
        customerDni: r.customerDni ?? "",
        // ✅ cantidad: para VIP usamos 1 (una mesa por compra); para General, el quantity almacenado
        quantity: isVip ? 1 : Number(r.quantity ?? 0),
        paymentMethod: (r.paymentMethod as any) ?? "",
        paymentStatus: (r.paymentStatus as any) ?? "",
        validationCode: r.validationCode ?? "",
        totalPrice: Number(r.totalPrice ?? 0),
        // VIP
        vipLocation: r.vipLocation ?? null,
        tableNumber: r.tableNumber ?? null,
        vipTables: r.vipTables ?? null,
        capacityPerTable: r.capacityPerTable ?? null,
      };
    });

    // Export
    if (format === "excel") {
      const data = await toExcel(rows, "Reporte");
      return fileResponse(
        data,
        "reporte_unificado.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
    } else {
      const data = await toPdf(rows, "Reporte de Entradas (General & VIP)");
      return fileResponse(data, "reporte_unificado.pdf", "application/pdf");
    }
  } catch (err) {
    console.error(err);
    return new Response("Error al generar exportación", { status: 500 });
  }
}

/* =========================
   Excel con DISEÑO + LOGO
========================= */
async function toExcel(
  rows: FlatRow[],
  sheetName: string
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);

  // Portada
  ws.mergeCells("A1:N1");
  ws.mergeCells("A2:N2");

  const title = ws.getCell("A1");
  title.value = "Reporte";
  title.font = { bold: true, size: 22, color: { argb: "FF0F172A" } };
  title.alignment = { vertical: "middle" };

  const subtitle = ws.getCell("A2");
  subtitle.value = `Generado: ${new Date().toLocaleString()} · Registros: ${rows.length}`;
  subtitle.font = { size: 11, color: { argb: "FF334155" } };
  subtitle.alignment = { vertical: "middle" };

  ws.getRow(1).height = 30;
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 6;

  // Logo (arriba-derecha)
  const logo = readLogoBase64();
  if (logo) {
    const imgId = wb.addImage({ base64: logo.base64, extension: logo.ext }); // ext: "png" | "jpeg"
    ws.addImage(imgId, {
      tl: { col: 12.2, row: 0.2 }, // fuera de la tabla
      ext: { width: 240, height: 180 },
      editAs: "oneCell",
    });
  }

  // Columnas visibles (keys para formatos; la tabla se arma abajo)
  ws.columns = [
    { header: "Tipo", key: "type", width: 12 },
    { header: "Nombre", key: "customerName", width: 30 },
    { header: "Género", key: "gender", width: 12 },
    { header: "Email", key: "customerEmail", width: 34 },
    { header: "Teléfono", key: "customerPhone", width: 18 },
    { header: "DNI", key: "customerDni", width: 16 },
    { header: "Cantidad", key: "quantity", width: 12 }, // ✅ cantidad
    { header: "Método Pago", key: "paymentMethod", width: 16 },
    { header: "Estado Pago", key: "paymentStatus", width: 16 },
    { header: "Código Validación", key: "validationCode", width: 22 },
    { header: "Total", key: "totalPrice", width: 14 },
    { header: "Ubicación VIP", key: "vipLocation", width: 22 }, // ✅ SECTOR - DJ/PISCINA/GENERAL
    { header: "Número de Mesa", key: "tableNumber", width: 16 }, // ✅ mesa
    { header: "Capacidad/Mesa", key: "capacityPerTable", width: 16 },
  ];

  const tableStartRow = 5;
  if (tableStartRow > 4) ws.getRow(4).height = 4;

  // Congelar por arriba del header de tabla
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: tableStartRow }];

  // Tabla
  const table = ws.addTable({
    name: "UnifiedReport",
    ref: `A${tableStartRow}`,
    headerRow: true,
    totalsRow: true,
    style: {
      theme: "TableStyleMedium9",
      showRowStripes: true,
      showColumnStripes: false,
    },
    columns: [
      { name: "Tipo", filterButton: true },
      { name: "Nombre", filterButton: true, totalsRowLabel: "Totales" },
      { name: "Género", filterButton: true },
      { name: "Email", filterButton: true },
      { name: "Teléfono", filterButton: true },
      { name: "DNI", filterButton: true },
      { name: "Cantidad", filterButton: true, totalsRowFunction: "sum" }, // ✅ sumatoria cantidad
      { name: "Método Pago", filterButton: true },
      { name: "Estado Pago", filterButton: true },
      { name: "Código Validación", filterButton: true },
      { name: "Total", filterButton: true, totalsRowFunction: "sum" },
      { name: "Ubicación VIP", filterButton: true },
      { name: "Número de Mesa", filterButton: true },
      { name: "Capacidad/Mesa", filterButton: true },
    ],
    rows: rows.map((r) => [
      r.type === "vip" ? "VIP" : "General",
      r.customerName,
      r.gender ?? "—",
      r.customerEmail,
      r.customerPhone,
      r.customerDni,
      Number(r.quantity || 0), // ✅ cantidad
      r.paymentMethod,
      r.paymentStatus,
      r.validationCode || "—",
      Number(r.totalPrice || 0),
      r.type === "vip" ? formatSector(r.vipLocation) : "—", // ✅ SECTOR formateado
      r.type === "vip" ? (r.tableNumber ?? "—") : "—", // ✅ mesa
      r.type === "vip" ? Number(r.capacityPerTable ?? 0) : null,
    ]),
  });
  table.commit();

  // Formatos
  ws.getColumn("customerPhone").numFmt = "@";
  ws.getColumn("customerDni").numFmt = "@";
  ws.getColumn("totalPrice").numFmt = '"$"#,##0';
  ws.getColumn("quantity").numFmt = "0";
  ws.getColumn("tableNumber").numFmt = "0";
  ws.getRow(tableStartRow).height = 24;

  // Color por estado
  const firstDataRow = tableStartRow + 1;
  const lastDataRow = firstDataRow + rows.length - 1;
  const statusColIdx = 9; // "Estado Pago" (contando desde A=1)
  for (let r = firstDataRow; r <= lastDataRow; r++) {
    const c = ws.getRow(r).getCell(statusColIdx);
    const val = String(c.value ?? "").toLowerCase();
    if (val === "approved") {
      c.font = { color: { argb: "FF15803D" }, bold: true };
    } else if (val === "pending") {
      c.font = { color: { argb: "FFB45309" }, bold: true };
    } else if (val === "rejected") {
      c.font = { color: { argb: "FFB91C1C" }, bold: true };
    }
  }

  // Detalles de portada
  ws.getCell("A2").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF8FAFC" },
  };
  ws.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFFFFF" },
  };
  // línea suave separadora
  const maxHeader = 14;
  for (let i = 0; i < maxHeader; i++) {
    const col = String.fromCharCode("A".charCodeAt(0) + i);
    const addr = `${col}3`;
    ws.getCell(addr).border = {
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
    };
  }

  return wb.xlsx.writeBuffer();
}

/* =========================
   PDF DISEÑADO (blanco, sin rayas)
========================= */
async function toPdf(rows: FlatRow[], title: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);

  const A4 = { w: 595.28, h: 841.89 };
  const margin = 44;
  const line = 14;

  let page = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - margin;

  // Logo
  const logo = readLogoBytes();
  if (logo) {
    const img = logo.isPng
      ? await pdf.embedPng(logo.bytes)
      : await pdf.embedJpg(logo.bytes);
    const targetW = 140;
    const scale = targetW / img.width;
    const w = targetW;
    const h = img.height * scale;
    page.drawImage(img, {
      x: A4.w - margin - w,
      y: y - h + 6,
      width: w,
      height: h,
    });
  }

  // Título
  page.drawText(title, {
    x: margin,
    y,
    size: 20,
    font: fontB,
    color: rgb(0.06, 0.09, 0.16),
  });
  y -= line * 2;

  const draw = (txt: string, size = 10, bold = false, color = rgb(0, 0, 0)) => {
    if (y < margin + line * 4) {
      page = pdf.addPage([A4.w, A4.h]);
      y = A4.h - margin;
      page.drawText(title, {
        x: margin,
        y,
        size: 16,
        font: fontB,
        color: rgb(0.06, 0.09, 0.16),
      });
      y -= line * 1.4;
    }
    page.drawText(txt, {
      x: margin,
      y,
      size,
      font: bold ? fontB : font,
      color,
    });
    y -= line;
  };

  // Contenido
  rows.forEach((r, i) => {
    const tipo = r.type === "vip" ? "VIP" : "General";
    const sector = r.type === "vip" ? ` — ${formatSector(r.vipLocation)}` : "";
    const mesa =
      r.type === "vip" && r.tableNumber ? ` · Mesa #${r.tableNumber}` : "";
    const cantidad = ` · Cantidad: ${Number(r.quantity || 0)}`;

    draw(
      `${i + 1}. ${r.customerName} — ${tipo}${sector}${mesa}${cantidad}`,
      12,
      true,
      rgb(0.06, 0.09, 0.16)
    );

    draw(
      `Género: ${r.gender ?? "—"}   •   Email: ${r.customerEmail}   •   Tel: ${r.customerPhone}`,
      10,
      false,
      rgb(0.22, 0.27, 0.35)
    );

    draw(
      `DNI: ${r.customerDni}   •   Pago: ${r.paymentStatus} (${r.paymentMethod})`,
      10,
      false,
      rgb(0.22, 0.27, 0.35)
    );

    draw(
      `Código: ${r.validationCode || "—"}   •   Total: $${Number(r.totalPrice || 0).toFixed(2)}`,
      10,
      false,
      rgb(0.0, 0.45, 0.26)
    );

    y -= 6;
  });

  return await pdf.save();
}
