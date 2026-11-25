import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) {
      return auth.error;
    }

    const { id } = await context.params;

    const events = await prisma.orderEvent.findMany({
      where: { orderId: id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error("List order events error:", error);
    return NextResponse.json(
      { error: "Erro ao listar histórico do pedido" },
      { status: 500 }
    );
  }
}
