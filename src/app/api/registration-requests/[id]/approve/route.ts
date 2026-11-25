import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

class ApprovalError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) {
      return auth.error;
    }

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const requestedRole =
      body && typeof body === "object" && "role" in body
        ? (body as { role?: unknown }).role
        : undefined;

    let roleToGrant: "OPERATOR" | "ADMIN" = "OPERATOR";
    if (requestedRole !== undefined) {
      if (requestedRole !== "OPERATOR" && requestedRole !== "ADMIN") {
        return NextResponse.json(
          { error: "Cargo inválido. Use OPERATOR ou ADMIN." },
          { status: 400 }
        );
      }
      roleToGrant = requestedRole;
    }

    const user = await prisma.$transaction(async (tx) => {
      const reqRecord = await tx.registrationRequest.findUnique({
        where: { id },
      });

      if (!reqRecord) {
        throw new ApprovalError(404, "Solicitação não encontrada");
      }

      if (reqRecord.status !== "PENDING") {
        throw new ApprovalError(
          400,
          "Esta solicitação já foi processada"
        );
      }

      const now = new Date();
      if (reqRecord.expiresAt <= now) {
        throw new ApprovalError(
          410,
          "Esta solicitação expirou"
        );
      }

      const existingUser = await tx.user.findUnique({
        where: { email: reqRecord.email },
        select: { id: true },
      });

      if (existingUser) {
        throw new ApprovalError(409, "Este e-mail já está cadastrado");
      }

      const createdUser = await tx.user.create({
        data: {
          name: reqRecord.name,
          email: reqRecord.email,
          passwordHash: reqRecord.passwordHash,
          role: roleToGrant,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      });

      await tx.registrationRequest.update({
        where: { id: reqRecord.id },
        data: {
          status: "APPROVED",
          reviewedById: auth.user.userId,
          reviewedAt: now,
        },
      });

      return createdUser;
    });

    return NextResponse.json({ ok: true, user });
  } catch (error) {
    if (error instanceof ApprovalError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error("Approve registration request error:", error);
    return NextResponse.json(
      { error: "Erro ao aprovar solicitação" },
      { status: 500 }
    );
  }
}
