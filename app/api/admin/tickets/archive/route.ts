export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";
import type { Prisma } from "@prisma/client";
import { ArchiveReason as AR, TicketType as TT } from "@prisma/client";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);
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

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const reason = searchParams.get("reason") as keyof typeof AR | null;
  const type = searchParams.get("type") as keyof typeof TT | null;

  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(
    200,
    Math.max(1, Number(searchParams.get("pageSize") || "50"))
  );
  const skip = (page - 1) * pageSize;

  const where: Prisma.TicketArchiveWhereInput = {};
  if (q) {
    where.OR = [
      { customerName: { contains: q, mode: "insensitive" } },
      { customerEmail: { contains: q, mode: "insensitive" } },
      { customerDni: { contains: q, mode: "insensitive" } },
    ];
  }
  if (reason && AR[reason]) where.archiveReason = AR[reason];
  if (type && TT[type]) where.ticketType = TT[type];

  const [total, rows] = await Promise.all([
    prisma.ticketArchive.count({ where }),
    prisma.ticketArchive.findMany({
      where,
      orderBy: { archivedAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    ok: true,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
    tickets: rows,
  });
}
