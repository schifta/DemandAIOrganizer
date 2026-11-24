import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  setSessionCookie,
  signSessionToken,
  UserRole,
} from "@/lib/auth";

class RegistrationError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Corpo da requisição inválido" },
        { status: 400 }
      );
    }

    const { name, email, password, accessKey } = body as {
      name?: unknown;
      email?: unknown;
      password?: unknown;
      accessKey?: unknown;
    };

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof accessKey !== "string" ||
      !accessKey.trim() ||
      typeof password !== "string"
    ) {
      return NextResponse.json(
        { error: "Nome, e-mail, senha e key de acesso são obrigatórios" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "A senha deve ter pelo menos 6 caracteres" },
        { status: 400 }
      );
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedKey = accessKey.trim().toUpperCase();
    const passwordHash = await hashPassword(password);

    const newUser = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });

      if (existingUser) {
        throw new RegistrationError(409, "E-mail já cadastrado");
      }

      const keyRecord = await tx.accessKey.findUnique({
        where: { code: normalizedKey },
      });

      if (!keyRecord) {
        throw new RegistrationError(400, "Key de acesso inválida");
      }

      if (keyRecord.usedAt !== null) {
        throw new RegistrationError(403, "Key de acesso já utilizada");
      }

      const now = new Date();
      if (keyRecord.expiresAt <= now) {
        throw new RegistrationError(
          403,
          "Key de acesso expirada (validade de 5 minutos)"
        );
      }

      const createdUser = await tx.user.create({
        data: {
          name: normalizedName,
          email: normalizedEmail,
          passwordHash,
          role: keyRecord.roleToGrant,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      });

      const updated = await tx.accessKey.updateMany({
        where: {
          id: keyRecord.id,
          usedAt: null,
        },
        data: {
          usedAt: now,
          usedById: createdUser.id,
        },
      });

      if (updated.count === 0) {
        throw new RegistrationError(403, "Key de acesso já utilizada");
      }

      return createdUser;
    });

    const role = newUser.role as UserRole;
    const token = await signSessionToken({
      userId: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role,
    });

    const response = NextResponse.json(
      {
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role,
        },
        token,
      },
      { status: 201 }
    );
    setSessionCookie(response, token);

    return response;
  } catch (error) {
    if (error instanceof RegistrationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Erro interno ao registrar usuário" },
      { status: 500 }
    );
  }
}
