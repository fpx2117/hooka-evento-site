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

    // 🧠 Convertir archivo en buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 📁 Directorio de destino (usando volumen persistente)
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true }); // crear si no existe

    // 📝 Nombre seguro del archivo (sin espacios ni caracteres raros)
    const safeFileName = file.name.replace(/[^\w.-]+/g, "_");
    const fileName = `${configId}-${Date.now()}-${safeFileName}`;
    const filePath = path.join(uploadDir, fileName);

    // 💾 Guardar archivo en el volumen
    await writeFile(filePath, buffer);

    // 🌍 Construir URL pública absoluta
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.NODE_ENV === "production"
        ? "https://hooka.com.ar"
        : req.nextUrl.origin);

    const publicUrl = `${baseUrl}/uploads/${fileName}`;

    // 🧩 Actualizar la base de datos
    await prisma.vipTableConfig.update({
      where: { id: configId },
      data: { mapUrl: publicUrl },
    });

    // ✅ Respuesta final
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
  } finally {
    await prisma.$disconnect();
  }
}
