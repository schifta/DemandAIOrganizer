export type OrderActionType = "TROCA" | "COLETA";
export type OrderContainerType = "CAIXA_CACAMBA" | "TAMBOR";

export type ExtractedOrderData = {
  requesterName: string;
  companyHint: string | null;
  actionType: OrderActionType;
  containerType: OrderContainerType;
  quantity: number;
};

const PORTUGUESE_NUMBER_WORDS: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
};

const CONTAINER_KEYWORDS =
  "tambores|tambor|bombonas|bombona|caixas|caixa|cacambas|cacamba";

const NAME_STOP_WORDS = new Set([
  "da",
  "do",
  "das",
  "dos",
  "de",
  "e",
  "empresa",
  "preciso",
  "precisando",
  "precisamos",
  "gostaria",
  "quero",
  "queremos",
  "solicitando",
  "solicito",
  "pedindo",
  "para",
  "pra",
  "com",
  "aqui",
  "por",
]);

const NON_COMPANY_HINTS = new Set([
  "coleta",
  "troca",
  "caixa",
  "caixas",
  "cacamba",
  "cacambas",
  "tambor",
  "tambores",
  "bombona",
  "bombonas",
  "manha",
  "tarde",
  "noite",
  "semana",
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
  "domingo",
  "empresa",
]);

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractQuantity(asciiText: string): number {
  const digitsBeforeContainer = new RegExp(
    `\\b(\\d{1,3})\\s*(?:x\\s*)?(?:de\\s+)?(?:${CONTAINER_KEYWORDS})\\b`,
    "i"
  );
  const matchDigitsBefore = asciiText.match(digitsBeforeContainer);
  if (matchDigitsBefore) {
    const parsed = parseInt(matchDigitsBefore[1], 10);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }

  const wordKeys = Object.keys(PORTUGUESE_NUMBER_WORDS).join("|");
  const wordsBeforeContainer = new RegExp(
    `\\b(${wordKeys})\\s+(?:de\\s+)?(?:${CONTAINER_KEYWORDS})\\b`,
    "i"
  );
  const matchWordsBefore = asciiText.match(wordsBeforeContainer);
  if (matchWordsBefore) {
    const word = matchWordsBefore[1].toLowerCase();
    const mapped = PORTUGUESE_NUMBER_WORDS[word];
    if (mapped) return mapped;
  }

  const digitsAfterContainer = new RegExp(
    `\\b(?:${CONTAINER_KEYWORDS})\\s*[:(\\-]?\\s*(\\d{1,3})\\b`,
    "i"
  );
  const matchDigitsAfter = asciiText.match(digitsAfterContainer);
  if (matchDigitsAfter) {
    const parsed = parseInt(matchDigitsAfter[1], 10);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }

  const standaloneDigits = asciiText.match(/(?:^|\s)(\d{1,3})(?=\s|$|[.,;!?)])/);
  if (standaloneDigits) {
    const parsed = parseInt(standaloneDigits[1], 10);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }

  const multiWords = Object.keys(PORTUGUESE_NUMBER_WORDS)
    .filter((w) => w !== "um" && w !== "uma")
    .join("|");
  const standaloneWord = asciiText.match(
    new RegExp(`\\b(${multiWords})\\b`, "i")
  );
  if (standaloneWord) {
    const mapped = PORTUGUESE_NUMBER_WORDS[standaloneWord[1].toLowerCase()];
    if (mapped) return mapped;
  }

  return 1;
}

function cleanCapturedName(rawSegment: string): string {
  const words = rawSegment
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/^[,.:;!?-]+|[,.:;!?-]+$/g, ""))
    .filter(Boolean);

  const kept: string[] = [];
  for (const word of words) {
    const normalized = stripAccents(word).toLowerCase();
    if (NAME_STOP_WORDS.has(normalized)) {
      break;
    }
    kept.push(word);
    if (kept.length >= 3) break;
  }

  return kept.join(" ").trim();
}

function extractRequesterName(
  text: string,
  fallbackSenderName?: string
): string {
  const introPatterns = [
    /(?:aqui\s+[eé]\s+(?:o|a)?\s*)([^,.\n!?;]{2,60})/i,
    /(?:sou\s+(?:o|a)\s+)([^,.\n!?;]{2,60})/i,
    /(?:meu\s+nome\s+[eé]\s+)([^,.\n!?;]{2,60})/i,
    /(?:me\s+chamo\s+)([^,.\n!?;]{2,60})/i,
  ];

  for (const pattern of introPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const cleaned = cleanCapturedName(match[1]);
      if (cleaned.length >= 2) {
        return cleaned;
      }
    }
  }

  const fallback = fallbackSenderName?.trim();
  if (fallback && fallback.length > 0) {
    return fallback;
  }

  return "Solicitante WhatsApp";
}

