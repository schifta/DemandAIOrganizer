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
  CheckCircle2,
  ClipboardList,
  Clock,
  Loader2,
  RefreshCw,
  Search,
  Truck,
  X,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { OrderQueue, OrderUpdatePayload } from "@/components/OrderQueue";
import { TeamHoverDrawer } from "@/components/TeamHoverDrawer";
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
  | "HOJE"
  | "ATRASADOS"
  | "AGENDADAS"
  | "CONCLUIDO"
  | "TODOS"
  | "REVISAO";

const FILTER_STORAGE_KEY = "eco_active_filter";

const VALID_FILTERS: FilterOption[] = [
  "PENDENTE",
  "HOJE",
  "ATRASADOS",
  "AGENDADAS",
  "CONCLUIDO",
  "TODOS",
  "REVISAO",
];

function getLocalTodayYmd(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getOrderScheduledYmd(iso: string | null): string {
  if (!iso) return "";
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

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
  const [searchQuery, setSearchQuery] = useState("");
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Productivity & selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchTruck, setBatchTruck] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const isAdmin = user?.role === "ADMIN_MASTER" || user?.role === "ADMIN";
  const todayStr = getLocalTodayYmd();

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

  // Restore saved filter from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY) as FilterOption | null;
      if (saved && VALID_FILTERS.includes(saved)) {
        setFilter(saved);
      }
    } catch {
      // Ignore storage access errors
    }
  }, []);

  // Guard REVISAO filter for non-admins
  useEffect(() => {
    if (user && !isAdmin && filter === "REVISAO") {
      setFilter("PENDENTE");
    }
  }, [user, isAdmin, filter]);

  function handleSelectFilter(nextFilter: FilterOption) {
    setFilter(nextFilter);
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, nextFilter);
    } catch {
      // Ignore storage access errors
    }
  }

  const dismissToast = useCallback((id: string) => {
    const existingTimer = toastTimersRef.current.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (
      toast: Omit<ToastItem, "createdAt">,
      durationMs = 5000
    ) => {
      const existingTimer = toastTimersRef.current.get(toast.id);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const fullToast: ToastItem = {
        ...toast,
        createdAt: Date.now(),
      };

      setToasts((prev) => [
        ...prev.filter((t) => t.id !== toast.id),
        fullToast,
      ]);

      const timer = setTimeout(() => {
        toastTimersRef.current.delete(toast.id);
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, durationMs);
      toastTimersRef.current.set(toast.id, timer);
    },
    []
  );

  const handleIncomingOrder = useCallback(
    (newOrder: OrderItem) => {
      if (!isAdmin && newOrder.needsReview) {
        return;
      }
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

      showToast(
        {
          id: newOrder.id,
          title: "Novo pedido recebido",
          message: summary,
        },
        7000
      );

      if (soundEnabledRef.current) {
        playNotificationSound();
      }

      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          new Notification("Novo pedido — Schifter Coletas", { body: summary });
        } catch {
          // Ignore browser notification errors
        }
      }
    },
    [showToast]
  );

  const fetchDashboardData = useCallback(async () => {
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
  }, [router]);

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

  const handleCompleteWithUndo = useCallback(
    async (order: OrderItem) => {
      if (order.status === "CONCLUIDO") return;
      setError(null);
      const previousStatus = order.status;

      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id ? { ...o, status: "CONCLUIDO" } : o
        )
      );

      const res = await authFetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONCLUIDO" }),
      });

      if (!res.ok) {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id ? { ...o, status: previousStatus } : o
          )
        );
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Erro ao concluir pedido.");
        return;
      }

      const data = (await res.json()) as { order: OrderItem };
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? data.order : o))
      );

      showToast(
        {
          id: `undo-complete-${order.id}`,
          title: "Pedido concluído · Desfazer",
          message: `#${order.priorityOrder} — ${
            order.company?.name ?? order.requesterName
          }`,
          actionLabel: "Desfazer",
          onAction: () => {
            void (async () => {
              const undoRes = await authFetch(`/api/orders/${order.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: previousStatus }),
              });
              if (undoRes.ok) {
                const undoData = (await undoRes.json()) as { order: OrderItem };
                setOrders((prev) =>
                  prev.map((o) => (o.id === order.id ? undoData.order : o))
                );
              }
            })();
          },
        },
        5000
      );
    },
    [showToast]
  );

  const handleDeleteWithUndo = useCallback(
    async (order: OrderItem) => {
      setError(null);
      const previous = orders;
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      setSelectedIds((prev) => prev.filter((id) => id !== order.id));

      const res = await authFetch(`/api/orders/${order.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        setOrders(previous);
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Erro ao excluir pedido.");
        return;
      }

      showToast(
        {
          id: `undo-delete-${order.id}`,
          title: "Pedido excluído · Desfazer",
          message: `#${order.priorityOrder} — ${
            order.company?.name ?? order.requesterName
          }`,
          actionLabel: "Desfazer",
          onAction: () => {
            void (async () => {
              const restoreRes = await authFetch(`/api/orders/${order.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ restore: true }),
              });
              if (restoreRes.ok) {
                await fetchDashboardData();
              }
            })();
          },
        },
        5000
      );
    },
    [orders, showToast, fetchDashboardData]
  );

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

  const knownTrucks = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) {
      if (o.truckUsed && o.truckUsed.trim()) {
        set.add(o.truckUsed.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const byTab = orders.filter((o) => {
      const schedYmd = getOrderScheduledYmd(o.scheduledDate);
      switch (filter) {
        case "PENDENTE":
          return o.status === "PENDENTE" && !o.needsReview;
        case "HOJE":
          return schedYmd === todayStr && o.status !== "CANCELADO" && !o.needsReview;
        case "ATRASADOS":
          return (
            o.status === "PENDENTE" &&
            !o.needsReview &&
            Boolean(schedYmd) &&
            schedYmd < todayStr
          );
        case "AGENDADAS":
          return (
            o.scheduledDate !== null &&
            !o.needsReview &&
            o.status !== "CONCLUIDO" &&
            o.status !== "CANCELADO"
          );
        case "CONCLUIDO":
          return o.status === "CONCLUIDO";
        case "REVISAO":
          return isAdmin ? o.needsReview || !o.company : false;
        case "TODOS":
        default:
          return true;
      }
    });

    const q = searchQuery.trim().toLowerCase();
    if (!q) return byTab;

    return byTab.filter((o) => {
      const companyName = o.company?.name?.toLowerCase() ?? "";
      const fallbackNote = o.companyFallbackNote?.toLowerCase() ?? "";
      const requester = o.requesterName.toLowerCase();
      const phone = o.requesterPhone?.toLowerCase() ?? "";
      const raw = o.rawMessage.toLowerCase();
      const truck = o.truckUsed?.toLowerCase() ?? "";
      return (
        companyName.includes(q) ||
        fallbackNote.includes(q) ||
        requester.includes(q) ||
        phone.includes(q) ||
        raw.includes(q) ||
        truck.includes(q)
      );
    });
  }, [orders, filter, searchQuery, todayStr, isAdmin]);

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

  function handleToggleSelect(orderId: string) {
    setSelectedIds((prev) =>
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId]
    );
  }

  async function handleBatchAction(action: "COMPLETE" | "ASSIGN_TRUCK") {
    if (selectedIds.length === 0) return;
    if (action === "ASSIGN_TRUCK" && !batchTruck.trim()) {
      setError("Informe o caminhão para atribuir aos pedidos selecionados.");
      return;
    }

    setBatchBusy(true);
    setError(null);
    try {
      const res = await authFetch("/api/orders/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: selectedIds,
          action,
          truckUsed: action === "ASSIGN_TRUCK" ? batchTruck.trim() : undefined,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        count?: number;
      };

      if (!res.ok) {
        setError(data.error || "Erro ao executar ação em lote.");
        return;
      }

      setSelectedIds([]);
      if (action === "ASSIGN_TRUCK") {
        setBatchTruck("");
      }
      await fetchDashboardData();

      showToast(
        {
          id: `batch-${Date.now()}`,
          title:
            action === "COMPLETE"
              ? "Pedidos concluídos em lote"
              : "Caminhão atribuído em lote",
          message: `${data.count ?? selectedIds.length} pedido(s) atualizado(s).`,
        },
        4000
      );
    } catch {
      setError("Erro de conexão ao processar ação em lote.");
    } finally {
      setBatchBusy(false);
    }
  }

  async function handleCopyTodayRoute() {
    const todayOrders = orders.filter((o) => {
      if (o.status === "CONCLUIDO" || o.status === "CANCELADO") return false;
      const schedYmd = getOrderScheduledYmd(o.scheduledDate);
      return schedYmd === todayStr || o.status === "PENDENTE";
    });

    if (todayOrders.length === 0) {
      showToast(
        {
          id: `route-empty-${Date.now()}`,
          title: "Rota do dia",
          message: "Nenhum pedido pendente ou agendado para hoje.",
        },
        3500
      );
      return;
    }

    const lines = todayOrders.map((o, idx) => {
      const companyName =
        o.company?.name ?? o.companyFallbackNote ?? o.requesterName;
      const address = o.company?.address ? ` (${o.company.address})` : "";
      const container =
        o.containerType === "TAMBOR" ? "Tambor" : "Caixa/Caçamba";
      return `${idx + 1}. ${companyName}${address} — ${o.actionType} ${o.quantity}x ${container}`;
    });

    const text = `Rota do dia (${todayStr.split("-").reverse().join("/")}) — Schifter Coletas:\n${lines.join("\n")}`;

    try {
      await navigator.clipboard.writeText(text);
      showToast(
        {
          id: `route-copied-${Date.now()}`,
          title: "Rota copiada!",
          message: `${todayOrders.length} parada(s) copiada(s) para a área de transferência.`,
        },
        4000
      );
    } catch {
      setError("Não foi possível copiar a rota para a área de transferência.");
    }
  }

  async function handleExportCsv() {
    setError(null);
    try {
      const res = await authFetch("/api/orders/export-csv");
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Erro ao exportar CSV.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "coletas-concluidas.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Erro de conexão ao exportar CSV.");
    }
  }

  const stats = useMemo(() => {
    const overdue = orders.filter((o) => {
      if (o.status !== "PENDENTE") return false;
      const schedYmd = getOrderScheduledYmd(o.scheduledDate);
      return Boolean(schedYmd) && schedYmd < todayStr;
    }).length;

    const today = orders.filter((o) => {
      if (o.status === "CANCELADO") return false;
      return getOrderScheduledYmd(o.scheduledDate) === todayStr;
    }).length;

    return {
      total: orders.length,
      pending: orders.filter((o) => o.status === "PENDENTE" && !o.needsReview).length,
      today,
      overdue,
      scheduled: orders.filter(
        (o) =>
          o.scheduledDate !== null &&
          !o.needsReview &&
          o.status !== "CONCLUIDO" &&
          o.status !== "CANCELADO"
      ).length,
      review: orders.filter((o) => o.needsReview || !o.company).length,
    };
  }, [orders, todayStr]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--color-bg-main)]">
        <Loader2
          className="h-8 w-8 animate-spin text-[#B91C1C]"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-[var(--color-text-muted)]">
          Carregando painel Schifter Coletas...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-main)]">
      <Navbar
        user={user}
        onCopyDailyRoute={isAdmin ? handleCopyTodayRoute : undefined}
        onExportCsv={isAdmin ? handleExportCsv : undefined}
      />

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

        {/* Summary Cards as Single Clickable Filters (Desktop only so mobile goes straight to orders) */}
        <section
          aria-label="Resumo operacional"
          className={`mb-6 hidden gap-3 sm:gap-4 md:grid ${
            isAdmin ? "md:grid-cols-4" : "md:grid-cols-3"
          }`}
        >
          <button
            type="button"
            onClick={() => handleSelectFilter("PENDENTE")}
            aria-pressed={filter === "PENDENTE"}
            className={`rounded-2xl border bg-[var(--color-surface-card)] p-4 text-left shadow-xs transition-all hover:border-slate-300 dark:hover:border-slate-600 ${
              filter === "PENDENTE"
                ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]"
                : "border-[var(--color-border)]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#B91C1C] dark:text-red-400">
                Pendentes
              </span>
              <Clock className="h-4.5 w-4.5 text-[#B91C1C]" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-bold text-[var(--color-text-main)]">
              {stats.pending}
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleSelectFilter("AGENDADAS")}
            aria-pressed={filter === "AGENDADAS"}
            className={`rounded-2xl border bg-[var(--color-surface-card)] p-4 text-left shadow-xs transition-all hover:border-slate-300 dark:hover:border-slate-600 ${
              filter === "AGENDADAS"
                ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]"
                : "border-[var(--color-border)]"
            }`}
          >
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
          </button>

          <button
            type="button"
            onClick={() => handleSelectFilter("ATRASADOS")}
            aria-pressed={filter === "ATRASADOS"}
            className={`rounded-2xl border bg-[var(--color-surface-card)] p-4 text-left shadow-xs transition-all hover:border-slate-300 dark:hover:border-slate-600 ${
              filter === "ATRASADOS"
                ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]"
                : "border-[var(--color-border)]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                Atrasados
              </span>
              <AlertTriangle
                className="h-4.5 w-4.5 text-red-600 dark:text-red-400"
                aria-hidden="true"
              />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <p className="text-2xl font-bold text-[var(--color-text-main)]">
                {stats.overdue}
              </p>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-text-muted)]">
                <ClipboardList className="h-3 w-3" aria-hidden="true" />
                {stats.total} total
              </span>
            </div>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => handleSelectFilter("REVISAO")}
              aria-pressed={filter === "REVISAO"}
              className={`rounded-2xl border bg-[var(--color-surface-card)] p-4 text-left shadow-xs transition-all hover:border-slate-300 dark:hover:border-slate-600 ${
                filter === "REVISAO"
                  ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]"
                  : "border-[var(--color-border)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  Para revisar
                </span>
                <AlertTriangle
                  className="h-4.5 w-4.5 text-amber-500"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-2 text-2xl font-bold text-[var(--color-text-main)]">
                {stats.review}
              </p>
            </button>
          )}
        </section>

        {/* Main Content */}
        <div>
          {/* Queue Column */}
          <div>
            {/* Search Bar + Quick Refresh */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
                  aria-hidden="true"
                />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar empresa, solicitante, telefone ou mensagem..."
                  aria-label="Buscar pedidos"
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-card)] py-2.5 pr-9 pl-10 text-sm text-[var(--color-text-main)] placeholder:text-slate-400 focus:border-[var(--color-primary)] focus:outline-none dark:placeholder:text-slate-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Limpar busca"
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-[var(--color-text-muted)] hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-card)] px-3 py-2.5 text-xs font-semibold text-[var(--color-text-main)] shadow-2xs hover:bg-slate-50 disabled:opacity-60 dark:hover:bg-slate-800"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                <span>Atualizar</span>
              </button>
            </div>

            {/* Batch Selection Bar (Admin) */}
            {isAdmin && selectedIds.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#B91C1C]/30 bg-[#B91C1C]/5 px-3.5 py-2.5 dark:border-red-900/70 dark:bg-red-950/35">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#B91C1C] dark:text-red-300">
                    {selectedIds.length} selecionado(s)
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    className="text-xs font-medium text-[var(--color-text-muted)] underline hover:no-underline"
                  >
                    Limpar seleção
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    list="truck-suggestions"
                    value={batchTruck}
                    onChange={(e) => setBatchTruck(e.target.value)}
                    placeholder="Caminhão..."
                    aria-label="Caminhão para atribuir em lote"
                    className="w-40 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2.5 py-1.5 text-xs text-[var(--color-text-main)] focus:border-[var(--color-primary)] focus:outline-none dark:bg-[#090D16]"
                  />
                  <button
                    type="button"
                    disabled={batchBusy}
                    onClick={() => void handleBatchAction("ASSIGN_TRUCK")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E293B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-[#090D16] dark:hover:bg-slate-200"
                  >
                    <Truck className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Atribuir Caminhão</span>
                  </button>

                  <button
                    type="button"
                    disabled={batchBusy}
                    onClick={() => void handleBatchAction("COMPLETE")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#15803D] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#166534] disabled:opacity-50"
                  >
                    <CheckCircle2
                      className="h-3.5 w-3.5"
                      aria-hidden="true"
                    />
                    <span>Concluir Selecionados</span>
                  </button>
                </div>
              </div>
            )}

            <OrderQueue
              orders={filteredOrders}
              companies={companies}
              user={user}
              knownTrucks={knownTrucks}
              selectedIds={selectedIds}
              focusedOrderId={null}
              expandedOrderId={expandedOrderId}
              onToggleExpand={setExpandedOrderId}
              onToggleSelect={handleToggleSelect}
              onStatusChange={handleStatusChange}
              onUpdateOrder={handleUpdateOrder}
              onLinkCompany={handleLinkCompany}
              onCompleteWithUndo={handleCompleteWithUndo}
              onDeleteWithUndo={handleDeleteWithUndo}
              onMoveOrder={handleMoveOrder}
              onDropReorder={handleDropReorder}
            />
          </div>
        </div>
      </main>

      {isAdmin && <TeamHoverDrawer />}
      <NotificationToast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
