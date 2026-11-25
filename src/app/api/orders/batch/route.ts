import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

function parseLockedFields(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // Ignore malformed JSON
  }
  return [];
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

    const { orderIds, action, truckUsed } = body as {
      orderIds?: unknown;
      action?: unknown;
      truckUsed?: unknown;
    };

    if (
      !Array.isArray(orderIds) ||
      orderIds.length === 0 ||
      !orderIds.every((id) => typeof id === "string" && id.trim().length > 0)
    ) {
      return NextResponse.json(
        { error: "Lista de pedidos inválida" },
        { status: 400 }
      );
    }

    if (action !== "COMPLETE" && action !== "ASSIGN_TRUCK") {
      return NextResponse.json(
        { error: "Ação em lote inválida" },
        { status: 400 }
      );
    }

    let trimmedTruck: string | null = null;
    if (action === "ASSIGN_TRUCK") {
      if (typeof truckUsed !== "string" || !truckUsed.trim()) {
        return NextResponse.json(
          { error: "Informe o caminhão utilizado" },
          { status: 400 }
        );
      }
      trimmedTruck = truckUsed.trim();
    }

    const uniqueIds = Array.from(new Set(orderIds.map((id) => id.trim())));
    const now = new Date();

    const count = await prisma.$transaction(async (tx) => {
      const orders = await tx.order.findMany({
        where: {
          id: { in: uniqueIds },
          deletedAt: null,
        },
        select: {
          id: true,
          status: true,
          completedAt: true,
          collectedBy: true,
          truckUsed: true,
          lockedFields: true,
        },
      });

      if (orders.length === 0) {
        return 0;
      }

      const events: Array<{
        orderId: string;
        actorId: string;
        actorName: string;
        field: string;
        beforeValue: string | null;
        afterValue: string | null;
      }> = [];

      for (const order of orders) {
        const existingLocked = parseLockedFields(order.lockedFields);

        if (action === "COMPLETE") {
          const modifiedFields = ["status"];
          const nextCollectedBy = order.collectedBy?.trim()
            ? order.collectedBy
            : auth.user.name;

          if (!order.collectedBy?.trim()) {
            modifiedFields.push("collectedBy");
          }

          const mergedLocked = Array.from(
            new Set([...existingLocked, ...modifiedFields])
          );

          await tx.order.update({
            where: { id: order.id },
            data: {
              status: "CONCLUIDO",
              completedAt: now,
              collectedBy: nextCollectedBy,
              manuallyEdited: true,
              lockedFields: JSON.stringify(mergedLocked),
            },
          });

          if (order.status !== "CONCLUIDO") {
            events.push({
              orderId: order.id,
              actorId: auth.user.userId,
              actorName: auth.user.name,
              field: "status",
              beforeValue: order.status,
              afterValue: "CONCLUIDO",
            });
          }

          events.push({
            orderId: order.id,
            actorId: auth.user.userId,
            actorName: auth.user.name,
            field: "completedAt",
            beforeValue: order.completedAt?.toISOString() ?? null,
            afterValue: now.toISOString(),
          });

          if ((order.collectedBy ?? null) !== nextCollectedBy) {
            events.push({
              orderId: order.id,
              actorId: auth.user.userId,
              actorName: auth.user.name,
              field: "collectedBy",
              beforeValue: order.collectedBy,
              afterValue: nextCollectedBy,
            });
          }
        } else if (action === "ASSIGN_TRUCK") {
          const mergedLocked = Array.from(
            new Set([...existingLocked, "truckUsed"])
          );

          await tx.order.update({
            where: { id: order.id },
            data: {
              truckUsed: trimmedTruck,
              manuallyEdited: true,
              lockedFields: JSON.stringify(mergedLocked),
            },
          });

          if ((order.truckUsed ?? null) !== trimmedTruck) {
            events.push({
              orderId: order.id,
              actorId: auth.user.userId,
              actorName: auth.user.name,
              field: "truckUsed",
              beforeValue: order.truckUsed,
              afterValue: trimmedTruck,
            });
          }
        }
      }

      if (events.length > 0) {
        await tx.orderEvent.createMany({ data: events });
      }

      return orders.length;
    });

    return NextResponse.json({ ok: true, count });
  } catch (error) {
    console.error("Batch orders error:", error);
    return NextResponse.json(
      { error: "Erro ao processar ação em lote" },
      { status: 500 }
    );
  }
}
