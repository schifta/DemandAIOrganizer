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

export async function PATCH(request: Request) {
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

    const { orderedIds } = body as { orderedIds?: unknown };

    if (
      !Array.isArray(orderedIds) ||
      orderedIds.length === 0 ||
      !orderedIds.every((id) => typeof id === "string" && id.trim().length > 0)
    ) {
      return NextResponse.json(
        { error: "orderedIds deve ser um array não vazio de IDs" },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      const existingOrders = await tx.order.findMany({
        where: { id: { in: orderedIds } },
        select: { id: true, lockedFields: true },
      });

      const lockedMap = new Map<string, string[]>();
      for (const order of existingOrders) {
        lockedMap.set(order.id, parseLockedFields(order.lockedFields));
      }

      await Promise.all(
        orderedIds.map((id, index) => {
          const existingLocked = lockedMap.get(id) ?? [];
          const mergedLocked = existingLocked.includes("priorityOrder")
            ? existingLocked
            : [...existingLocked, "priorityOrder"];

          return tx.order.update({
            where: { id },
            data: {
              priorityOrder: index + 1,
              manuallyEdited: true,
              lockedFields: JSON.stringify(mergedLocked),
            },
          });
        })
      );
    });

    return NextResponse.json({ ok: true, count: orderedIds.length });
  } catch (error) {
    console.error("Reorder orders error:", error);
    return NextResponse.json(
      { error: "Erro ao reordenar pedidos" },
      { status: 500 }
    );
  }
}
