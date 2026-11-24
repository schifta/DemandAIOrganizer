import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseWhatsAppPayload, normalizePhone } from "@/lib/whatsapp-parser";
import { extractOrderWithNLP } from "@/lib/nlp-extractor";

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function resolveCompanyFromMessage(params: {
  phone: string;
  requesterName: string;
  companyHint: string | null;
}): Promise<{ companyId: string | null; companyFallbackNote: string | null }> {
  const { phone, requesterName, companyHint } = params;

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
        return (
          companyName.length >= 2 &&
          (companyName.includes(normalizedHint) ||
            normalizedHint.includes(companyName))
        );
      });
      if (matchedCompany) {
        return { companyId: matchedCompany.id, companyFallbackNote: null };
      }
    }
  }

  // 3. Fallback when no matching company/contact is found
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

  const extracted = await extractOrderWithNLP(parsed.text, parsed.senderName);

  const { companyId, companyFallbackNote } = await resolveCompanyFromMessage({
    phone: parsed.phone,
    requesterName: extracted.requesterName,
    companyHint: extracted.companyHint,
  });

  const needsReview = companyId === null;

  const agg = await prisma.order.aggregate({
    _max: { priorityOrder: true },
  });
  const nextPriority = (agg._max.priorityOrder ?? 0) + 1;

  const order = await prisma.order.create({
    data: {
      requesterName: extracted.requesterName,
      requesterPhone: parsed.phone || null,
      companyId,
      companyFallbackNote,
      actionType: extracted.actionType,
      containerType: extracted.containerType,
      quantity: extracted.quantity,
      rawMessage: parsed.text,
      status: "PENDENTE",
      priorityOrder: nextPriority,
      needsReview,
    },
    include: {
      company: true,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      extracted,
      order,
    },
    { status: 201 }
  );
}
