import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const MASTER_EMAIL = "gabriel.schifter@gmail.com";
const MASTER_PROTECTED_ERROR =
  "O Administrador Master (#0) não pode ser rebaixado ou removido.";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function isMasterUser(user: { email: string; role: string }): boolean {
  return (
    user.email.toLowerCase() === MASTER_EMAIL || user.role === "ADMIN_MASTER"
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) {
      return auth.error;
    }

    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Corpo da requisição inválido" },
        { status: 400 }
      );
    }

    const { role } = body as { role?: unknown };
    if (role !== "ADMIN" && role !== "OPERATOR") {
      return NextResponse.json(
        { error: "Cargo inválido. Use ADMIN ou OPERATOR." },
        { status: 400 }
      );
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true },
    });

    if (!target) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    if (isMasterUser(target)) {
      return NextResponse.json(
        { error: MASTER_PROTECTED_ERROR },
        { status: 403 }
      );
    }

    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Update user role error:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar usuário" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) {
      return auth.error;
    }

    const { id } = await context.params;

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true },
    });

    if (!target) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    if (isMasterUser(target)) {
      return NextResponse.json(
        { error: MASTER_PROTECTED_ERROR },
        { status: 403 }
      );
    }

    if (auth.user.userId === id) {
      return NextResponse.json(
        { error: "Você não pode remover sua própria conta" },
        { status: 400 }
      );
    }

    await prisma.user.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json(
      { error: "Erro ao remover usuário" },
      { status: 500 }
    );
  }
}
