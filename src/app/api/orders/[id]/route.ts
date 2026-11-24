import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/lib/auth";

const VALID_STATUSES = ["PENDENTE", "EM_ROTA", "CONCLUIDO", "CANCELADO"] as const;
const VALID_ACTION_TYPES = ["TROCA", "COLETA"] as const;
const VALID_CONTAINER_TYPES = ["CAIXA_CACAMBA", "TAMBOR"] as const;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireAuth();
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

    const {
      status,
      companyId,
      needsReview,
      requesterName,
      actionType,
      containerType,
      quantity,
    } = body as {
      status?: unknown;
      companyId?: unknown;
      needsReview?: unknown;
      requesterName?: unknown;
      actionType?: unknown;
      containerType?: unknown;
      quantity?: unknown;
    };

    const hasAdminOnlyFields =
      companyId !== undefined ||
      needsReview !== undefined ||
      requesterName !== undefined ||
      actionType !== undefined ||
      containerType !== undefined ||
      quantity !== undefined;

    if (
      hasAdminOnlyFields &&
      auth.user.role !== "ADMIN_MASTER" &&
      auth.user.role !== "ADMIN"
    ) {
      return NextResponse.json(
        {
          error:
            "Apenas administradores podem alterar empresa ou detalhes do pedido",
        },
        { status: 403 }
      );
    }

    const data: Prisma.OrderUpdateInput = {};

    if (status !== undefined) {
      if (
        typeof status !== "string" ||
        !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])
      ) {
        return NextResponse.json({ error: "Status inválido" }, { status: 400 });
      }
      data.status = status;
    }

    if (companyId !== undefined) {
      if (companyId === null || companyId === "") {
        data.company = { disconnect: true };
      } else if (typeof companyId === "string") {
        data.company = { connect: { id: companyId } };
      } else {
        return NextResponse.json(
          { error: "companyId inválido" },
          { status: 400 }
        );
      }
    }

    if (needsReview !== undefined) {
      if (typeof needsReview !== "boolean") {
        return NextResponse.json(
          { error: "needsReview deve ser booleano" },
          { status: 400 }
        );
      }
      data.needsReview = needsReview;
    }

    if (requesterName !== undefined) {
      if (typeof requesterName !== "string" || !requesterName.trim()) {
        return NextResponse.json(
          { error: "Nome do solicitante inválido" },
          { status: 400 }
        );
      }
      data.requesterName = requesterName.trim();
    }

    if (actionType !== undefined) {
      if (
        typeof actionType !== "string" ||
        !VALID_ACTION_TYPES.includes(
          actionType as (typeof VALID_ACTION_TYPES)[number]
        )
      ) {
        return NextResponse.json(
          { error: "Tipo de ação inválido" },
          { status: 400 }
        );
      }
      data.actionType = actionType;
    }

    if (containerType !== undefined) {
      if (
        typeof containerType !== "string" ||
        !VALID_CONTAINER_TYPES.includes(
          containerType as (typeof VALID_CONTAINER_TYPES)[number]
        )
      ) {
        return NextResponse.json(
          { error: "Tipo de recipiente inválido" },
          { status: 400 }
        );
      }
      data.containerType = containerType;
    }

    if (quantity !== undefined) {
      if (
        typeof quantity !== "number" ||
        !Number.isInteger(quantity) ||
        quantity < 1
      ) {
        return NextResponse.json(
          { error: "Quantidade deve ser um número inteiro positivo" },
          { status: 400 }
        );
      }
      data.quantity = quantity;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Nenhum campo válido para atualização" },
        { status: 400 }
      );
    }

    const order = await prisma.order.update({
      where: { id },
      data,
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

    return NextResponse.json({ order });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Pedido ou empresa não encontrado" },
        { status: 404 }
      );
    }

    console.error("Update order error:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar pedido" },
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
    await prisma.order.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Pedido não encontrado" },
        { status: 404 }
      );
    }

    console.error("Delete order error:", error);
    return NextResponse.json(
      { error: "Erro ao excluir pedido" },
      { status: 500 }
    );
  }
}
