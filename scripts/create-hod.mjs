import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const username = process.env.HOD_USERNAME?.trim();
const name = process.env.HOD_NAME?.trim();
const password = process.env.HOD_PASSWORD;

if (!username || !name || !password) {
  throw new Error("Set HOD_USERNAME, HOD_NAME, and HOD_PASSWORD before creating the initial HOD account.");
}

if (password.length < 12) {
  throw new Error("HOD_PASSWORD must be at least 12 characters long.");
}

const db = new PrismaClient();

try {
  const existing = await db.user.findUnique({ where: { username }, select: { id: true } });
  if (existing) {
    throw new Error(`A user named "${username}" already exists. No account was changed.`);
  }

  await db.user.create({
    data: {
      username,
      name,
      role: "HOD",
      passwordHash: await bcrypt.hash(password, 12),
    },
  });

  console.log(`Created initial HOD account "${username}". Sign in and add sections and teachers.`);
} finally {
  await db.$disconnect();
}
