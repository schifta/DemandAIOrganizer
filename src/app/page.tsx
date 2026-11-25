"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Calendar,
  ClipboardList,
  Clock,
  Loader2,
  MessageCircle,
  RefreshCw,
  Truck,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { OrderQueue, OrderUpdatePayload } from "@/components/OrderQueue";
import { RegistrationRequestsPanel } from "@/components/RegistrationRequestsPanel";
import { WebhookSimulator } from "@/components/WebhookSimulator";
import {
  NotificationToast,
  ToastItem,
} from "@/components/NotificationToast";
import { usePreferences } from "@/components/ThemeProvider";
import {
  authFetch,
  clearSession,
  getStoredToken,
  getStoredUser,
} from "@/lib/client-auth";
import { playNotificationSound } from "@/lib/notification-sound";
import {
  AuthUser,
  CompanyItem,
  OrderItem,
  OrderStatus,
} from "@/types";

type FilterOption =
  | "PENDENTE"
  | "AGENDADAS"
  | "EM_ROTA"
  | "CONCLUIDO"
  | "ALL"
  | "REVIEW";

const FILTER_PILLS: { id: FilterOption; label: string }[] = [
  { id: "PENDENTE", label: "Pendentes" },
  { id: "AGENDADAS", label: "Agendadas" },
  { id: "EM_ROTA", label: "Em Rota" },
  { id: "CONCLUIDO", label: "Concluídas (5 dias)" },
  { id: "ALL", label: "Todas" },
  { id: "REVIEW", label: "Revisão" },
];

