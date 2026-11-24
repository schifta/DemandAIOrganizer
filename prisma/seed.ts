import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPasswordHash = await bcrypt.hash("Admin@123", 10);

  await prisma.user.upsert({
    where: { email: "admin@ecocoletas.com" },
    update: {},
    create: {
      name: "Administrador Master",
      email: "admin@ecocoletas.com",
      passwordHash: adminPasswordHash,
      role: "ADMIN_MASTER",
    },
  });

  const sampleCompanies = [
    {
      name: "Metalúrgica Alfa Ltda",
      document: "12.345.678/0001-90",
      address: "Av. Industrial, 1200 - São Paulo/SP",
      contact: {
        name: "Carlos Silva",
        phone: "5511999990001",
      },
    },
    {
      name: "Indústria Beta S.A.",
      document: "98.765.432/0001-10",
      address: "Rua das Fábricas, 450 - Guarulhos/SP",
      contact: {
        name: "Mariana Souza",
        phone: "5511999990002",
      },
    },
    {
      name: "Logística Gama Transportes",
      document: "45.123.789/0001-55",
      address: "Rod. Anhanguera, Km 22 - Osasco/SP",
      contact: {
        name: "Roberto Lima",
        phone: "5511999990003",
      },
    },
  ];

  const companiesByName: Record<string, string> = {};

  for (const item of sampleCompanies) {
    let company = await prisma.company.findFirst({
      where: { name: item.name },
    });

    if (!company) {
      company = await prisma.company.create({
        data: {
          name: item.name,
          document: item.document,
          address: item.address,
        },
      });
    }

    companiesByName[item.name] = company.id;

    await prisma.contact.upsert({
      where: { phone: item.contact.phone },
      update: {
        name: item.contact.name,
        companyId: company.id,
      },
      create: {
        name: item.contact.name,
        phone: item.contact.phone,
        companyId: company.id,
      },
    });
  }

  const orderCount = await prisma.order.count();

  if (orderCount === 0) {
    const alfaId = companiesByName["Metalúrgica Alfa Ltda"];
    const betaId = companiesByName["Indústria Beta S.A."];

    await prisma.order.createMany({
      data: [
        {
          priorityOrder: 1,
          requesterName: "Carlos Silva",
          requesterPhone: "5511999990001",
          companyId: alfaId,
          actionType: "TROCA",
          containerType: "CAIXA_CACAMBA",
          quantity: 1,
          rawMessage: "Preciso da troca de uma caixa/caçamba",
          status: "PENDENTE",
          needsReview: false,
        },
        {
          priorityOrder: 2,
          requesterName: "Mariana Souza",
          requesterPhone: "5511999990002",
          companyId: betaId,
          actionType: "COLETA",
          containerType: "TAMBOR",
          quantity: 8,
          rawMessage: "preciso de uma coleta de 8 tambores",
          status: "PENDENTE",
          needsReview: false,
        },
      ],
    });
  }

  console.log("Database seeded successfully.");
}

main()
  .catch((error) => {
    console.error("Error seeding database:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
