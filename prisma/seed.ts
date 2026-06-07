import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  await prisma.auditLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  const hashedPassword = await bcrypt.hash("Password123!", 10);

  const adminUser = await prisma.user.create({
    data: {
      id: 3,
      name: "Admin Yapindo",
      email: "admin@mail.com",
      password: hashedPassword,
      role: "ADMIN",
    },
  });

  const user1 = await prisma.user.create({
    data: {
      id: 1,
      name: "Akbar Ahmad",
      email: "akbar@yapindo.com",
      password: hashedPassword,
      role: "USER",
    },
  });

  const user2 = await prisma.user.create({
    data: {
      id: 2,
      name: "Rizky Ramadhan",
      email: "rizky@mail.com",
      password: hashedPassword,
      role: "USER",
    },
  });

  const project1 = await prisma.project.create({
    data: {
      id: 6,
      name: "Project Utama Yapindo",
      description: "Backend system",
      createdBy: adminUser.id,
    },
  });

  const project2 = await prisma.project.create({
    data: {
      id: 2,
      name: "E-Commerce System",
      description: "Sistem toko online",
      createdBy: user1.id,
    },
  });

  await prisma.task.create({
    data: {
      id: 4,
      title: "Setup Backend",
      description: "API Authentication",
      status: "IN_PROGRESS",
      priority: "HIGH",
      projectId: project2.id,
      assigneeId: user1.id,
    },
  });

  await prisma.task.create({
    data: {
      id: 12,
      title: "Optimasi Redis",
      description: "Cache layer improvement",
      status: "TODO",
      priority: "MEDIUM",
      projectId: project1.id,
      assigneeId: adminUser.id,
    },
  });

  console.log("✅ SEED DONE");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });