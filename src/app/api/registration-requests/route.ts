import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { cleanupExpiredRecords } from "@/lib/cleanup";

const DAILY_LIMIT = 3;

function getSaoPauloStartOfDayUtc(): Date {
  const now = new Date();
  const spOffsetMs = 3 * 60 * 60 * 1000;
  const spNow = new Date(now.getTime() - spOffsetMs);
  return new Date(
    Date.UTC(
      spNow.getUTCFullYear(),
      spNow.getUTCMonth(),
      spNow.getUTCDate(),
      3,
      0,
      0,
      0
    )
  );
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) {
      return auth.error;
    }

    await cleanupExpiredRecords(true);

    const startOfDayUtc = getSaoPauloStartOfDayUtc();

    const [requests, usedToday] = await Promise.all([
      prisma.registrationRequest.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          requestedRole: true,
          status: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
      prisma.registrationRequest.count({
        where: { createdAt: { gte: startOfDayUtc } },
      }),
    ]);

    return NextResponse.json({
      requests,
      usedToday,
      dailyLimit: DAILY_LIMIT,
    });
  } catch (error) {
    console.error("List registration requests error:", error);
    return NextResponse.json(
      { error: "Erro ao listar solicitações de cadastro" },
      { status: 500 }
    );
  }
}
