// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const SALT_ROUNDS = 12;

  const users = [
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

  for (const u of users) {
    const hashed = await bcrypt.hash(u.password, SALT_ROUNDS);
    await prisma.admin.upsert({
      where: { username: u.username },
      update: { password: hashed, name: u.name },
      create: {
        username: u.username,
        password: hashed,
        name: u.name,
      },
    });
    console.log(`✅ Usuario "${u.username}" creado/actualizado.`);
  }
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
