import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) {
      return auth.error;
    }

    const orders = await prisma.order.findMany({
      orderBy: [{ priorityOrder: "asc" }, { createdAt: "asc" }],
      include: {
        company: {
          select: {
            id: true,
            name: true,
            document: true,
            address: true,
          },
        },
      },
    });

    return NextResponse.json({ orders });
  } catch (error) {
    console.error("List orders error:", error);
    return NextResponse.json(
      { error: "Erro ao listar pedidos" },
      { status: 500 }
    );
  }
}
