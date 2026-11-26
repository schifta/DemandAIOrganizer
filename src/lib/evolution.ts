function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export async function sendEvolutionText(
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

export async function findAvisosGroupJid(): Promise<string | null> {
  const configuredJid = process.env.EVOLUTION_AVISOS_GROUP_JID?.trim();
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
        ? (json as { data: unknown[] }).data
        : [];

    for (const item of groups) {
      if (typeof item !== "object" || item === null) continue;
      const group = item as { id?: unknown; jid?: unknown; subject?: unknown };
      if (
        typeof group.subject === "string" &&
        normalizeForMatch(group.subject).includes("avisos coletas")
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

export async function notifyAvisosColetas(text: string): Promise<boolean> {
  try {
    const groupJid = await findAvisosGroupJid();
    if (!groupJid) {
      return false;
    }
    return await sendEvolutionText(groupJid, text);
  } catch (error) {
    console.error("notifyAvisosColetas error:", error);
    return false;
  }
}

export async function notifyNewOrderToAvisos(params: {
  companyName: string | null;
  requesterName: string;
  phone: string | null;
  items: Array<{
    actionType: string;
    containerType: string;
    quantity: number;
  }>;
  rawMessage: string;
}): Promise<boolean> {
  const companyLabel = params.companyName?.trim() || "Não identificada";
  const contactLabel =
    params.requesterName && params.requesterName !== "Solicitante WhatsApp"
      ? `${params.requesterName}${params.phone ? ` (${params.phone})` : ""}`
      : params.phone || "Sem identificação";

  const itemsText = params.items
    .map((item) => {
      const actionLabel = item.actionType === "TROCA" ? "Troca" : "Coleta";
      const containerLabel =
        item.containerType === "TAMBOR"
          ? item.quantity === 1
            ? "tambor"
            : "tambores"
          : item.quantity === 1
            ? "caixa/caçamba"
            : "caixas/caçambas";
      return `• ${item.quantity}x ${containerLabel} (${actionLabel})`;
    })
    .join("\n");

  const message = [
    "📥 Novo pedido recebido pelo WhatsApp (aguardando revisão no painel):",
    `Empresa: ${companyLabel}`,
    `Contato: ${contactLabel}`,
    "Itens:",
    itemsText,
    `Mensagem: "${params.rawMessage}"`,
  ].join("\n");

  return notifyAvisosColetas(message);
}

export async function notifyOrderCompletedToAvisos(order: {
  company?: { name: string } | null;
  requesterName: string;
  actionType: string;
  containerType: string;
  quantity: number;
  truckUsed?: string | null;
  collectedBy?: string | null;
}): Promise<boolean> {
  const companyLabel =
    order.company?.name?.trim() || order.requesterName || "Não identificada";
  const actionLabel = order.actionType === "TROCA" ? "Troca" : "Coleta";
  const containerLabel =
    order.containerType === "TAMBOR"
      ? order.quantity === 1
        ? "tambor"
        : "tambores"
      : order.quantity === 1
        ? "caixa/caçamba"
        : "caixas/caçambas";
  const truckLabel = order.truckUsed?.trim() || "Não informado";
  const collectorLabel = order.collectedBy?.trim() || "Não informado";

  const message = [
    "✅ Coleta concluída!",
    `Empresa: ${companyLabel}`,
    `Item: ${order.quantity}x ${containerLabel} (${actionLabel})`,
    `Caminhão: ${truckLabel}`,
    `Concluído por: ${collectorLabel}`,
  ].join("\n");

  return notifyAvisosColetas(message);
}
