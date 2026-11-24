import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

function generateAccessKeyCode(): string {
  const part1 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const part2 = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `ECO-${part1}-${part2}`;
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) {
      return auth.error;
    }

    const accessKeys = await prisma.accessKey.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: {
          select: { name: true, email: true },
        },
        usedBy: {
          select: { name: true, email: true },
        },
      },
    });

    return NextResponse.json({ accessKeys });
  } catch (error) {
    console.error("List access keys error:", error);
    return NextResponse.json(
      { error: "Erro ao listar keys de acesso" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) {
      return auth.error;
    }

    const body = await request.json().catch(() => ({}));
    const rawRole =
      body && typeof body === "object"
        ? (body as { roleToGrant?: unknown }).roleToGrant
        : undefined;

    let roleToGrant: "OPERATOR" | "ADMIN" = "OPERATOR";
    if (rawRole !== undefined) {
      if (rawRole !== "OPERATOR" && rawRole !== "ADMIN") {
        return NextResponse.json(
          { error: "Perfil inválido para key de acesso" },
          { status: 400 }
        );
      }
      roleToGrant = rawRole;
    }

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const code = generateAccessKeyCode();

    const accessKey = await prisma.accessKey.create({
      data: {
        code,
        roleToGrant,
        expiresAt,
        createdById: auth.user.userId,
      },
      include: {
        createdBy: {
          select: { name: true, email: true },
        },
        usedBy: {
          select: { name: true, email: true },
        },
      },
    });

    return NextResponse.json({ accessKey }, { status: 201 });
  } catch (error) {
    console.error("Create access key error:", error);
    return NextResponse.json(
      { error: "Erro ao gerar key de acesso" },
      { status: 500 }
    );
  }
}
