import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) {
      return auth.error;
    }

    const companies = await prisma.company.findMany({
      orderBy: { name: "asc" },
      include: {
        contacts: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json({ companies });
  } catch (error) {
    console.error("List companies error:", error);
    return NextResponse.json(
      { error: "Erro ao listar empresas" },
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

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Corpo da requisição inválido" },
        { status: 400 }
      );
    }

    const { name, document, address, contactName, contactPhone } = body as {
      name?: unknown;
      document?: unknown;
      address?: unknown;
      contactName?: unknown;
      contactPhone?: unknown;
    };

    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Nome da empresa é obrigatório" },
        { status: 400 }
      );
    }

    const normalizedName = name.trim();
    const normalizedDocument =
      typeof document === "string" && document.trim()
        ? document.trim()
        : null;
    const normalizedAddress =
      typeof address === "string" && address.trim() ? address.trim() : null;

    const normalizedContactName =
      typeof contactName === "string" && contactName.trim()
        ? contactName.trim()
        : null;
    const normalizedContactPhone =
      typeof contactPhone === "string"
        ? contactPhone.replace(/\D/g, "")
        : "";

    const shouldCreateContact =
      normalizedContactName !== null && normalizedContactPhone.length > 0;

    const company = await prisma.company.create({
      data: {
        name: normalizedName,
        document: normalizedDocument,
        address: normalizedAddress,
        ...(shouldCreateContact
          ? {
              contacts: {
                create: {
                  name: normalizedContactName,
                  phone: normalizedContactPhone,
                },
              },
            }
          : {}),
      },
      include: {
        contacts: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json({ company }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Telefone de contato já cadastrado em outra empresa" },
        { status: 409 }
      );
    }

    console.error("Create company error:", error);
    return NextResponse.json(
      { error: "Erro ao criar empresa" },
      { status: 500 }
    );
  }
}
