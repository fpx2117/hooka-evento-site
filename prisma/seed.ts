// ========================================================
// Prisma Seed — Creación de administradores iniciales
// ========================================================

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed de administradores...");

  const SALT_ROUNDS = 12;

  const admins = [
    {
      username: "vasconcel4376",
      password: "fvS9f3yq21@",
      name: "Vasconcel Diego",
    },
    {
      username: "francosalas12",
      password: "23743754",
      name: "Franco Salas",
    },
  ];

  for (const admin of admins) {
    try {
      const hashedPassword = await bcrypt.hash(admin.password, SALT_ROUNDS);

      const created = await prisma.admin.upsert({
        where: { username: admin.username },
        update: { password: hashedPassword, name: admin.name },
        create: {
          username: admin.username,
          password: hashedPassword,
          name: admin.name,
        },
      });

      console.log(`✅ Admin creado/actualizado: ${created.username}`);
    } catch (error) {
      console.error(`❌ Error procesando usuario ${admin.username}:`, error);
    }
  }

  console.log("🌿 Seed completada con éxito.");
}

// ================== Ejecución controlada ==================
main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("💥 Error general en el seed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