function cleanCompanyHint(raw: string): string | null {
  const withoutTrailingClause = raw
    .split(
      /\b(?:precisando|preciso|precisamos|solicitando|solicito|gostaria|gostariamos|gostaríamos|quero|queremos|pedindo|para\s+(?:coleta|troca|retirar|buscar)|aqui|e\s+(?:preciso|gostaria|quero|solicitando))\b/i
    )[0]
    .replace(/^[\s,.:;\-]+|[\s,.:;\-]+$/g, "")
    .trim();

  if (withoutTrailingClause.length < 2) return null;

  const asciiLower = stripAccents(withoutTrailingClause).toLowerCase();
  if (NON_COMPANY_HINTS.has(asciiLower)) {
    return null;
  }

  return withoutTrailingClause;
}

function extractCompanyHint(text: string): string | null {
  const explicitEmpresaMatch = text.match(
    /(?:da\s+empresa|na\s+empresa|pela\s+empresa|empresa)\s+([^,.\n!?;]{2,80})/i
  );
  if (explicitEmpresaMatch?.[1]) {
    const cleaned = cleanCompanyHint(explicitEmpresaMatch[1]);
    if (cleaned) return cleaned;
  }

  const prepositionMatch = text.match(
    /(?:^|[\s,])(?:da|do)\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ0-9&.\- ]{1,60})/
  );
  if (prepositionMatch?.[1]) {
    const beforePunctuation = prepositionMatch[1].split(/[,.\n!?;]/)[0] ?? "";
    const cleaned = cleanCompanyHint(beforePunctuation);
    if (cleaned) return cleaned;
  }

  return null;
}

/**
 * Deterministic Portuguese NLP fallback parser for waste collection orders.
 */
export function fallbackExtractOrder(
  text: string,
  fallbackSenderName?: string
): ExtractedOrderData {
  const asciiText = stripAccents(text).toLowerCase();

  const isTroca = /\b(troca|trocar|substituir|substituicao|substituicoes)\b/i.test(
    asciiText
  );
  const actionType: OrderActionType = isTroca ? "TROCA" : "COLETA";

  const isTambor = /\b(tambor|tambores|bombona|bombonas)\b/i.test(asciiText);
  const containerType: OrderContainerType = isTambor
    ? "TAMBOR"
    : "CAIXA_CACAMBA";

  const quantity = Math.max(1, extractQuantity(asciiText));
  const requesterName = extractRequesterName(text, fallbackSenderName);
  const companyHint = extractCompanyHint(text);

  return {
    requesterName,
    companyHint,
    actionType,
    containerType,
    quantity,
  };
}

function sanitizeExtractedData(
  raw: unknown,
  originalText: string,
  fallbackSenderName?: string
): ExtractedOrderData | null {
  if (!isRecord(raw)) return null;

  const fallback = fallbackExtractOrder(originalText, fallbackSenderName);

  let actionType: OrderActionType = fallback.actionType;
  if (typeof raw.actionType === "string") {
    const upper = raw.actionType.trim().toUpperCase();
    if (upper === "TROCA" || upper === "COLETA") {
      actionType = upper;
    } else {
      return null;
    }
  } else {
    return null;
  }

  let containerType: OrderContainerType = fallback.containerType;
  if (typeof raw.containerType === "string") {
    const upper = raw.containerType.trim().toUpperCase();
    if (upper === "CAIXA_CACAMBA" || upper === "TAMBOR") {
      containerType = upper;
    } else {
      return null;
    }
  } else {
    return null;
  }

  let quantity = fallback.quantity;
  if (typeof raw.quantity === "number" && Number.isFinite(raw.quantity)) {
    quantity = Math.max(1, Math.round(raw.quantity));
  } else if (
    typeof raw.quantity === "string" &&
    /^\d+$/.test(raw.quantity.trim())
  ) {
    quantity = Math.max(1, parseInt(raw.quantity.trim(), 10));
  }

  let requesterName = fallback.requesterName;
  if (typeof raw.requesterName === "string") {
    const trimmed = raw.requesterName.trim();
    const invalidNames = new Set([
      "",
      "null",
      "n/a",
      "na",
      "desconhecido",
      "nao informado",
      "não informado",
    ]);
    if (!invalidNames.has(trimmed.toLowerCase())) {
      requesterName = trimmed;
    }
  }

  let companyHint: string | null = null;
  if (typeof raw.companyHint === "string") {
    const trimmed = raw.companyHint.trim();
    const invalidHints = new Set([
      "",
      "null",
      "n/a",
      "na",
      "nenhuma",
      "nao informada",
      "não informada",
    ]);
    companyHint = invalidHints.has(trimmed.toLowerCase()) ? null : trimmed;
  } else if (raw.companyHint === null || raw.companyHint === undefined) {
    companyHint = fallback.companyHint;
  }

  return {
    requesterName,
    companyHint,
    actionType,
    containerType,
    quantity,
  };
}

