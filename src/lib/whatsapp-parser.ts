export type WhatsAppProvider = "evolution" | "meta" | "simulator";

export type ParsedWhatsAppMessage = {
  phone: string;
  remoteJid?: string;
  senderName: string;
  text: string;
  provider: WhatsAppProvider;
  isAudio?: boolean;
  audioMimeType?: string;
  evolutionMessageKey?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Strips WhatsApp JID suffixes (`@s.whatsapp.net`, `@c.us`), `+`, spaces,
 * parentheses, dashes, and any other non-digit characters.
 */
export function normalizePhone(raw: string): string {
  return raw
    .replace(/@(?:s\.whatsapp\.net|c\.us|g\.us|lid)$/i, "")
    .replace(/\D/g, "");
}

function extractEvolutionText(message: Record<string, unknown>): string | null {
  const conversation = asNonEmptyString(message.conversation);
  if (conversation) return conversation;

  if (isRecord(message.extendedTextMessage)) {
    const extText = asNonEmptyString(message.extendedTextMessage.text);
    if (extText) return extText;
  }

  if (isRecord(message.imageMessage)) {
    const imgCaption = asNonEmptyString(message.imageMessage.caption);
    if (imgCaption) return imgCaption;
  }

  if (isRecord(message.videoMessage)) {
    const vidCaption = asNonEmptyString(message.videoMessage.caption);
    if (vidCaption) return vidCaption;
  }

  if (isRecord(message.documentMessage)) {
    const docCaption = asNonEmptyString(message.documentMessage.caption);
    if (docCaption) return docCaption;
  }

  return null;
}

function parseEvolutionPayload(
  body: Record<string, unknown>
): ParsedWhatsAppMessage | null {
  if (!isRecord(body.data)) return null;

  const data = body.data;
  const key = isRecord(data.key) ? data.key : null;
  const isExplicitlySimulated =
    body.simulated === true || body.simulate === true || data.simulated === true;

  if (key && key.fromMe === true && !isExplicitlySimulated) {
    return null;
  }

  const rawRemoteJid = key ? asNonEmptyString(key.remoteJid) : null;
  const keyParticipant = key ? asNonEmptyString(key.participant) : null;
  const dataParticipant = asNonEmptyString(data.participant);

  // Strict group & broadcast block: never process or reply to group messages
  if (
    rawRemoteJid?.toLowerCase().endsWith("@g.us") ||
    rawRemoteJid?.toLowerCase() === "status@broadcast" ||
    keyParticipant !== null ||
    dataParticipant !== null
  ) {
    return null;
  }

  const message = isRecord(data.message) ? data.message : null;
  const text = message ? extractEvolutionText(message) : null;
  const rawPhone = rawRemoteJid ?? asNonEmptyString(body.sender) ?? "";
  const senderName = asNonEmptyString(data.pushName) ?? "";

  if (!text) {
    if (message && isRecord(message.audioMessage)) {
      const audioMimeType =
        asNonEmptyString(message.audioMessage.mimetype) ?? "audio/ogg";
      return {
        phone: normalizePhone(rawPhone),
        ...(rawRemoteJid ? { remoteJid: rawRemoteJid } : {}),
        senderName,
        text: "",
        provider: "evolution",
        isAudio: true,
        audioMimeType,
        ...(key ? { evolutionMessageKey: key } : {}),
      };
    }
    return null;
  }

  return {
    phone: normalizePhone(rawPhone),
    ...(rawRemoteJid ? { remoteJid: rawRemoteJid } : {}),
    senderName,
    text,
    provider: "evolution",
  };
}

function parseMetaPayload(
  body: Record<string, unknown>
): ParsedWhatsAppMessage | null {
  if (!Array.isArray(body.entry)) return null;

  const firstEntry = body.entry[0];
  if (!isRecord(firstEntry) || !Array.isArray(firstEntry.changes)) return null;

  const firstChange = firstEntry.changes[0];
  if (!isRecord(firstChange) || !isRecord(firstChange.value)) return null;

  const value = firstChange.value;
  if (!Array.isArray(value.messages) || value.messages.length === 0) {
    return null;
  }

  const firstMessage = value.messages[0];
  if (!isRecord(firstMessage)) return null;

  let text: string | null = null;
  if (isRecord(firstMessage.text)) {
    text = asNonEmptyString(firstMessage.text.body);
  } else if (isRecord(firstMessage.button)) {
    text = asNonEmptyString(firstMessage.button.text);
  } else if (isRecord(firstMessage.image)) {
    text = asNonEmptyString(firstMessage.image.caption);
  }

  if (!text) return null;

  const rawPhone = asNonEmptyString(firstMessage.from) ?? "";

  let senderName = "";
  if (Array.isArray(value.contacts) && isRecord(value.contacts[0])) {
    const firstContact = value.contacts[0];
    if (isRecord(firstContact.profile)) {
      senderName = asNonEmptyString(firstContact.profile.name) ?? "";
    }
  }

  return {
    phone: normalizePhone(rawPhone),
    senderName,
    text,
    provider: "meta",
  };
}

function parseSimulatorPayload(
  body: Record<string, unknown>
): ParsedWhatsAppMessage | null {
  const text =
    asNonEmptyString(body.text) ?? asNonEmptyString(body.message) ?? null;
  if (!text) return null;

  const rawPhone =
    asNonEmptyString(body.phone) ?? asNonEmptyString(body.from) ?? "";
  const senderName =
    asNonEmptyString(body.senderName) ?? asNonEmptyString(body.name) ?? "";

  return {
    phone: normalizePhone(rawPhone),
    senderName,
    text,
    provider: "simulator",
  };
}

/**
 * Parses incoming WhatsApp webhook payloads from Evolution API,
 * WhatsApp Cloud API (Meta), or direct simulator/generic JSON.
 * Returns `null` if no text message can be extracted or if `fromMe` is true.
 */
export function parseWhatsAppPayload(
  body: unknown
): ParsedWhatsAppMessage | null {
  if (!isRecord(body)) return null;

  if (isRecord(body.data)) {
    return parseEvolutionPayload(body);
  }

  if (Array.isArray(body.entry)) {
    return parseMetaPayload(body);
  }

  return parseSimulatorPayload(body);
}
