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

function parseLockedFields(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // Ignore malformed JSON and reset to empty list
  }
  return [];
}

function parseScheduledDate(value: unknown): { ok: true; date: Date | null } | { ok: false } {
  if (value === null) {
    return { ok: true, date: null };
  }
  if (typeof value !== "string") {
    return { ok: false };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, date: null };
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T12:00:00.000Z`)
    : new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return { ok: false };
  }
  return { ok: true, date };
}

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
      scheduledDate,
      truckUsed,
      collectedBy,
      notes,
      companyId,
      needsReview,
      requesterName,
      actionType,
      containerType,
      quantity,
    } = body as {
      status?: unknown;
      scheduledDate?: unknown;
      truckUsed?: unknown;
      collectedBy?: unknown;
      notes?: unknown;
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

    const existingOrder = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        lockedFields: true,
        collectedBy: true,
      },
    });

    if (!existingOrder) {
      return NextResponse.json(
        { error: "Pedido não encontrado" },
        { status: 404 }
      );
    }

    const data: Prisma.OrderUpdateInput = {};
    const modifiedFields: string[] = [];

    if (status !== undefined) {
      if (
        typeof status !== "string" ||
        !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])
      ) {
        return NextResponse.json({ error: "Status inválido" }, { status: 400 });
      }
      data.status = status;
      modifiedFields.push("status");

      if (status === "CONCLUIDO") {
        data.completedAt = new Date();
      } else {
        data.completedAt = null;
      }
    }

    if (scheduledDate !== undefined) {
      const parsedDate = parseScheduledDate(scheduledDate);
      if (!parsedDate.ok) {
        return NextResponse.json(
          { error: "Data de agendamento inválida" },
          { status: 400 }
        );
      }
      data.scheduledDate = parsedDate.date;
      modifiedFields.push("scheduledDate");
    }

    if (truckUsed !== undefined) {
      if (truckUsed === null) {
        data.truckUsed = null;
      } else if (typeof truckUsed === "string") {
        data.truckUsed = truckUsed.trim() || null;
      } else {
        return NextResponse.json(
          { error: "Caminhão utilizado inválido" },
          { status: 400 }
        );
      }
      modifiedFields.push("truckUsed");
    }

    if (collectedBy !== undefined) {
      if (collectedBy === null) {
        data.collectedBy = null;
      } else if (typeof collectedBy === "string") {
        data.collectedBy = collectedBy.trim() || null;
      } else {
        return NextResponse.json(
          { error: "Campo coletado por inválido" },
          { status: 400 }
        );
      }
      modifiedFields.push("collectedBy");
    }

    const isCollectedByEmptyInput =
      collectedBy === undefined ||
      collectedBy === null ||
      (typeof collectedBy === "string" && !collectedBy.trim());

    if (
      status === "CONCLUIDO" &&
      isCollectedByEmptyInput &&
      !existingOrder.collectedBy?.trim()
    ) {
      data.collectedBy = auth.user.name;
      if (!modifiedFields.includes("collectedBy")) {
        modifiedFields.push("collectedBy");
      }
    }

    if (notes !== undefined) {
      if (notes === null) {
        data.notes = null;
      } else if (typeof notes === "string") {
        data.notes = notes.trim() || null;
      } else {
        return NextResponse.json(
          { error: "Observações inválidas" },
          { status: 400 }
        );
      }
      modifiedFields.push("notes");
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
      modifiedFields.push("companyId");
    }

    if (needsReview !== undefined) {
      if (typeof needsReview !== "boolean") {
        return NextResponse.json(
          { error: "needsReview deve ser booleano" },
          { status: 400 }
        );
      }
      data.needsReview = needsReview;
      modifiedFields.push("needsReview");
    }

    if (requesterName !== undefined) {
      if (typeof requesterName !== "string" || !requesterName.trim()) {
        return NextResponse.json(
          { error: "Nome do solicitante inválido" },
          { status: 400 }
        );
      }
      data.requesterName = requesterName.trim();
      modifiedFields.push("requesterName");
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
      modifiedFields.push("actionType");
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
      modifiedFields.push("containerType");
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
      modifiedFields.push("quantity");
    }

    if (modifiedFields.length === 0) {
      return NextResponse.json(
        { error: "Nenhum campo válido para atualização" },
        { status: 400 }
      );
    }

    const existingLocked = parseLockedFields(existingOrder.lockedFields);
    const mergedLocked = Array.from(
      new Set([...existingLocked, ...modifiedFields])
    );

    data.manuallyEdited = true;
    data.lockedFields = JSON.stringify(mergedLocked);

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
