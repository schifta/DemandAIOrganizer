import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { cleanupExpiredRecords } from "@/lib/cleanup";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Corpo da requisição inválido" },
        { status: 400 }
      );
    }

    const { name, email, password } = body as {
      name?: unknown;
      email?: unknown;
      password?: unknown;
    };

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string"
    ) {
      return NextResponse.json(
        { error: "Nome, e-mail e senha são obrigatórios" },
        { status: 400 }
      );
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "E-mail inválido" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "A senha deve ter pelo menos 6 caracteres" },
        { status: 400 }
      );
    }

    await cleanupExpiredRecords(true);

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Este e-mail já está cadastrado" },
        { status: 409 }
      );
    }

    const existingPendingRequest = await prisma.registrationRequest.findFirst({
      where: {
        email: normalizedEmail,
        status: "PENDING",
      },
      select: { id: true },
    });

    if (existingPendingRequest) {
      return NextResponse.json(
        { error: "Já existe uma solicitação pendente para este e-mail" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    await prisma.registrationRequest.create({
      data: {
        name: normalizedName,
        email: normalizedEmail,
        passwordHash,
        requestedRole: "OPERATOR",
        status: "PENDING",
        expiresAt: new Date(Date.now() + TWENTY_FOUR_HOURS_MS),
      },
    });

    return NextResponse.json(
      {
        ok: true,
        pendingApproval: true,
        message:
          "Solicitação enviada! Aguarde a aprovação de qualquer administrador (válida por 24h).",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Erro interno ao registrar solicitação" },
      { status: 500 }
    );
  }
}
