import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/lib/auth";

const VALID_STATUSES = ["PENDENTE", "CONCLUIDO", "CANCELADO"] as const;
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

function parseScheduledDate(
  value: unknown
): { ok: true; date: Date | null } | { ok: false } {
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

function serializeValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
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
      restore,
      saveContactPhone,
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
      restore?: unknown;
      saveContactPhone?: unknown;
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

    const existingOrder = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        scheduledDate: true,
        truckUsed: true,
        collectedBy: true,
        notes: true,
        companyId: true,
        needsReview: true,
        requesterName: true,
        requesterPhone: true,
        actionType: true,
        containerType: true,
        quantity: true,
        completedAt: true,
        lockedFields: true,
        deletedAt: true,
      },
    });

    if (!existingOrder) {
      return NextResponse.json(
        { error: "Pedido não encontrado" },
        { status: 404 }
      );
    }

    if (restore === true) {
      const order = await prisma.$transaction(async (tx) => {
        const updated = await tx.order.update({
          where: { id },
          data: { deletedAt: null },
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

        await tx.orderEvent.create({
          data: {
            orderId: id,
            actorId: auth.user.userId,
            actorName: auth.user.name,
            field: "deletedAt",
            beforeValue: existingOrder.deletedAt?.toISOString() ?? null,
            afterValue: null,
          },
        });

        return updated;
      });

      return NextResponse.json({ order });
    }

    if (existingOrder.deletedAt !== null) {
      return NextResponse.json(
        { error: "Pedido não encontrado" },
        { status: 404 }
      );
    }

    const hasAdminOnlyFields =
      companyId !== undefined ||
      saveContactPhone === true ||
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
    const modifiedFields: string[] = [];
    const pendingEvents: Array<{
      field: string;
      beforeValue: string | null;
      afterValue: string | null;
    }> = [];

    const recordChange = (
      field: string,
      beforeRaw: unknown,
      afterRaw: unknown
    ) => {
      const beforeValue = serializeValue(beforeRaw);
      const afterValue = serializeValue(afterRaw);
      if (beforeValue !== afterValue) {
        pendingEvents.push({ field, beforeValue, afterValue });
      }
    };

    if (status !== undefined) {
      if (
        typeof status !== "string" ||
        !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])
      ) {
        return NextResponse.json({ error: "Status inválido" }, { status: 400 });
      }
      data.status = status;
      modifiedFields.push("status");
      recordChange("status", existingOrder.status, status);

      const nextCompletedAt = status === "CONCLUIDO" ? new Date() : null;
      data.completedAt = nextCompletedAt;
      recordChange(
        "completedAt",
        existingOrder.completedAt,
        nextCompletedAt
      );
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
      recordChange(
        "scheduledDate",
        existingOrder.scheduledDate,
        parsedDate.date
      );
    }

    if (truckUsed !== undefined) {
      let nextTruckUsed: string | null;
      if (truckUsed === null) {
        nextTruckUsed = null;
      } else if (typeof truckUsed === "string") {
        nextTruckUsed = truckUsed.trim() || null;
      } else {
        return NextResponse.json(
          { error: "Caminhão utilizado inválido" },
          { status: 400 }
        );
      }
      data.truckUsed = nextTruckUsed;
      modifiedFields.push("truckUsed");
      recordChange("truckUsed", existingOrder.truckUsed, nextTruckUsed);
    }

    let nextCollectedBy: string | null | undefined = undefined;
    if (collectedBy !== undefined) {
      if (collectedBy === null) {
        nextCollectedBy = null;
      } else if (typeof collectedBy === "string") {
        nextCollectedBy = collectedBy.trim() || null;
      } else {
        return NextResponse.json(
          { error: "Campo coletado por inválido" },
          { status: 400 }
        );
      }
      data.collectedBy = nextCollectedBy;
      modifiedFields.push("collectedBy");
      recordChange("collectedBy", existingOrder.collectedBy, nextCollectedBy);
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
      // Replace any earlier collectedBy event in case collectedBy was passed as ""
      const idx = pendingEvents.findIndex((e) => e.field === "collectedBy");
      if (idx >= 0) {
        pendingEvents.splice(idx, 1);
      }
      recordChange("collectedBy", existingOrder.collectedBy, auth.user.name);
    }

    if (notes !== undefined) {
      let nextNotes: string | null;
      if (notes === null) {
        nextNotes = null;
      } else if (typeof notes === "string") {
        nextNotes = notes.trim() || null;
      } else {
        return NextResponse.json(
          { error: "Observações inválidas" },
          { status: 400 }
        );
      }
      data.notes = nextNotes;
      modifiedFields.push("notes");
      recordChange("notes", existingOrder.notes, nextNotes);
    }

    let resolvedCompanyId: string | null = null;
    if (companyId !== undefined) {
      if (companyId === null || companyId === "") {
        data.company = { disconnect: true };
        resolvedCompanyId = null;
      } else if (typeof companyId === "string") {
        resolvedCompanyId = companyId.trim();
        data.company = { connect: { id: resolvedCompanyId } };
      } else {
        return NextResponse.json(
          { error: "companyId inválido" },
          { status: 400 }
        );
      }
      modifiedFields.push("companyId");
      recordChange("companyId", existingOrder.companyId, resolvedCompanyId);
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
      recordChange("needsReview", existingOrder.needsReview, needsReview);
    }

    if (requesterName !== undefined) {
      if (typeof requesterName !== "string" || !requesterName.trim()) {
        return NextResponse.json(
          { error: "Nome do solicitante inválido" },
          { status: 400 }
        );
      }
      const nextRequesterName = requesterName.trim();
      data.requesterName = nextRequesterName;
      modifiedFields.push("requesterName");
      recordChange(
        "requesterName",
        existingOrder.requesterName,
        nextRequesterName
      );
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
      recordChange("actionType", existingOrder.actionType, actionType);
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
      recordChange(
        "containerType",
        existingOrder.containerType,
        containerType
      );
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
      recordChange("quantity", existingOrder.quantity, quantity);
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

    const shouldSaveContact =
      saveContactPhone === true &&
      resolvedCompanyId !== null &&
      Boolean(existingOrder.requesterPhone?.trim());

    const order = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
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

      if (shouldSaveContact && resolvedCompanyId) {
        const phone = existingOrder.requesterPhone!.trim();
        await tx.contact.upsert({
          where: { phone },
          update: {
            companyId: resolvedCompanyId,
            name: updated.requesterName,
          },
          create: {
            phone,
            name: updated.requesterName,
            companyId: resolvedCompanyId,
          },
        });
      }

      if (pendingEvents.length > 0) {
        await tx.orderEvent.createMany({
          data: pendingEvents.map((event) => ({
            orderId: id,
            actorId: auth.user.userId,
            actorName: auth.user.name,
            field: event.field,
            beforeValue: event.beforeValue,
            afterValue: event.afterValue,
          })),
        });
      }

      return updated;
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
    const existingOrder = await prisma.order.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });

    if (!existingOrder || existingOrder.deletedAt !== null) {
      return NextResponse.json(
        { error: "Pedido não encontrado" },
        { status: 404 }
      );
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: { deletedAt: now },
      });

      await tx.orderEvent.create({
        data: {
          orderId: id,
          actorId: auth.user.userId,
          actorName: auth.user.name,
          field: "deletedAt",
          beforeValue: null,
          afterValue: now.toISOString(),
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete order error:", error);
    return NextResponse.json(
      { error: "Erro ao excluir pedido" },
      { status: 500 }
    );
  }
}
