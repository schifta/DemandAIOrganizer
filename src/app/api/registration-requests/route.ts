import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { cleanupExpiredRecords } from "@/lib/cleanup";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) {
      return auth.error;
    }

    await cleanupExpiredRecords(true);

    const requests = await prisma.registrationRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        requestedRole: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      requests,
    });
  } catch (error) {
    console.error("List registration requests error:", error);
    return NextResponse.json(
      { error: "Erro ao listar solicitações de cadastro" },
      { status: 500 }
    );
  }
}
