import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) {
      return auth.error;
    }

    const { id } = await context.params;

    await prisma.registrationRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedById: auth.user.userId,
        reviewedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Solicitação não encontrada" },
        { status: 404 }
      );
    }

    console.error("Reject registration request error:", error);
    return NextResponse.json(
      { error: "Erro ao rejeitar solicitação" },
      { status: 500 }
    );
  }
}
