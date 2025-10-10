// app/api/admin/login/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-only-secret-change-me"
);

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username y password requeridos" },
        { status: 400 }
      );
    }

    // Buscar admin por username
    const admin = await prisma.admin.findUnique({
      where: { username },
      select: { id: true, username: true, name: true, password: true }, // incluye hash
    });

    // Respuesta genérica para no revelar si el usuario existe
    const invalid = () =>
      NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });

    if (!admin) return invalid();

    // Comparar la password en texto plano con el hash almacenado
    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) return invalid();

    // Crear JWT
    const token = await new SignJWT({
      id: admin.id,
      username: admin.username,
      name: admin.name,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("24h")
      .sign(JWT_SECRET);

    const response = NextResponse.json({
      success: true,
      admin: {
        id: admin.id,
        username: admin.username,
        name: admin.name,
      },
    });

    // Setear cookie segura
    response.cookies.set("admin-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/", // asegura disponibilidad en toda la app
      maxAge: 60 * 60 * 24, // 24h
    });

    return response;
  } catch (error) {
    console.error("[admin/login] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
