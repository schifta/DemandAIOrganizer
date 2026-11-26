export type OrderActionType = "TROCA" | "COLETA";
export type OrderContainerType = "CAIXA_CACAMBA" | "TAMBOR";

export type ExtractedOrderItem = {
  actionType: OrderActionType;
  containerType: OrderContainerType;
  quantity: number;
};

export type ExtractedOrderData = {
  isOrderRequest: boolean;
  needsClarification?: boolean;
  requesterName: string;
  companyHint: string | null;
  actionType: OrderActionType;
  containerType: OrderContainerType;
  quantity: number;
  items: ExtractedOrderItem[];
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

const TAMBOR_ABBREV_REGEX = /\b(\d{1,3})\s*(?:t|tb|tbs)\b/i;
const CAIXA_ABBREV_REGEX = /\b(\d{1,3})\s*(?:cx|cxs)\b/i;

const GREETING_ONLY_REGEX =
  /^(?:oi+|ol[aá]+|opa+|e\s*a[ií]+|bom\s+dia|boa\s+tarde|boa\s+noite|tudo\s+bem|td\s+bem|blz|beleza|ok(?:ay)?|obrigad[oa]|vlw|valeu|show|top|perfeito|combinado|certo|sim|n[aã]o|tchau|at[eé]\s+(?:mais|logo))$/i;

function isGreetingOrChitchat(asciiText: string): boolean {
  const cleaned = asciiText
    .replace(/[!?.…,;:\-_/\\()[\]{}"'`~*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 2) return true;
  return GREETING_ONLY_REGEX.test(cleaned);
}

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

const DEPARTMENT_PREFIX_TOKENS = new Set([
  "rh",
  "compras",
  "financeiro",
  "comercial",
  "logistica",
  "atendimento",
  "recepcao",
  "adm",
  "administrativo",
  "dep",
  "depto",
  "departamento",
  "setor",
  "gerencia",
  "diretoria",
  "portaria",
  "expedicao",
  "almoxarifado",
  "contato",
]);

const CORPORATE_SUFFIX_TOKENS = new Set([
  "ltda",
  "sa",
  "s/a",
  "industria",
  "comercio",
  "eireli",
  "me",
  "epp",
]);

const CONNECTOR_TOKENS = new Set(["de", "da", "do", "das", "dos"]);

/**
 * Normalizes accents/lowercase and removes common department/role prefixes
 * from the start (or standalone tokens) such as "RH", "Compras", "Falar com".
 */
export function stripDepartmentPrefixes(value: string): string {
  let normalized = stripAccents(value)
    .toLowerCase()
    .replace(/\bfalar\s+com\b/g, " ")
    .replace(/[|:/\\()[\]{}"'`~*]+/g, " ")
    .replace(/\s*[-–—]+\s*/g, " ")
    .replace(/[.,;!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";

  const tokens = normalized.split(" ").filter(Boolean);
  // Strip leading department prefixes and connectors
  while (
    tokens.length > 0 &&
    (DEPARTMENT_PREFIX_TOKENS.has(tokens[0]) ||
      CONNECTOR_TOKENS.has(tokens[0]))
  ) {
    tokens.shift();
  }

  // Also remove standalone department tokens anywhere if other tokens remain
  const filtered = tokens.filter((t) => !DEPARTMENT_PREFIX_TOKENS.has(t));
  const resultTokens = filtered.length > 0 ? filtered : tokens;

  // Strip leading connectors again if exposed after removing standalone tokens
  while (resultTokens.length > 0 && CONNECTOR_TOKENS.has(resultTokens[0])) {
    resultTokens.shift();
  }

  normalized = resultTokens.join(" ").trim();
  return normalized;
}

function normalizeCompanyForComparison(value: string): string {
  const normalized = stripAccents(value)
    .toLowerCase()
    .replace(/\bs\s*\/\s*a\b/g, " sa ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";

  const tokens = normalized
    .split(" ")
    .filter((t) => t.length > 0 && !CORPORATE_SUFFIX_TOKENS.has(t));

  return (tokens.length > 0 ? tokens : normalized.split(" ")).join(" ").trim();
}

function tokenizeFuzzy(value: string): string[] {
  return value
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !CONNECTOR_TOKENS.has(t));
}

/**
 * Matches a query (such as pushName, requesterName, or companyHint) against
 * registered companies using department prefix stripping, corporate suffix
 * normalization, exact, substring, and token-overlap fuzzy matching.
 */
export function matchCompanyByNameFuzzy(
  query: string,
  companies: Array<{ id: string; name: string; nickname?: string | null }>
): string | null {
  const cleanQuery = stripDepartmentPrefixes(query);
  if (cleanQuery.length < 2) {
    return null;
  }

  const queryNoCorp = normalizeCompanyForComparison(cleanQuery) || cleanQuery;
  const queryTokens = tokenizeFuzzy(queryNoCorp);

  let bestId: string | null = null;
  let bestScore = 0;

  for (const company of companies) {
    const candidates = [company.name, company.nickname ?? ""].filter(
      (v) => v.trim().length > 0
    );

    for (const candidateRaw of candidates) {
      const candidateNorm = normalizeCompanyForComparison(candidateRaw);
      const candidateRawNorm = stripAccents(candidateRaw)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      for (const target of [candidateNorm, candidateRawNorm]) {
        if (target.length < 2) continue;

        // 1. Exact match
        if (queryNoCorp === target || cleanQuery === target) {
          return company.id;
        }

        // 2. Substring match
        if (
          queryNoCorp.length >= 3 &&
          target.length >= 3 &&
          (target.includes(queryNoCorp) || queryNoCorp.includes(target))
        ) {
          const lengthRatio =
            Math.min(queryNoCorp.length, target.length) /
            Math.max(queryNoCorp.length, target.length);
          const score = 80 + lengthRatio * 15;
          if (score > bestScore) {
            bestScore = score;
            bestId = company.id;
          }
          continue;
        }

        // 3. Token-overlap fuzzy match
        const targetTokens = tokenizeFuzzy(target);
        if (queryTokens.length === 0 || targetTokens.length === 0) continue;

        const targetSet = new Set(targetTokens);
        let sharedCount = 0;
        let maxSharedTokenLen = 0;

        for (const qt of queryTokens) {
          if (targetSet.has(qt)) {
            sharedCount += 1;
            if (qt.length > maxSharedTokenLen) maxSharedTokenLen = qt.length;
          }
        }

        if (sharedCount > 0 && maxSharedTokenLen >= 3) {
          const queryOverlap = sharedCount / queryTokens.length;
          const targetOverlap = sharedCount / targetTokens.length;
          if (queryOverlap >= 0.5 || targetOverlap >= 0.5) {
            const score = 40 + (queryOverlap + targetOverlap) * 15 + sharedCount * 2;
            if (score > bestScore) {
              bestScore = score;
              bestId = company.id;
            }
          }
        }
      }
    }
  }

  return bestId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractQuantity(asciiText: string): number {
  const matchTamborAbbrev = asciiText.match(TAMBOR_ABBREV_REGEX);
  if (matchTamborAbbrev) {
    const parsed = parseInt(matchTamborAbbrev[1], 10);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }

  const matchCaixaAbbrev = asciiText.match(CAIXA_ABBREV_REGEX);
  if (matchCaixaAbbrev) {
    const parsed = parseInt(matchCaixaAbbrev[1], 10);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }

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

function extractContainerQuantity(
  asciiText: string,
  abbrevRegex: RegExp,
  keywordsPattern: string
): number | null {
  const matchAbbrev = asciiText.match(abbrevRegex);
  if (matchAbbrev) {
    const parsed = parseInt(matchAbbrev[1], 10);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }

  const digitsBefore = new RegExp(
    `\\b(\\d{1,3})\\s*(?:x\\s*)?(?:de\\s+)?(?:${keywordsPattern})\\b`,
    "i"
  );
  const matchDigitsBefore = asciiText.match(digitsBefore);
  if (matchDigitsBefore) {
    const parsed = parseInt(matchDigitsBefore[1], 10);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }

  const wordKeys = Object.keys(PORTUGUESE_NUMBER_WORDS).join("|");
  const wordsBefore = new RegExp(
    `\\b(${wordKeys})\\s+(?:de\\s+)?(?:${keywordsPattern})\\b`,
    "i"
  );
  const matchWordsBefore = asciiText.match(wordsBefore);
  if (matchWordsBefore) {
    const mapped = PORTUGUESE_NUMBER_WORDS[matchWordsBefore[1].toLowerCase()];
    if (mapped) return mapped;
  }

  const digitsAfter = new RegExp(
    `\\b(?:${keywordsPattern})\\s*[:(\\-]?\\s*(\\d{1,3})\\b`,
    "i"
  );
  const matchDigitsAfter = asciiText.match(digitsAfter);
  if (matchDigitsAfter) {
    const parsed = parseInt(matchDigitsAfter[1], 10);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }

  if (new RegExp(`\\b(?:${keywordsPattern})\\b`, "i").test(asciiText)) {
    return 1;
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

  const hasExplicitOrderTerm =
    /\b(coleta|coletar|troca|trocar|agendar|agendamento|caixa|caixas|cacamba|cacambas|tambor|tambores|bombona|bombonas)\b/i.test(
      asciiText
    ) ||
    TAMBOR_ABBREV_REGEX.test(asciiText) ||
    CAIXA_ABBREV_REGEX.test(asciiText);

  const isOrderRequest =
    !isGreetingOrChitchat(asciiText) && hasExplicitOrderTerm;

  const isTroca = /\b(troca|trocar|substituir|substituicao|substituicoes)\b/i.test(
    asciiText
  );
  const actionType: OrderActionType = isTroca ? "TROCA" : "COLETA";

  const caixaQty = extractContainerQuantity(
    asciiText,
    CAIXA_ABBREV_REGEX,
    "caixas?|cacambas?"
  );
  const tamborQty = extractContainerQuantity(
    asciiText,
    TAMBOR_ABBREV_REGEX,
    "tambores?|bombonas?"
  );

  let items: ExtractedOrderItem[];
  let containerType: OrderContainerType;
  let quantity: number;

  if (caixaQty !== null && tamborQty !== null) {
    items = [
      { actionType, containerType: "CAIXA_CACAMBA", quantity: caixaQty },
      { actionType, containerType: "TAMBOR", quantity: tamborQty },
    ];
    containerType = items[0].containerType;
    quantity = items[0].quantity;
  } else {
    const isTambor =
      /\b(tambor|tambores|bombona|bombonas)\b/i.test(asciiText) ||
      TAMBOR_ABBREV_REGEX.test(asciiText);
    containerType = isTambor ? "TAMBOR" : "CAIXA_CACAMBA";
    quantity = Math.max(1, extractQuantity(asciiText));
    items = [{ actionType, containerType, quantity }];
  }

  const requesterName = extractRequesterName(text, fallbackSenderName);
  const companyHint = extractCompanyHint(text);

  return {
    isOrderRequest,
    needsClarification: !isOrderRequest && !isGreetingOrChitchat(asciiText),
    requesterName,
    companyHint,
    actionType,
    containerType,
    quantity,
    items,
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

  const asciiOriginal = stripAccents(originalText).toLowerCase();
  const isGreeting = isGreetingOrChitchat(asciiOriginal);
  const isOrderRequest = isGreeting
    ? false
    : typeof raw.isOrderRequest === "boolean"
      ? raw.isOrderRequest
      : fallback.isOrderRequest;

  const needsClarification = isGreeting
    ? false
    : typeof raw.needsClarification === "boolean"
      ? raw.needsClarification
      : isOrderRequest
        ? false
        : fallback.needsClarification ?? true;

  const sanitizedItems: ExtractedOrderItem[] = [];
  if (Array.isArray(raw.items)) {
    for (const rawItem of raw.items) {
      if (!isRecord(rawItem)) continue;
      const itemAction =
        typeof rawItem.actionType === "string"
          ? rawItem.actionType.trim().toUpperCase()
          : "";
      const itemContainer =
        typeof rawItem.containerType === "string"
          ? rawItem.containerType.trim().toUpperCase()
          : "";
      if (
        (itemAction !== "TROCA" && itemAction !== "COLETA") ||
        (itemContainer !== "CAIXA_CACAMBA" && itemContainer !== "TAMBOR")
      ) {
        continue;
      }
      let itemQty = 1;
      if (
        typeof rawItem.quantity === "number" &&
        Number.isFinite(rawItem.quantity)
      ) {
        itemQty = Math.max(1, Math.round(rawItem.quantity));
      } else if (
        typeof rawItem.quantity === "string" &&
        /^\d+$/.test(rawItem.quantity.trim())
      ) {
        itemQty = Math.max(1, parseInt(rawItem.quantity.trim(), 10));
      }
      sanitizedItems.push({
        actionType: itemAction,
        containerType: itemContainer,
        quantity: itemQty,
      });
    }
  }

  const items: ExtractedOrderItem[] =
    sanitizedItems.length > 0
      ? sanitizedItems
      : [{ actionType, containerType, quantity }];

  return {
    isOrderRequest,
    needsClarification,
    requesterName,
    companyHint,
    actionType: items[0].actionType,
    containerType: items[0].containerType,
    quantity: items[0].quantity,
    items,
  };
}

function buildExtractionPrompt(
  text: string,
  fallbackSenderName?: string
): string {
  return [
    "Extraia os dados estruturados de um pedido de coleta/troca de resíduos recebido via WhatsApp em português.",
    "Regras obrigatórias:",
    '- Saudações ou mensagens curtas sem intenção clara de pedido ("Oi", "Olá", "Bom dia", "Ok", "Tudo bem?", "Obrigado") DEVEM retornar "isOrderRequest": false e "needsClarification": false.',
    '- Mensagens que NÃO são saudações simples, mas são ambíguas/incompletas ou dúvidas que precisam de atenção da equipe (ex: "Cadê o motorista?", "Preciso de ajuda", "Vocês atendem hoje?") DEVEM retornar "isOrderRequest": false e "needsClarification": true.',
    '- Para pedidos claros, retorne "needsClarification": false (ou true apenas se faltar informação crítica e precisar revisão da equipe).',
    '- Abreviações comuns de WhatsApp: número seguido de "t", "tb" ou "tbs" (ex: "8t", "4 t") significa "TAMBOR" com aquela quantidade; número seguido de "cx" ou "cxs" (ex: "2cx") significa "CAIXA_CACAMBA" com aquela quantidade.',
    '- Se a mensagem pedir múltiplos tipos de recipientes (ex: "1 cx e 5t", "2 caixas e 3 tambores"), inclua cada um como um item separado no array "items" e mantenha actionType, containerType e quantity iguais ao primeiro item.',
    '- Ao identificar companyHint a partir da mensagem ou do Nome/Perfil do WhatsApp (pushName), remova prefixos de setor/departamento (ex: RH, Compras, Financeiro, Logística, Portaria, Adm, Depto). Exemplos:',
    '  * pushName: "RH Samrello" + Mensagem: "Bom dia, preciso de coleta de 2 caixas" -> companyHint: "Samrello", isOrderRequest: true, needsClarification: false',
    '  * pushName: "Compras Alfa" + Mensagem: "Pode trocar 4 tambores?" -> companyHint: "Alfa", isOrderRequest: true, needsClarification: false',
    '  * pushName: "João" + Mensagem: "Bom dia!" -> companyHint: null, isOrderRequest: false, needsClarification: false',
    '  * pushName: "Maria" + Mensagem: "O caminhão já saiu?" -> companyHint: null, isOrderRequest: false, needsClarification: true',
    "Responda EXCLUSIVAMENTE com um objeto JSON válido seguindo exatamente este schema:",
    "{",
    '  "isOrderRequest": boolean (true SOMENTE se for pedido real de coleta, troca, agendamento, retirada ou envio de caixas/caçambas/tambores/resíduos; false para saudações, agradecimentos ou conversas comuns),',
    '  "needsClarification": boolean (true quando uma mensagem não-saudação é ambígua/incompleta e precisa de atenção da equipe; false para pedidos claros ou saudações simples),',
    '  "requesterName": string (nome do solicitante; se não estiver na mensagem use o nome do remetente informado ou "Solicitante WhatsApp"),',
    '  "companyHint": string | null (nome da empresa mencionada ou extraída do pushName sem prefixo de setor, ou null se não houver),',
    '  "actionType": "TROCA" | "COLETA" ("TROCA" se pedir troca/substituição; caso contrário "COLETA"),',
    '  "containerType": "CAIXA_CACAMBA" | "TAMBOR" ("TAMBOR" para tambor/bombona; "CAIXA_CACAMBA" para caixa/caçamba),',
    '  "quantity": number (inteiro >= 1; padrão 1 se não especificado),',
    '  "items": Array<{ "actionType": "TROCA" | "COLETA", "containerType": "CAIXA_CACAMBA" | "TAMBOR", "quantity": number }> (lista com todos os itens do pedido)',
    "}",
    "",
    `Nome/Perfil do WhatsApp (pushName): ${fallbackSenderName?.trim() || "não informado"}`,
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
            isOrderRequest: { type: "BOOLEAN" },
            needsClarification: { type: "BOOLEAN" },
            requesterName: { type: "STRING" },
            companyHint: { type: "STRING", nullable: true },
            actionType: { type: "STRING", enum: ["TROCA", "COLETA"] },
            containerType: {
              type: "STRING",
              enum: ["CAIXA_CACAMBA", "TAMBOR"],
            },
            quantity: { type: "INTEGER" },
            items: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  actionType: { type: "STRING", enum: ["TROCA", "COLETA"] },
                  containerType: {
                    type: "STRING",
                    enum: ["CAIXA_CACAMBA", "TAMBOR"],
                  },
                  quantity: { type: "INTEGER" },
                },
                required: ["actionType", "containerType", "quantity"],
              },
            },
          },
          required: [
            "isOrderRequest",
            "needsClarification",
            "requesterName",
            "companyHint",
            "actionType",
            "containerType",
            "quantity",
            "items",
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

export type CompanyMatchCandidate = {
  id: string;
  name: string;
  nickname: string | null;
  contactNames: string[];
};

/**
 * Uses Gemini to match a WhatsApp order message against candidate companies
 * (including nicknames, abbreviations, and contact names).
 */
export async function matchCompanyWithGemini(params: {
  text: string;
  requesterName: string;
  pushName?: string;
  companyHint: string | null;
  candidates: CompanyMatchCandidate[];
}): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const topCandidates = params.candidates.slice(0, 40);
  if (!apiKey || topCandidates.length === 0) {
    return null;
  }

  const validIds = new Set(topCandidates.map((c) => c.id));
  const prompt = [
    "Associe a mensagem de WhatsApp a uma das empresas candidatas abaixo, se houver correspondência clara pelo nome da empresa, apelido/sigla, nome do contato ou Nome/Perfil do WhatsApp (pushName).",
    'Ignore prefixos de departamento/setor no pushName ou na dica (ex: "RH Samrello" -> "Samrello", "Compras Alfa" -> "Alfa").',
    "Se não houver correspondência clara, retorne null em matchedCompanyId.",
    'Responda EXCLUSIVAMENTE com JSON válido: { "matchedCompanyId": string | null }',
    "",
    `Nome/Perfil do WhatsApp (pushName): ${JSON.stringify(params.pushName ?? null)}`,
    `Solicitante: ${JSON.stringify(params.requesterName)}`,
    `Dica de empresa: ${JSON.stringify(params.companyHint)}`,
    `Mensagem: ${JSON.stringify(params.text)}`,
    `Candidatas: ${JSON.stringify(topCandidates)}`,
  ].join("\n");

  try {
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
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              matchedCompanyId: { type: "STRING", nullable: true },
            },
            required: ["matchedCompanyId"],
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
    if (!isRecord(parsed) || typeof parsed.matchedCompanyId !== "string") {
      return null;
    }

    const matchedId = parsed.matchedCompanyId.trim();
    return validIds.has(matchedId) ? matchedId : null;
  } catch {
    return null;
  }
}

export async function extractOrderFromAudioWithGemini(params: {
  audioBase64: string;
  mimeType: string;
  fallbackSenderName?: string;
}): Promise<(ExtractedOrderData & { transcript: string }) | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || !params.audioBase64.trim()) return null;

  const cleanBase64 = params.audioBase64
    .trim()
    .replace(/^data:[^;]+;base64,/i, "");
  const cleanMimeType =
    params.mimeType.split(";")[0]?.trim() || "audio/ogg";

  const prompt = [
    "Você recebeu um áudio de WhatsApp em português de um cliente/fornecedor da empresa de reciclagem Schifter Coletas.",
    "1. Transcreva fielmente o áudio no campo \"transcript\".",
    "2. Analise se é um pedido real de coleta, troca, agendamento, retirada ou envio de caixas/caçambas/tambores/resíduos.",
    "Regras obrigatórias:",
    '- Saudações ou mensagens curtas sem intenção clara de pedido ("Oi", "Olá", "Bom dia", "Ok", "Tudo bem?", "Obrigado") DEVEM retornar "isOrderRequest": false e "needsClarification": false.',
    '- Mensagens não-saudação que forem ambíguas/incompletas ou dúvidas para a equipe DEVEM retornar "isOrderRequest": false e "needsClarification": true.',
    '- Para pedidos claros, retorne "needsClarification": false.',
    '- Abreviações faladas ou equivalentes: tambor/bombona => "TAMBOR", caixa/caçamba => "CAIXA_CACAMBA".',
    '- Se o áudio pedir múltiplos tipos de recipientes (ex: "1 caixa e 5 tambores"), inclua cada um como item separado no array "items" e mantenha actionType, containerType e quantity iguais ao primeiro item.',
    '- Ao identificar companyHint a partir do áudio ou do Nome/Perfil do WhatsApp (pushName), remova prefixos de setor (ex: "RH Samrello" -> "Samrello", "Compras Alfa" -> "Alfa").',
    `Nome/Perfil do WhatsApp (pushName): ${params.fallbackSenderName?.trim() || "não informado"}`,
    "Responda EXCLUSIVAMENTE em JSON válido.",
  ].join("\n");

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: cleanMimeType,
                  data: cleanBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              transcript: { type: "STRING" },
              isOrderRequest: { type: "BOOLEAN" },
              needsClarification: { type: "BOOLEAN" },
              requesterName: { type: "STRING" },
              companyHint: { type: "STRING", nullable: true },
              actionType: { type: "STRING", enum: ["TROCA", "COLETA"] },
              containerType: {
                type: "STRING",
                enum: ["CAIXA_CACAMBA", "TAMBOR"],
              },
              quantity: { type: "INTEGER" },
              items: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    actionType: { type: "STRING", enum: ["TROCA", "COLETA"] },
                    containerType: {
                      type: "STRING",
                      enum: ["CAIXA_CACAMBA", "TAMBOR"],
                    },
                    quantity: { type: "INTEGER" },
                  },
                  required: ["actionType", "containerType", "quantity"],
                },
              },
            },
            required: [
              "transcript",
              "isOrderRequest",
              "needsClarification",
              "requesterName",
              "companyHint",
              "actionType",
              "containerType",
              "quantity",
              "items",
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
    if (!isRecord(parsed)) return null;

    const transcript =
      typeof parsed.transcript === "string" ? parsed.transcript.trim() : "";

    const sanitized = sanitizeExtractedData(
      parsed,
      transcript,
      params.fallbackSenderName
    );
    if (!sanitized) return null;

    return {
      ...sanitized,
      transcript,
    };
  } catch {
    return null;
  }
}
