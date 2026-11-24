import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { onNewOrder } from "@/lib/order-events";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(
    request.nextUrl.searchParams.get("token") ?? undefined
  );

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let pingInterval: ReturnType<typeof setInterval> | null = null;
      let unsubscribe: (() => void) | null = null;

      cleanup = () => {
        if (closed) return;
        closed = true;

        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }

        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }

        try {
          controller.close();
        } catch {
          // Controller may already be closed
        }
      };

      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup?.();
        }
      };

      safeEnqueue(": connected\n\n");

      unsubscribe = onNewOrder((order) => {
        safeEnqueue(`event: new-order\ndata: ${JSON.stringify(order)}\n\n`);
      });

      pingInterval = setInterval(() => {
        safeEnqueue(": ping\n\n");
      }, 25_000);

      request.signal.addEventListener("abort", () => {
        cleanup?.();
      });
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