function buildExtractionPrompt(
  text: string,
  fallbackSenderName?: string
): string {
  return [
    "Extraia os dados estruturados de um pedido de coleta/troca de resíduos recebido via WhatsApp em português.",
    "Responda EXCLUSIVAMENTE com um objeto JSON válido seguindo exatamente este schema:",
    "{",
    '  "requesterName": string (nome do solicitante; se não estiver na mensagem use o nome do remetente informado ou "Solicitante WhatsApp"),',
    '  "companyHint": string | null (nome da empresa mencionada ou null se não houver),',
    '  "actionType": "TROCA" | "COLETA" ("TROCA" se pedir troca/substituição; caso contrário "COLETA"),',
    '  "containerType": "CAIXA_CACAMBA" | "TAMBOR" ("TAMBOR" para tambor/bombona; "CAIXA_CACAMBA" para caixa/caçamba),',
    '  "quantity": number (inteiro >= 1; padrão 1 se não especificado)',
    "}",
    "",
    `Nome do remetente no WhatsApp (fallback): ${fallbackSenderName?.trim() || "não informado"}`,
    `Mensagem: ${JSON.stringify(text)}`,
  ].join("\n");
}

async function callGeminiExtractor(
  apiKey: string,
  text: string,
  fallbackSenderName?: string
): Promise<ExtractedOrderData | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildExtractionPrompt(text, fallbackSenderName) }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            requesterName: { type: "STRING" },
            companyHint: { type: "STRING", nullable: true },
            actionType: { type: "STRING", enum: ["TROCA", "COLETA"] },
            containerType: {
              type: "STRING",
              enum: ["CAIXA_CACAMBA", "TAMBOR"],
            },
            quantity: { type: "INTEGER" },
          },
          required: [
            "requesterName",
            "companyHint",
            "actionType",
            "containerType",
            "quantity",
          ],
        },
      },
    }),
  });

  if (!response.ok) return null;

  const json: unknown = await response.json();
  if (!isRecord(json) || !Array.isArray(json.candidates)) return null;

  const firstCandidate = json.candidates[0];
  if (!isRecord(firstCandidate) || !isRecord(firstCandidate.content)) {
    return null;
  }

  const parts = firstCandidate.content.parts;
  if (!Array.isArray(parts) || !isRecord(parts[0])) return null;

  const rawText = parts[0].text;
  if (typeof rawText !== "string") return null;

  const parsed: unknown = JSON.parse(rawText);
  return sanitizeExtractedData(parsed, text, fallbackSenderName);
}

async function callOpenAIExtractor(
  apiKey: string,
  text: string,
  fallbackSenderName?: string
): Promise<ExtractedOrderData | null> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Você é um extrator rigoroso de pedidos de logística de resíduos (EcoColetas). Responda apenas com JSON válido.",
        },
        {
          role: "user",
          content: buildExtractionPrompt(text, fallbackSenderName),
        },
      ],
    }),
  });

  if (!response.ok) return null;

  const json: unknown = await response.json();
  if (!isRecord(json) || !Array.isArray(json.choices)) return null;

  const firstChoice = json.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) return null;

  const rawContent = firstChoice.message.content;
  if (typeof rawContent !== "string") return null;

  const parsed: unknown = JSON.parse(rawContent);
  return sanitizeExtractedData(parsed, text, fallbackSenderName);
}

/**
 * Extracts structured order data from a Portuguese WhatsApp message using
 * Gemini, OpenAI, or a deterministic Portuguese NLP fallback when keys are
 * absent or external calls fail.
 */
export async function extractOrderWithNLP(
  text: string,
  fallbackSenderName?: string
): Promise<ExtractedOrderData> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    try {
      const result = await callGeminiExtractor(
        geminiKey,
        text,
        fallbackSenderName
      );
      if (result) return result;
    } catch {
      // Fall through to deterministic fallback parser
    }
  } else {
    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    if (openaiKey) {
      try {
        const result = await callOpenAIExtractor(
          openaiKey,
          text,
          fallbackSenderName
        );
        if (result) return result;
      } catch {
        // Fall through to deterministic fallback parser
      }
    }
  }

  return fallbackExtractOrder(text, fallbackSenderName);
}