export default function DashboardPage() {
  const router = useRouter();
  const { soundEnabled } = usePreferences();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterOption>("PENDENTE");
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const dismissToast = useCallback((id: string) => {
    const existingTimer = toastTimersRef.current.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleIncomingOrder = useCallback(
    (newOrder: OrderItem) => {
      if (knownOrderIdsRef.current.has(newOrder.id)) {
        return;
      }
      knownOrderIdsRef.current.add(newOrder.id);

      setOrders((prev) => {
        if (prev.some((o) => o.id === newOrder.id)) {
          return prev;
        }
        return [...prev, newOrder].sort(
          (a, b) => a.priorityOrder - b.priorityOrder
        );
      });

      const summary = `${newOrder.company?.name ?? newOrder.requesterName} — ${
        newOrder.actionType === "TROCA" ? "Troca" : "Coleta"
      } de ${newOrder.quantity} ${
        newOrder.containerType === "TAMBOR" ? "Tambor(es)" : "Caixa(s)"
      }`;

      const toast: ToastItem = {
        id: newOrder.id,
        title: "Novo pedido recebido",
        message: summary,
        createdAt: Date.now(),
      };

      setToasts((prev) => [...prev, toast]);

      const timer = setTimeout(() => {
        toastTimersRef.current.delete(newOrder.id);
        setToasts((prev) => prev.filter((t) => t.id !== newOrder.id));
      }, 7000);
      toastTimersRef.current.set(newOrder.id, timer);

      if (soundEnabledRef.current) {
        playNotificationSound();
      }

      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          new Notification("Novo pedido — EcoColetas", { body: summary });
        } catch {
          // Ignore browser notification errors
        }
      }
    },
    []
  );

  const isAdmin = user?.role === "ADMIN_MASTER" || user?.role === "ADMIN";

  const fetchDashboardData = useCallback(
    async () => {
      const [ordersRes, companiesRes] = await Promise.all([
        authFetch("/api/orders"),
        authFetch("/api/companies"),
      ]);

      if (ordersRes.status === 401 || companiesRes.status === 401) {
        clearSession();
        router.push("/login");
        return;
      }

      if (!ordersRes.ok) {
        throw new Error("Falha ao carregar pedidos");
      }
      if (!companiesRes.ok) {
        throw new Error("Falha ao carregar empresas");
      }

      const ordersData = (await ordersRes.json()) as { orders: OrderItem[] };
      const companiesData = (await companiesRes.json()) as {
        companies: CompanyItem[];
      };

      knownOrderIdsRef.current = new Set(ordersData.orders.map((o) => o.id));
      setOrders(ordersData.orders);
      setCompanies(companiesData.companies);
    },
    [router]
  );

  useEffect(() => {
    let active = true;

    async function init() {
      const storedUser = getStoredUser();
      if (storedUser) {
        setUser(storedUser);
      }

      try {
        const meRes = await authFetch("/api/auth/me");
        if (meRes.status === 401 || !meRes.ok) {
          clearSession();
          router.push("/login");
          return;
        }
        const meData = (await meRes.json()) as { user: AuthUser };
        if (!active) return;

        setUser(meData.user);
        await fetchDashboardData();

        if (
          typeof window !== "undefined" &&
          "Notification" in window &&
          Notification.permission === "default"
        ) {
          void Notification.requestPermission().catch(() => {});
        }
      } catch {
        if (active) {
          setError("Não foi possível carregar os dados do painel.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    init();
    return () => {
      active = false;
    };
  }, [fetchDashboardData, router]);

  useEffect(() => {
    if (!user) return;

    const token = getStoredToken();
    const streamUrl = token
      ? `/api/orders/stream?token=${encodeURIComponent(token)}`
      : "/api/orders/stream";

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(streamUrl);
      eventSource.addEventListener("new-order", (event: MessageEvent) => {
        try {
          const newOrder = JSON.parse(event.data) as OrderItem;
          handleIncomingOrder(newOrder);
        } catch {
          // Ignore malformed SSE payload
        }
      });
    } catch {
      // Ignore EventSource initialization error; fallback poll remains active
    }

    const pollInterval = setInterval(async () => {
      try {
        const res = await authFetch("/api/orders");
        if (res.status === 401) {
          clearSession();
          router.push("/login");
          return;
        }
        if (!res.ok) return;

        const data = (await res.json()) as { orders: OrderItem[] };
        for (const order of data.orders) {
          if (!knownOrderIdsRef.current.has(order.id)) {
            handleIncomingOrder(order);
          }
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 8000);

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      clearInterval(pollInterval);
    };
  }, [user, handleIncomingOrder, router]);

  async function handleRefresh() {
    if (!user) return;
    setRefreshing(true);
    setError(null);
    try {
      await fetchDashboardData();
    } catch {
      setError("Erro ao atualizar os dados da fila.");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleStatusChange(orderId: string, status: OrderStatus) {
    setError(null);
    const previous = orders;
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status } : o))
    );

    const res = await authFetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      setOrders(previous);
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "Erro ao atualizar status do pedido.");
      return;
    }

    const data = (await res.json()) as { order: OrderItem };
    setOrders((prev) => prev.map((o) => (o.id === orderId ? data.order : o)));
  }

  async function handleUpdateOrder(
    orderId: string,
    updates: OrderUpdatePayload
  ) {
    setError(null);
    const res = await authFetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "Erro ao salvar dados da coleta.");
      return;
    }

    const data = (await res.json()) as { order: OrderItem };
    setOrders((prev) => prev.map((o) => (o.id === orderId ? data.order : o)));
  }

  async function handleLinkCompany(orderId: string, companyId: string) {
    setError(null);
    const res = await authFetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, needsReview: false }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "Erro ao vincular empresa ao pedido.");
      return;
    }

    const data = (await res.json()) as { order: OrderItem };
    setOrders((prev) => prev.map((o) => (o.id === orderId ? data.order : o)));
  }

  async function handleDeleteOrder(orderId: string) {
    setError(null);
    const previous = orders;
    setOrders((prev) => prev.filter((o) => o.id !== orderId));

    const res = await authFetch(`/api/orders/${orderId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      setOrders(previous);
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "Erro ao excluir pedido.");
    }
  }

  async function persistReorder(reordered: OrderItem[], fallback: OrderItem[]) {
    const withUpdatedPriority = reordered.map((o, idx) => ({
      ...o,
      priorityOrder: idx + 1,
    }));
    setOrders(withUpdatedPriority);

    try {
      const res = await authFetch("/api/orders/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderedIds: withUpdatedPriority.map((o) => o.id),
        }),
      });

      if (!res.ok) {
        setOrders(fallback);
        setError("Não foi possível salvar a nova ordem de prioridade.");
      }
    } catch {
      setOrders(fallback);
      setError("Erro de conexão ao reordenar pedidos.");
    }
  }

  const filteredOrders = useMemo(() => {
    switch (filter) {
      case "PENDENTE":
        return orders.filter((o) => o.status === "PENDENTE");
      case "AGENDADAS":
        return orders.filter(
          (o) =>
            o.scheduledDate !== null &&
            o.status !== "CONCLUIDO" &&
            o.status !== "CANCELADO"
        );
      case "EM_ROTA":
        return orders.filter((o) => o.status === "EM_ROTA");
      case "CONCLUIDO":
        return orders.filter((o) => o.status === "CONCLUIDO");
      case "REVIEW":
        return orders.filter((o) => o.needsReview || !o.company);
      default:
        return orders;
    }
  }, [orders, filter]);

  function handleMoveOrder(orderId: string, direction: "up" | "down") {
    const visibleIndex = filteredOrders.findIndex((o) => o.id === orderId);
    if (visibleIndex === -1) return;

    const targetVisibleIndex =
      direction === "up" ? visibleIndex - 1 : visibleIndex + 1;
    if (
      targetVisibleIndex < 0 ||
      targetVisibleIndex >= filteredOrders.length
    ) {
      return;
    }

    const targetId = filteredOrders[targetVisibleIndex].id;
    const fromFull = orders.findIndex((o) => o.id === orderId);
    const toFull = orders.findIndex((o) => o.id === targetId);
    if (fromFull === -1 || toFull === -1) return;

    const next = [...orders];
    const [moved] = next.splice(fromFull, 1);
    next.splice(toFull, 0, moved);
    void persistReorder(next, orders);
  }

  function handleDropReorder(draggedId: string, targetId: string) {
    const fromIndex = orders.findIndex((o) => o.id === draggedId);
    const toIndex = orders.findIndex((o) => o.id === targetId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

    const next = [...orders];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    void persistReorder(next, orders);
  }

  const stats = useMemo(() => {
    return {
      total: orders.length,
      pending: orders.filter((o) => o.status === "PENDENTE").length,
      scheduled: orders.filter(
        (o) =>
          o.scheduledDate !== null &&
          o.status !== "CONCLUIDO" &&
          o.status !== "CANCELADO"
      ).length,
      inRoute: orders.filter((o) => o.status === "EM_ROTA").length,
      review: orders.filter((o) => o.needsReview || !o.company).length,
    };
  }, [orders]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--color-bg-main)]">
        <Loader2
          className="h-8 w-8 animate-spin text-[#B91C1C]"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-[var(--color-text-muted)]">
          Carregando painel EcoColetas...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-main)]">
      <Navbar user={user} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Error Banner */}
        {error && (
          <div
            role="alert"
            className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#991B1B] dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs font-semibold underline hover:no-underline"
            >
              Dispensar
            </button>
          </div>
        )}

        {/* Summary Cards */}
        <section
          aria-label="Resumo operacional"
          className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
        >
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#B91C1C] dark:text-red-400">
                Pendentes
              </span>
              <Clock className="h-4.5 w-4.5 text-[#B91C1C]" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-bold text-[var(--color-text-main)]">
              {stats.pending}
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Agendadas
              </span>
              <Calendar
                className="h-4.5 w-4.5 text-[#334155] dark:text-slate-400"
                aria-hidden="true"
              />
            </div>
            <p className="mt-2 text-2xl font-bold text-[var(--color-text-main)]">
              {stats.scheduled}
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">
                Em Rota
              </span>
              <Truck className="h-4.5 w-4.5 text-sky-500" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-bold text-[var(--color-text-main)]">
              {stats.inRoute}
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                Para Revisar
              </span>
              <AlertTriangle
                className="h-4.5 w-4.5 text-amber-500"
                aria-hidden="true"
              />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <p className="text-2xl font-bold text-[var(--color-text-main)]">
                {stats.review}
              </p>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-text-muted)]">
                <ClipboardList className="h-3 w-3" aria-hidden="true" />
                {stats.total} total
              </span>
            </div>
          </div>
        </section>

        {/* Main Content Grid */}
        <div
          className={`grid grid-cols-1 gap-6 ${
            isAdmin ? "xl:grid-cols-12" : ""
          }`}
        >
          {/* Queue Column */}
          <div className={isAdmin ? "xl:col-span-8" : ""}>
            {/* Toolbar: Filters + Actions */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label="Filtrar pedidos por status"
              >
                {FILTER_PILLS.map((pill) => {
                  const active = filter === pill.id;
                  const isPendingTab = pill.id === "PENDENTE";
                  return (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setFilter(pill.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                        active
                          ? "bg-[#B91C1C] text-white shadow-xs"
                          : "border border-[var(--color-border)] bg-[var(--color-surface-card)] text-[var(--color-text-muted)] hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span>{pill.label}</span>
                      {isPendingTab && (
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[11px] font-bold ${
                            active
                              ? "bg-white text-[#B91C1C]"
                              : "bg-[#B91C1C] text-white"
                          }`}
                        >
                          {stats.pending}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-card)] px-3 py-2 text-xs font-semibold text-[var(--color-text-main)] shadow-2xs hover:bg-slate-50 disabled:opacity-60 dark:hover:bg-slate-800"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  <span>Atualizar</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSimulatorOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#B91C1C] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#991B1B]"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  <span>Simular WhatsApp</span>
                </button>
              </div>
            </div>

            {isAdmin && (
              <p className="mb-3 text-xs text-[var(--color-text-muted)]">
                Dica: toque em um card para agendar ou registrar a coleta.
                Arraste os cards ou use as setas ↑ / ↓ para definir a
                prioridade.
              </p>
            )}

            <OrderQueue
              orders={filteredOrders}
              companies={companies}
              user={user}
              onStatusChange={handleStatusChange}
              onUpdateOrder={handleUpdateOrder}
              onLinkCompany={handleLinkCompany}
              onDeleteOrder={handleDeleteOrder}
              onMoveOrder={handleMoveOrder}
              onDropReorder={handleDropReorder}
            />
          </div>

          {/* Admin Sidebar */}
          {isAdmin && (
            <aside className="space-y-6 xl:col-span-4">
              <RegistrationRequestsPanel />
            </aside>
          )}
        </div>
      </main>

      <WebhookSimulator
        isOpen={simulatorOpen}
        onClose={() => setSimulatorOpen(false)}
        onOrderCreated={async () => {
          if (user) {
            await fetchDashboardData();
          }
        }}
      />

      <NotificationToast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
