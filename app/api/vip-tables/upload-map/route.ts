import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { writeFile, mkdir } from "fs/promises";
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

    // Convertir archivo en Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 📁 Directorio donde se guardará el archivo (usando volumen persistente)
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true }); // crea el directorio si no existe

    // 📝 Nombre del archivo
    const safeFileName = file.name.replace(/\s+/g, "_");
    const fileName = `${configId}-${Date.now()}-${safeFileName}`;
    const filePath = path.join(uploadDir, fileName);

    // Guardar el archivo físicamente
    await writeFile(filePath, buffer);

    // 🌍 Crear URL pública absoluta
    // Esto usa el dominio actual de Railway (por ejemplo hooka.com.ar)
    const origin =
      process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin || "https://hooka.com.ar";
    const publicUrl = `${origin}/uploads/${fileName}`;

    // 🧩 Actualizar VipTableConfig con la URL
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
