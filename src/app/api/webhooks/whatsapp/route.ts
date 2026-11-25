import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseWhatsAppPayload, normalizePhone } from "@/lib/whatsapp-parser";
import {
  extractOrderWithNLP,
  matchCompanyWithGemini,
} from "@/lib/nlp-extractor";
import { emitNewOrder } from "@/lib/order-events";
import { filterAiUpdatePayload } from "@/lib/ai-guard";

type PendingCompanyEntry = {
  orderIds: string[];
  phone: string;
  remoteJid?: string;
  senderName: string;
  rawMessage: string;
  createdAt: number;
};

const PENDING_COMPANY_TTL_MS = 30 * 60 * 1000;

const globalForPendingCompany = globalThis as unknown as {
  __schifterPendingCompany?: Map<string, PendingCompanyEntry>;
};

const pendingCompanyMap =
  globalForPendingCompany.__schifterPendingCompany ??
  new Map<string, PendingCompanyEntry>();
globalForPendingCompany.__schifterPendingCompany = pendingCompanyMap;

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getBrasiliaGreeting(): "Bom dia" | "Boa tarde" | "Boa noite" {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  const hour = Number.parseInt(hourStr, 10) % 24;
  if (hour >= 5 && hour <= 11) return "Bom dia";
  if (hour >= 12 && hour <= 17) return "Boa tarde";
  return "Boa noite";
}

