import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) {
      return auth.error;
    }

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("List users error:", error);
    return NextResponse.json(
      { error: "Erro ao listar usuários" },
      { status: 500 }
    );
  }
}
