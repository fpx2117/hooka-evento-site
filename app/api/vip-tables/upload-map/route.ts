import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { writeFile } from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const configId = formData.get("configId") as string | null;

    if (!file || !configId) {
      return NextResponse.json(
        { ok: false, error: "Faltan parámetros o archivo" },
        { status: 400 }
      );
    }

    // Convertir el archivo en un Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Guardar archivo en /public/uploads
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    const fileName = `${configId}-${Date.now()}-${file.name}`;
    const filePath = path.join(uploadDir, fileName);

    await writeFile(filePath, buffer);

    // Crear URL pública
    const publicUrl = `/uploads/${fileName}`;

    // Actualizar VipTableConfig.mapUrl
    await prisma.vipTableConfig.update({
      where: { id: configId },
      data: { mapUrl: publicUrl },
    });

    return NextResponse.json({
      ok: true,
      message: "Mapa subido correctamente",
      mapUrl: publicUrl,
    });
  } catch (err) {
    console.error("[upload-map][POST][ERROR]", err);
    return NextResponse.json(
      { ok: false, error: "No se pudo subir el archivo" },
      { status: 500 }
    );
  }
}