async function sendEvolutionText(
  target: string,
  text: string
): Promise<boolean> {
  const baseUrl = process.env.EVOLUTION_API_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY?.trim();
  const instance = process.env.EVOLUTION_INSTANCE?.trim();
  const trimmedTarget = target.trim();

  if (!baseUrl || !apiKey || !instance || !trimmedTarget) {
    return false;
  }

  try {
    const endpoint = `${baseUrl}/message/sendText/${encodeURIComponent(
      instance
    )}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        number: trimmedTarget,
        text,
      }),
    });

    if (!response.ok) {
      console.error(
        `Evolution API sendText failed with status ${response.status}`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Evolution API sendText error:", error);
    return false;
  }
}

async function findOfficeGroupJid(): Promise<string | null> {
  const configuredJid = process.env.EVOLUTION_OFFICE_GROUP_JID?.trim();
  if (configuredJid) {
    return configuredJid;
  }

  const baseUrl = process.env.EVOLUTION_API_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY?.trim();
  const instance = process.env.EVOLUTION_INSTANCE?.trim();

  if (!baseUrl || !apiKey || !instance) {
    return null;
  }

  try {
    const endpoint = `${baseUrl}/group/fetchAllGroups/${encodeURIComponent(
      instance
    )}?getParticipants=false`;
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: apiKey,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error(
        `Evolution API fetchAllGroups failed with status ${response.status}`
      );
      return null;
    }

    const json: unknown = await response.json();
    const groups: unknown[] = Array.isArray(json)
      ? json
      : typeof json === "object" &&
          json !== null &&
          Array.isArray((json as { data?: unknown }).data)
        ? ((json as { data: unknown[] }).data)
        : [];

    for (const item of groups) {
      if (typeof item !== "object" || item === null) continue;
      const group = item as { id?: unknown; jid?: unknown; subject?: unknown };
      if (
        typeof group.subject === "string" &&
        normalizeForMatch(group.subject).includes("escritorio")
      ) {
        if (typeof group.id === "string" && group.id.trim()) {
          return group.id.trim();
        }
        if (typeof group.jid === "string" && group.jid.trim()) {
          return group.jid.trim();
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Evolution API fetchAllGroups error:", error);
    return null;
  }
}

function tokenizeForScore(value: string): Set<string> {
  const tokens = normalizeForMatch(value)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
  return new Set(tokens);
}

async function resolveCompanyFromMessage(params: {
  phone: string;
  requesterName: string;
  companyHint: string | null;
  rawText: string;
}): Promise<{ companyId: string | null; companyFallbackNote: string | null }> {
  const { phone, requesterName, companyHint, rawText } = params;

  // 1. Primary lookup: exact or trailing 8-9 digits phone match
  if (phone.length > 0) {
    const exactContact = await prisma.contact.findUnique({
      where: { phone },
      include: { company: true },
    });
    if (exactContact) {
      return { companyId: exactContact.companyId, companyFallbackNote: null };
    }

    if (phone.length >= 9) {
      const suffix9Contact = await prisma.contact.findFirst({
        where: { phone: { endsWith: phone.slice(-9) } },
        include: { company: true },
      });
      if (suffix9Contact) {
        return {
          companyId: suffix9Contact.companyId,
          companyFallbackNote: null,
        };
      }
    }

    if (phone.length >= 8) {
      const suffix8Contact = await prisma.contact.findFirst({
        where: { phone: { endsWith: phone.slice(-8) } },
        include: { company: true },
      });
      if (suffix8Contact) {
        return {
          companyId: suffix8Contact.companyId,
          companyFallbackNote: null,
        };
      }
    }
  }

  // 2. Secondary lookup: normalized phone, contact name, or company name
  const contacts = await prisma.contact.findMany({
    include: { company: true },
  });

  if (phone.length >= 8) {
    const last8 = phone.slice(-8);
    const formattedPhoneContact = contacts.find((c) => {
      const normalized = normalizePhone(c.phone);
      return normalized === phone || normalized.endsWith(last8);
    });
    if (formattedPhoneContact) {
      return {
        companyId: formattedPhoneContact.companyId,
        companyFallbackNote: null,
      };
    }
  }

  const normalizedRequester = normalizeForMatch(requesterName);
  if (
    normalizedRequester.length >= 3 &&
    requesterName !== "Solicitante WhatsApp"
  ) {
    const contactByName = contacts.find((c) => {
      const contactName = normalizeForMatch(c.name);
      return (
        contactName.length >= 3 &&
        (contactName.includes(normalizedRequester) ||
          normalizedRequester.includes(contactName))
      );
    });
    if (contactByName) {
      return {
        companyId: contactByName.companyId,
        companyFallbackNote: null,
      };
    }
  }

  if (companyHint) {
    const normalizedHint = normalizeForMatch(companyHint);
    if (normalizedHint.length >= 2) {
      const companies = await prisma.company.findMany();
      const matchedCompany = companies.find((co) => {
        const companyName = normalizeForMatch(co.name);
        const companyNickname = co.nickname
          ? normalizeForMatch(co.nickname)
          : "";
        const nameMatches =
          companyName.length >= 2 &&
          (companyName.includes(normalizedHint) ||
            normalizedHint.includes(companyName));
        const nicknameMatches =
          companyNickname.length >= 2 &&
          (companyNickname.includes(normalizedHint) ||
            normalizedHint.includes(companyNickname));
        return nameMatches || nicknameMatches;
      });
      if (matchedCompany) {
        return { companyId: matchedCompany.id, companyFallbackNote: null };
      }
    }
  }

  // 3. Gemini semantic fallback matching (company name, nickname, or contact name)
  if (process.env.GEMINI_API_KEY?.trim()) {
    const companiesWithContacts = await prisma.company.findMany({
      include: {
        contacts: {
          select: { name: true },
        },
      },
    });

    if (companiesWithContacts.length > 0) {
      const queryTokens = tokenizeForScore(
        [
          requesterName !== "Solicitante WhatsApp" ? requesterName : "",
          companyHint ?? "",
          rawText,
        ].join(" ")
      );

      const scoredCandidates = companiesWithContacts
        .map((co) => {
          const candidateTokens = tokenizeForScore(
            [
              co.name,
              co.nickname ?? "",
              ...co.contacts.map((c) => c.name),
            ].join(" ")
          );
          let sharedScore = 0;
          for (const token of queryTokens) {
            if (candidateTokens.has(token)) {
              sharedScore += 2;
            }
          }
          return {
            company: co,
            sharedScore,
            contactCount: co.contacts.length,
          };
        })
        .sort((a, b) => {
          if (b.sharedScore !== a.sharedScore) {
            return b.sharedScore - a.sharedScore;
          }
          return b.contactCount - a.contactCount;
        })
        .slice(0, 40)
        .map(({ company }) => ({
          id: company.id,
          name: company.name,
          nickname: company.nickname ?? null,
          contactNames: company.contacts.map((c) => c.name),
        }));

      const geminiMatchedId = await matchCompanyWithGemini({
        text: rawText,
        requesterName,
        companyHint,
        candidates: scoredCandidates,
      });

      if (geminiMatchedId) {
        return { companyId: geminiMatchedId, companyFallbackNote: null };
      }
    }
  }

  // 4. Fallback when no matching company/contact is found
  const companyFallbackNote = companyHint
    ? `Empresa citada: ${companyHint} (não encontrada no cadastro)`
    : "Contato/empresa não identificado automaticamente";

  return { companyId: null, companyFallbackNote };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge") ?? "";

  const expectedToken =
    process.env.WHATSAPP_VERIFY_TOKEN || "eco-coletas-verify-token";

  if (mode === "subscribe" && token === expectedToken) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  const parsed = parseWhatsAppPayload(body);
  if (!parsed) {
    return NextResponse.json(
      { ignored: true, reason: "No text message found" },
      { status: 200 }
    );
  }

  if (parsed.phone) {
    const pending = pendingCompanyMap.get(parsed.phone);
    if (pending) {
      if (Date.now() - pending.createdAt < PENDING_COMPANY_TTL_MS) {
        pendingCompanyMap.delete(parsed.phone);

        const { companyId: followUpCompanyId } = await resolveCompanyFromMessage(
          {
            phone: parsed.phone,
            requesterName: parsed.senderName,
            companyHint: parsed.text,
            rawText: parsed.text,
          }
        );

        if (followUpCompanyId) {
          await prisma.order.updateMany({
            where: { id: { in: pending.orderIds } },
            data: {
              companyId: followUpCompanyId,
              needsReview: false,
              companyFallbackNote: null,
            },
          });

          await sendEvolutionText(
            parsed.remoteJid || parsed.phone,
            `${getBrasiliaGreeting()}, perfeito! Sua coleta foi agendada.`
          );

          return NextResponse.json(
            {
              ok: true,
              companyResolvedOnFollowUp: true,
              companyId: followUpCompanyId,
            },
            { status: 200 }
          );
        }

        const officeGroupJid = await findOfficeGroupJid();
        if (officeGroupJid) {
          await sendEvolutionText(
            officeGroupJid,
            `⚠️ Atenção Escritório: O contato ${pending.senderName || parsed.phone} (${parsed.phone}) solicitou uma coleta ("${pending.rawMessage}"), pedimos o nome da empresa e ele respondeu "${parsed.text}", mas não foi possível identificar automaticamente. Verificar no painel.`
          );
        }

        return NextResponse.json(
          { ok: true, escalatedToOffice: true },
          { status: 200 }
        );
      } else {
        pendingCompanyMap.delete(parsed.phone);
      }
    }
  }

  const extracted = await extractOrderWithNLP(parsed.text, parsed.senderName);

  if (!extracted.isOrderRequest) {
    return NextResponse.json(
      {
        ignored: true,
        isOrderRequest: false,
        reason: "Mensagem comum ignorada (não é pedido de coleta/troca)",
      },
      { status: 200 }
    );
  }

  const { companyId, companyFallbackNote } = await resolveCompanyFromMessage({
    phone: parsed.phone,
    requesterName: extracted.requesterName,
    companyHint: extracted.companyHint,
    rawText: parsed.text,
  });

  const needsReview = companyId === null;

  const orderId =
    typeof body === "object" &&
    body !== null &&
    typeof (body as { orderId?: unknown }).orderId === "string"
      ? (body as { orderId: string }).orderId.trim()
      : "";

  if (orderId) {
    const existing = await prisma.order.findUnique({
      where: { id: orderId },
      include: { company: true },
    });

    if (existing) {
      const candidatePatch = {
        requesterName: extracted.requesterName,
        actionType: extracted.actionType,
        containerType: extracted.containerType,
        quantity: extracted.quantity,
        companyId,
        needsReview,
        companyFallbackNote,
      };

      const filteredPatch = filterAiUpdatePayload(existing, candidatePatch);

      if (Object.keys(filteredPatch).length === 0) {
        return NextResponse.json(
          {
            ok: true,
            skippedOverwrite: true,
            reason: "Pedido editado manualmente está protegido contra alterações da IA",
            order: existing,
          },
          { status: 200 }
        );
      }

      const updated = await prisma.order.update({
        where: { id: existing.id },
        data: filteredPatch,
        include: { company: true },
      });

      return NextResponse.json(
        {
          ok: true,
          updatedByAi: true,
          order: updated,
        },
        { status: 200 }
      );
    }
  }

  // 5-minute per-contact cooldown to avoid duplicate orders from sequential messages
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const phoneOrConditions: Array<
    { requesterPhone: string } | { requesterPhone: { endsWith: string } }
  > = [];

  if (parsed.phone) {
    phoneOrConditions.push({ requesterPhone: parsed.phone });
    if (parsed.phone.length >= 8) {
      phoneOrConditions.push({
        requesterPhone: { endsWith: parsed.phone.slice(-8) },
      });
    }
  }
  if (parsed.remoteJid) {
    phoneOrConditions.push({ requesterPhone: parsed.remoteJid });
  }

  if (phoneOrConditions.length > 0) {
    const recentOrder = await prisma.order.findFirst({
      where: {
        createdAt: { gte: fiveMinutesAgo },
        OR: phoneOrConditions,
      },
      orderBy: { createdAt: "desc" },
    });

    if (recentOrder) {
      return NextResponse.json(
        {
          ignored: true,
          cooldown: true,
          reason:
            "Contato em janela de cooldown de 5 minutos (pedido recente já registrado)",
          recentOrderId: recentOrder.id,
        },
        { status: 200 }
      );
    }
  }

  const agg = await prisma.order.aggregate({
    _max: { priorityOrder: true },
  });
  const nextPriority = (agg._max.priorityOrder ?? 0) + 1;

  const createdOrders = [];
  for (let i = 0; i < extracted.items.length; i++) {
    const item = extracted.items[i];
    const order = await prisma.order.create({
      data: {
        requesterName: extracted.requesterName,
        requesterPhone: parsed.phone || null,
        companyId,
        companyFallbackNote,
        actionType: item.actionType,
        containerType: item.containerType,
        quantity: item.quantity,
        rawMessage: parsed.text,
        status: "PENDENTE",
        priorityOrder: nextPriority + i,
        needsReview,
        manuallyEdited: false,
        lockedFields: "[]",
      },
      include: {
        company: true,
      },
    });
    emitNewOrder(order);
    createdOrders.push(order);
  }

  const greeting = getBrasiliaGreeting();
  const replyTarget = parsed.remoteJid || parsed.phone;
  let autoReplySent = false;

  if (companyId === null) {
    if (parsed.phone) {
      pendingCompanyMap.set(parsed.phone, {
        orderIds: createdOrders.map((o) => o.id),
        phone: parsed.phone,
        remoteJid: parsed.remoteJid,
        senderName: extracted.requesterName,
        rawMessage: parsed.text,
        createdAt: Date.now(),
      });
    }
    autoReplySent = await sendEvolutionText(
      replyTarget,
      `${greeting}! Para agendar sua coleta, poderia informar o nome da sua empresa?`
    );
  } else {
    const confirmationText =
      createdOrders.length > 1
        ? `${greeting}, suas coletas foram agendadas!`
        : `${greeting}, agendado!`;
    autoReplySent = await sendEvolutionText(replyTarget, confirmationText);
  }

  return NextResponse.json(
    {
      ok: true,
      extracted,
      order: createdOrders[0],
      orders: createdOrders,
      autoReplySent,
    },
    { status: 201 }
  );
}
