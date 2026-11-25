import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_INPUT_PATH = "C:\\Users\\Schifta\\Downloads\\banco!.json";

interface RawPhoneEntry {
  Telefone?: string | null;
}

interface RawAddressEntry {
  Endereço?: string | null;
  "nº"?: string | null;
  Complemento?: string | null;
  Bairro?: string | null;
  Cep?: string | null;
  cidade?: string | null;
  estado?: string | null;
}

interface RawCompanyEntry {
  Nome?: string | null;
  Apelido?: string | null;
  "CNPJ/CPF"?: string | null;
  Ativo?: string | null;
  Telefones?: string | RawPhoneEntry[] | null;
  Endereços?: string | RawAddressEntry[] | null;
}

interface MergedCompany {
  name: string;
  nickname: string | null;
  document: string | null;
  address: string | null;
  phones: Set<string>;
}

function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatAddress(entries: RawCompanyEntry["Endereços"]): string | null {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  for (const addr of entries) {
    if (!addr || typeof addr !== "object") {
      continue;
    }
    const street = cleanString(addr["Endereço"]);
    const num = cleanString(addr["nº"]);
    const comp = cleanString(addr.Complemento);
    const neighborhood = cleanString(addr.Bairro);
    const city = cleanString(addr.cidade);
    const state = cleanString(addr.estado);

    if (!street && !neighborhood && !city) {
      continue;
    }

    const streetPart = [street, num].filter(Boolean).join(", ");
    const compPart = comp ? ` - ${comp}` : "";
    const cityState = [city, state].filter(Boolean).join("/");
    const tailPart = [neighborhood, cityState].filter(Boolean).join(", ");

    if (streetPart && tailPart) {
      return `${streetPart}${compPart} - ${tailPart}`;
    }
    return `${streetPart}${compPart}${tailPart}`.trim() || null;
  }

  return null;
}

function extractPhones(entries: RawCompanyEntry["Telefones"]): string[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  const results: string[] = [];
  for (const entry of entries) {
    const raw = cleanString(entry?.Telefone);
    if (!raw) {
      continue;
    }

    const parts = raw.split("/");
    for (const part of parts) {
      let digits = part.replace(/\D/g, "");
      if (!digits || digits.length < 8) {
        continue;
      }
      if (digits.length === 10 || digits.length === 11) {
        digits = `55${digits}`;
      }
      results.push(digits);
    }
  }

  return results;
}

async function main() {
  const inputPath = process.argv[2] || DEFAULT_INPUT_PATH;
  const rawContent = fs.readFileSync(inputPath, "utf-8").replace(/^\uFEFF/, "");
  const items = JSON.parse(rawContent) as RawCompanyEntry[];

  if (!Array.isArray(items)) {
    throw new Error("O arquivo JSON deve conter um array de empresas.");
  }

  const mergedByKey = new Map<string, MergedCompany>();

  for (const item of items) {
    const name = cleanString(item?.Nome);
    if (!name) {
      continue;
    }

    const key = normalizeKey(name);
    const nickname = cleanString(item.Apelido);
    const document = cleanString(item["CNPJ/CPF"]);
    const address = formatAddress(item["Endereços"]);
    const phones = extractPhones(item.Telefones);

    const existing = mergedByKey.get(key);
    if (existing) {
      if (!existing.nickname && nickname) {
        existing.nickname = nickname;
      }
      if (!existing.document && document) {
        existing.document = document;
      }
      if (!existing.address && address) {
        existing.address = address;
      }
      for (const phone of phones) {
        existing.phones.add(phone);
      }
    } else {
      mergedByKey.set(key, {
        name,
        nickname,
        document,
        address,
        phones: new Set(phones),
      });
    }
  }

  const existingCompanies = await prisma.company.findMany();
  const companyMap = new Map(
    existingCompanies.map((company) => [normalizeKey(company.name), company])
  );

  let companyCount = 0;
  let contactCount = 0;
  const seenPhones = new Set<string>();

  for (const [key, item] of mergedByKey.entries()) {
    const existing = companyMap.get(key);
    let companyId: string;

    if (existing) {
      const nextNickname = item.nickname ?? existing.nickname;
      const nextDocument = item.document ?? existing.document;
      const nextAddress = item.address ?? existing.address;

      if (
        nextNickname !== existing.nickname ||
        nextDocument !== existing.document ||
        nextAddress !== existing.address
      ) {
        await prisma.company.update({
          where: { id: existing.id },
          data: {
            nickname: nextNickname,
            document: nextDocument,
            address: nextAddress,
          },
        });
      }
      companyId = existing.id;
    } else {
      const created = await prisma.company.create({
        data: {
          name: item.name,
          nickname: item.nickname,
          document: item.document,
          address: item.address,
        },
      });
      companyMap.set(key, created);
      companyId = created.id;
    }

    companyCount += 1;

    for (const phone of item.phones) {
      if (seenPhones.has(phone)) {
        continue;
      }
      seenPhones.add(phone);

      await prisma.contact.upsert({
        where: { phone },
        update: {
          companyId,
          name: item.name,
        },
        create: {
          phone,
          name: item.name,
          companyId,
        },
      });
      contactCount += 1;
    }
  }

  console.log(
    `Imported/merged ${companyCount} companies and ${contactCount} contacts`
  );
}

main()
  .catch((error) => {
    console.error("Error importing banco:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
