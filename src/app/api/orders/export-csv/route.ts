import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDateBr(date: Date | null): string {
  if (!date) {
    return "";
  }
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from")?.trim() || "";
    const toParam = searchParams.get("to")?.trim() || "";

    if (fromParam && !DATE_REGEX.test(fromParam)) {
      return NextResponse.json(
        { error: "Parâmetro 'from' inválido. Use YYYY-MM-DD." },
        { status: 400 }
      );
    }

    if (toParam && !DATE_REGEX.test(toParam)) {
      return NextResponse.json(
        { error: "Parâmetro 'to' inválido. Use YYYY-MM-DD." },
        { status: 400 }
      );
    }

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (fromParam) {
      dateFilter.gte = new Date(`${fromParam}T00:00:00-03:00`);
    }
    if (toParam) {
      dateFilter.lte = new Date(`${toParam}T23:59:59.999-03:00`);
    }

    const hasDateFilter = Boolean(fromParam || toParam);

    const orders = await prisma.order.findMany({
      where: {
        deletedAt: null,
        status: "CONCLUIDO",
        ...(hasDateFilter
          ? {
              OR: [
                { completedAt: dateFilter },
                { completedAt: null, updatedAt: dateFilter },
              ],
            }
          : {}),
      },
      orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }],
      include: {
        company: {
          select: { name: true },
        },
      },
    });

    const headers = [
      "ID",
      "Data Conclusão",
      "Empresa",
      "Solicitante",
      "Telefone",
      "Ação",
      "Recipiente",
      "Quantidade",
      "Caminhão",
      "Coletado Por",
      "Observações",
    ];

    const rows = orders.map((order) => [
      order.id,
      formatDateBr(order.completedAt ?? order.updatedAt),
      order.company?.name ?? order.companyFallbackNote ?? "",
      order.requesterName,
      order.requesterPhone ?? "",
      order.actionType,
      order.containerType,
      order.quantity,
      order.truckUsed ?? "",
      order.collectedBy ?? "",
      order.notes ?? "",
    ]);

    const csvLines = [
      headers.map(escapeCsvCell).join(","),
      ...rows.map((row) => row.map(escapeCsvCell).join(",")),
    ];

    const csvContent = `\uFEFF${csvLines.join("\r\n")}`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="coletas-concluidas.csv"',
      },
    });
  } catch (error) {
    console.error("Export CSV error:", error);
    return NextResponse.json(
      { error: "Erro ao exportar CSV" },
      { status: 500 }
    );
  }
}
