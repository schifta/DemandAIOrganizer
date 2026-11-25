import { prisma } from "@/lib/prisma";

const CLEANUP_THROTTLE_MS = 60 * 1000;
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

const globalForCleanup = globalThis as unknown as {
  lastCleanupAt?: number;
};

export async function cleanupExpiredRecords(force = false): Promise<void> {
  const nowMs = Date.now();

  if (
    !force &&
    typeof globalForCleanup.lastCleanupAt === "number" &&
    nowMs - globalForCleanup.lastCleanupAt < CLEANUP_THROTTLE_MS
  ) {
    return;
  }

  globalForCleanup.lastCleanupAt = nowMs;

  const now = new Date(nowMs);
  const fiveDaysAgo = new Date(nowMs - FIVE_DAYS_MS);

  await Promise.all([
    prisma.order.deleteMany({
      where: {
        status: "CONCLUIDO",
        OR: [
          { completedAt: { lt: fiveDaysAgo } },
          { completedAt: null, updatedAt: { lt: fiveDaysAgo } },
        ],
      },
    }),
    prisma.registrationRequest.deleteMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: now },
      },
    }),
  ]);
}
