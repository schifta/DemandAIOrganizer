export const PROTECTED_AI_FIELDS = [
  "priorityOrder",
  "scheduledDate",
  "truckUsed",
  "collectedBy",
  "status",
  "notes",
  "companyId",
  "actionType",
  "containerType",
  "quantity",
  "requesterName",
  "needsReview",
  "companyFallbackNote",
] as const;

/**
 * Safely parses a JSON-encoded array of locked field names.
 */
export function parseLockedFields(raw: string | null | undefined): string[] {
  if (!raw || typeof raw !== "string") {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

/**
 * Strips protected or locked fields from an AI-generated update patch so manual
 * edits cannot be overwritten by AI automations.
 */
export function filterAiUpdatePayload<T extends Record<string, unknown>>(
  existingOrder: { manuallyEdited: boolean; lockedFields: string },
  aiPatch: T
): Partial<T> {
  const blocked = new Set<string>(parseLockedFields(existingOrder.lockedFields));

  if (existingOrder.manuallyEdited) {
    for (const field of PROTECTED_AI_FIELDS) {
      blocked.add(field);
    }
  }

  const filtered: Partial<T> = {};
  for (const [key, value] of Object.entries(aiPatch)) {
    if (!blocked.has(key)) {
      (filtered as Record<string, unknown>)[key] = value;
    }
  }

  return filtered;
}

/**
 * Returns true if the order has manual edits or any locked fields protecting it from AI.
 */
export function isOrderProtectedFromAi(existingOrder: {
  manuallyEdited: boolean;
  lockedFields: string;
}): boolean {
  return (
    existingOrder.manuallyEdited ||
    parseLockedFields(existingOrder.lockedFields).length > 0
  );
}
