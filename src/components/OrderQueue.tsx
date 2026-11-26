"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Box,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cylinder,
  GripVertical,
  History,
  Link2,
  Loader2,
  Lock,
  MessageSquareText,
  Package,
  Phone,
  RefreshCw,
  Save,
  Trash2,
  Truck,
  User,
} from "lucide-react";
import {
  ActionType,
  AuthUser,
  CompanyItem,
  ContainerType,
  OrderEventItem,
  OrderItem,
  OrderStatus,
} from "@/types";
import { authFetch } from "@/lib/client-auth";

export interface OrderUpdatePayload {
  status?: OrderStatus;
  scheduledDate?: string | null;
  truckUsed?: string | null;
  collectedBy?: string | null;
  notes?: string | null;
  companyId?: string | null;
  needsReview?: boolean;
  saveContactPhone?: boolean;
  restore?: boolean;
}

interface OrderQueueProps {
  orders: OrderItem[];
  companies: CompanyItem[];
  user: AuthUser;
  knownTrucks: string[];
  selectedIds: string[];
  focusedOrderId: string | null;
  expandedOrderId: string | null;
  onToggleExpand: (orderId: string | null) => void;
  onToggleSelect: (orderId: string) => void;
  onStatusChange?: (orderId: string, status: OrderStatus) => Promise<void>;
  onUpdateOrder: (orderId: string, updates: OrderUpdatePayload) => Promise<void>;
  onLinkCompany: (orderId: string, companyId: string) => Promise<void>;
  onCompleteWithUndo: (order: OrderItem) => Promise<void>;
  onDeleteWithUndo: (order: OrderItem) => Promise<void>;
  onMoveOrder: (orderId: string, direction: "up" | "down") => void;
  onDropReorder: (draggedId: string, targetId: string) => void;
}

const ACTION_BADGES: Record<
  ActionType,
  { label: string; className: string; icon: React.ReactNode }
> = {
  TROCA: {
    label: "TROCA",
    className:
      "bg-amber-100 text-amber-900 border-amber-400 dark:bg-amber-950/75 dark:text-amber-300 dark:border-amber-700/80",
    icon: <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />,
  },
  COLETA: {
    label: "COLETA",
    className:
      "bg-[#15803D]/15 text-[#15803D] border-[#15803D]/40 dark:bg-green-950/75 dark:text-green-300 dark:border-green-700/80",
    icon: <Truck className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />,
  },
};

const CONTAINER_LABELS: Record<
  ContainerType,
  { label: string; icon: React.ReactNode }
> = {
  CAIXA_CACAMBA: {
    label: "Caixa / Caçamba",
    icon: <Box className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />,
  },
  TAMBOR: {
    label: "Tambor",
    icon: <Cylinder className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />,
  },
};

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatShortDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatShortScheduledDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDateInput(iso: string | null): string {
  if (!iso) return "";
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function formatScheduledBadge(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function toLocalYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayYmd(): string {
  return toLocalYmd(new Date());
}

function getTomorrowYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toLocalYmd(d);
}

function getNextMondayYmd(): string {
  const d = new Date();
  const dayOfWeek = d.getDay(); // 0 = Sun, 1 = Mon, ...
  const daysUntilMonday = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7;
  d.setDate(d.getDate() + daysUntilMonday);
  return toLocalYmd(d);
}

interface OrderDraft {
  scheduledDate: string;
  truckUsed: string;
  collectedBy: string;
  notes: string;
}

export function OrderQueue({
  orders,
  companies,
  user,
  knownTrucks,
  selectedIds,
  focusedOrderId,
  expandedOrderId,
  onToggleExpand,
  onToggleSelect,
  onUpdateOrder,
  onLinkCompany,
  onCompleteWithUndo,
  onDeleteWithUndo,
  onMoveOrder,
  onDropReorder,
}: OrderQueueProps) {
  const isAdmin = user.role === "ADMIN_MASTER" || user.role === "ADMIN";
  const todayStr = getTodayYmd();

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [selectedCompanies, setSelectedCompanies] = useState<
    Record<string, string>
  >({});
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, OrderDraft>>({});

  // Audit history state per order
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const [historyLoading, setHistoryLoading] = useState<Record<string, boolean>>(
    {}
  );
  const [historyEvents, setHistoryEvents] = useState<
    Record<string, OrderEventItem[]>
  >({});

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-card)] p-12 text-center">
        <Package
          className="mb-3 h-10 w-10 text-[var(--color-text-muted)]"
          aria-hidden="true"
        />
        <h3 className="text-base font-semibold text-[var(--color-text-main)]">
          Nenhum pedido encontrado neste filtro
        </h3>
        <p className="mt-1 max-w-sm text-sm text-[var(--color-text-muted)]">
          Novas solicitações recebidas pelo WhatsApp aparecerão aqui em ordem de
          prioridade.
        </p>
      </div>
    );
  }

  function getDraft(order: OrderItem): OrderDraft {
    return (
      drafts[order.id] ?? {
        scheduledDate: formatDateInput(order.scheduledDate),
        truckUsed: order.truckUsed ?? "",
        collectedBy: order.collectedBy || user.name,
        notes: order.notes ?? "",
      }
    );
  }

  function toggleExpand(order: OrderItem) {
    if (expandedOrderId === order.id) {
      onToggleExpand(null);
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [order.id]: {
        scheduledDate: formatDateInput(order.scheduledDate),
        truckUsed: order.truckUsed ?? "",
        collectedBy: order.collectedBy || user.name,
        notes: order.notes ?? "",
      },
    }));
    onToggleExpand(order.id);
  }

  function handleCardClick(
    e: React.MouseEvent<HTMLElement>,
    order: OrderItem
  ) {
    const target = e.target as HTMLElement;
    if (
      target.closest(
        "button, select, input, textarea, a, [data-no-expand='true']"
      )
    ) {
      return;
    }
    toggleExpand(order);
  }

  function updateDraft(
    order: OrderItem,
    field: keyof OrderDraft,
    value: string
  ) {
    setDrafts((prev) => {
      const current = prev[order.id] ?? {
        scheduledDate: formatDateInput(order.scheduledDate),
        truckUsed: order.truckUsed ?? "",
        collectedBy: order.collectedBy || user.name,
        notes: order.notes ?? "",
      };
      return {
        ...prev,
        [order.id]: {
          ...current,
          [field]: value,
        },
      };
    });
  }

  async function handleSaveDetails(order: OrderItem) {
    const draft = getDraft(order);
    setBusyOrderId(order.id);
    try {
      await onUpdateOrder(order.id, {
        scheduledDate: draft.scheduledDate ? draft.scheduledDate : null,
        truckUsed: draft.truckUsed.trim() ? draft.truckUsed.trim() : null,
        collectedBy: draft.collectedBy.trim() ? draft.collectedBy.trim() : null,
        notes: draft.notes.trim() ? draft.notes.trim() : null,
      });
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleCompleteExpanded(order: OrderItem) {
    const draft = getDraft(order);
    setBusyOrderId(order.id);
    try {
      await onUpdateOrder(order.id, {
        scheduledDate: draft.scheduledDate ? draft.scheduledDate : null,
        truckUsed: draft.truckUsed.trim() ? draft.truckUsed.trim() : null,
        collectedBy:
          draft.collectedBy.trim() || order.collectedBy || user.name,
        notes: draft.notes.trim() ? draft.notes.trim() : null,
      });
      await onCompleteWithUndo(order);
      onToggleExpand(null);
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleLink(orderId: string) {
    const companyId = selectedCompanies[orderId];
    if (!companyId) return;
    setBusyOrderId(orderId);
    try {
      await onLinkCompany(orderId, companyId);
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleLinkAndSaveContact(orderId: string) {
    const companyId = selectedCompanies[orderId];
    if (!companyId) return;
    setBusyOrderId(orderId);
    try {
      await onUpdateOrder(orderId, {
        companyId,
        needsReview: false,
        saveContactPhone: true,
      });
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleToggleHistory(orderId: string) {
    const currentlyOpen = Boolean(historyOpen[orderId]);
    if (currentlyOpen) {
      setHistoryOpen((prev) => ({ ...prev, [orderId]: false }));
      return;
    }

    setHistoryOpen((prev) => ({ ...prev, [orderId]: true }));
    setHistoryLoading((prev) => ({ ...prev, [orderId]: true }));
    try {
      const res = await authFetch(`/api/orders/${orderId}/events`);
      if (res.ok) {
        const data = (await res.json()) as { events: OrderEventItem[] };
        setHistoryEvents((prev) => ({ ...prev, [orderId]: data.events }));
      }
    } catch {
      // Ignore transient error
    } finally {
      setHistoryLoading((prev) => ({ ...prev, [orderId]: false }));
    }
  }

  return (
    <>
      <datalist id="truck-suggestions">
        {knownTrucks.map((truck) => (
          <option key={truck} value={truck} />
        ))}
      </datalist>

      <div
        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        role="list"
        aria-label="Fila de pedidos"
      >
        {orders.map((order, index) => {
          const actionMeta =
            ACTION_BADGES[order.actionType] ?? ACTION_BADGES.COLETA;
          const containerMeta =
            CONTAINER_LABELS[order.containerType] ??
            CONTAINER_LABELS.CAIXA_CACAMBA;
          const isUnlinked = order.needsReview || !order.company;
          const isDragging = draggedId === order.id;
          const isDragOver = dragOverId === order.id && draggedId !== order.id;
          const isBusy = busyOrderId === order.id;
          const isExpanded = expandedOrderId === order.id;
          const isFocused = focusedOrderId === order.id;
          const isSelected = selectedIds.includes(order.id);
          const draft = getDraft(order);

          const schedYmd = formatDateInput(order.scheduledDate);
          const isOverdue =
            order.status === "PENDENTE" &&
            Boolean(schedYmd) &&
            schedYmd < todayStr;

          const contactLabel =
            order.requesterName &&
            order.requesterName.trim() !== "" &&
            order.requesterName.trim() !== "Solicitante WhatsApp"
              ? order.requesterName
              : order.requesterPhone || "Sem telefone";

          const mobileDateLabel = order.scheduledDate
            ? formatShortScheduledDate(order.scheduledDate)
            : formatShortDate(order.createdAt);

          const borderClass = isDragging
            ? "scale-[0.99] border-[#B91C1C] opacity-50"
            : isDragOver
              ? "border-[#B91C1C] ring-2 ring-[#B91C1C]/30"
              : isOverdue
                ? "border-2 border-red-600 dark:border-red-500"
                : isUnlinked
                  ? "border border-amber-300 dark:border-amber-800/80"
                  : "border border-[var(--color-border)] hover:border-slate-300 dark:hover:border-slate-600";

          const focusRingClass = isFocused
            ? "ring-2 ring-[#B91C1C]/60 dark:ring-red-400/60"
            : "";

          return (
            <article
              key={order.id}
              role="listitem"
              draggable={isAdmin && !isExpanded}
              onClick={(e) => handleCardClick(e, order)}
              onDragStart={(e) => {
                if (!isAdmin || isExpanded) return;
                setDraggedId(order.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", order.id);
              }}
              onDragOver={(e) => {
                if (!isAdmin || !draggedId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverId !== order.id) {
                  setDragOverId(order.id);
                }
              }}
              onDragLeave={() => {
                if (dragOverId === order.id) {
                  setDragOverId(null);
                }
              }}
              onDrop={(e) => {
                if (!isAdmin) return;
                e.preventDefault();
                const sourceId =
                  draggedId || e.dataTransfer.getData("text/plain");
                if (sourceId && sourceId !== order.id) {
                  onDropReorder(sourceId, order.id);
                }
                setDraggedId(null);
                setDragOverId(null);
              }}
              onDragEnd={() => {
                setDraggedId(null);
                setDragOverId(null);
              }}
              className={`group flex h-full cursor-pointer flex-col justify-between rounded-2xl bg-[var(--color-surface-card)] p-4 shadow-xs transition-all sm:p-5 ${borderClass} ${focusRingClass}`}
            >
              <div className="flex flex-1 flex-col justify-between gap-3">
                {/* Top: Admin Reorder Controls (desktop) + Core Info */}
                <div className="flex min-w-0 items-start gap-3">
                  {/* Admin Batch Checkbox + Reorder Controls (hidden on < md) */}
                  {isAdmin && (
                    <div
                      data-no-expand="true"
                      className="hidden shrink-0 flex-col items-center gap-1 pt-0.5 md:flex"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(order.id)}
                        aria-label={`Selecionar pedido #${order.priorityOrder}`}
                        className="mb-1 h-4 w-4 cursor-pointer rounded border-slate-300 accent-[#B91C1C]"
                      />
                      <span
                        title="Arrastar para reordenar"
                        className="cursor-grab rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                      >
                        <GripVertical className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <button
                        type="button"
                        onClick={() => onMoveOrder(order.id, "up")}
                        disabled={index === 0}
                        title="Mover para cima na fila"
                        aria-label={`Mover pedido #${order.priorityOrder} para cima`}
                        className="rounded-md border border-[var(--color-border)] p-1 text-[var(--color-text-muted)] hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-800"
                      >
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveOrder(order.id, "down")}
                        disabled={index === orders.length - 1}
                        title="Mover para baixo na fila"
                        aria-label={`Mover pedido #${order.priorityOrder} para baixo`}
                        className="rounded-md border border-[var(--color-border)] p-1 text-[var(--color-text-muted)] hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-800"
                      >
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-2.5">
                    {/* Top Badges Row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="hidden items-center rounded-lg bg-[#1E293B] px-2.5 py-1 text-xs font-bold text-white md:inline-flex dark:bg-slate-100 dark:text-[#090D16]">
                        #{order.priorityOrder}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-sm font-extrabold sm:px-3 sm:text-base ${actionMeta.className}`}
                      >
                        {actionMeta.icon}
                        <span>{actionMeta.label}</span>
                      </span>

                      <span className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] px-2.5 py-1 text-sm font-extrabold text-[var(--color-text-main)] sm:px-3 sm:text-base dark:border-slate-600/80 dark:bg-[#090D16]">
                        {containerMeta.icon}
                        <span className="rounded-md bg-[var(--color-primary)] px-1.5 py-0.5 text-sm font-extrabold text-white sm:px-2 sm:text-base">
                          {order.quantity}x
                        </span>
                        <span>{containerMeta.label}</span>
                      </span>

                      {/* Mobile Ultra-Objective Date */}
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold md:hidden ${
                          order.scheduledDate
                            ? "rounded-full border border-[#B91C1C]/30 bg-[#B91C1C]/10 px-2 py-0.5 text-[#B91C1C] dark:border-red-800 dark:bg-red-950/50 dark:text-red-300"
                            : "text-[var(--color-text-muted)]"
                        }`}
                      >
                        {order.scheduledDate ? (
                          <Calendar className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <Clock className="h-3 w-3" aria-hidden="true" />
                        )}
                        <span>{mobileDateLabel}</span>
                      </span>

                      {/* Desktop Metadata Badges */}
                      <span className="hidden items-center gap-1 text-xs text-[var(--color-text-muted)] md:inline-flex">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{formatDateTime(order.createdAt)}</span>
                      </span>

                      {order.scheduledDate && (
                        <span className="hidden items-center gap-1 rounded-full border border-[#B91C1C]/30 bg-[#B91C1C]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#B91C1C] md:inline-flex dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
                          <Calendar className="h-3 w-3" aria-hidden="true" />
                          <span>
                            Agendada:{" "}
                            {formatScheduledBadge(order.scheduledDate)}
                          </span>
                        </span>
                      )}

                      {isOverdue && (
                        <span className="hidden items-center gap-1 rounded-full border border-red-600 bg-red-600 px-2.5 py-0.5 text-[11px] font-bold text-white md:inline-flex dark:border-red-500 dark:bg-red-600">
                          <AlertTriangle
                            className="h-3 w-3"
                            aria-hidden="true"
                          />
                          <span>Atrasado</span>
                        </span>
                      )}

                      {order.truckUsed && (
                        <span className="hidden items-center gap-1 rounded-full border border-[var(--color-border)] bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-[#1E293B] md:inline-flex dark:bg-slate-800 dark:text-slate-200">
                          <Truck className="h-3 w-3" aria-hidden="true" />
                          <span>Caminhão: {order.truckUsed}</span>
                        </span>
                      )}

                      {order.collectedBy && (
                        <span className="hidden items-center gap-1 rounded-full border border-[#15803D]/30 bg-green-50 px-2.5 py-0.5 text-[11px] font-semibold text-[#15803D] md:inline-flex dark:border-green-800 dark:bg-green-950/50 dark:text-green-300">
                          <User className="h-3 w-3" aria-hidden="true" />
                          <span>Por: {order.collectedBy}</span>
                        </span>
                      )}

                      {order.manuallyEdited && (
                        <span
                          title="Card editado manualmente (protegido contra sobrescrita automática)"
                          className="hidden items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-[#334155] md:inline-flex dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                          <span>Protegido (editado)</span>
                        </span>
                      )}
                    </div>

                    {/* Company or Needs Review Alert */}
                    {isUnlinked ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 dark:border-amber-800/70 dark:bg-amber-950/40">
                        <div className="flex flex-wrap items-center gap-2 text-base font-bold text-amber-900 sm:text-lg dark:text-amber-200">
                          <AlertTriangle
                            className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
                            aria-hidden="true"
                          />
                          <span>Empresa não identificada — Revisar</span>
                          {order.companyFallbackNote && (
                            <span
                              className={`text-xs font-medium text-amber-800 dark:text-amber-300 ${
                                isExpanded ? "inline" : "hidden md:inline"
                              }`}
                            >
                              ({order.companyFallbackNote})
                            </span>
                          )}
                        </div>

                        {isAdmin && (
                          <div
                            className={`mt-2.5 flex-wrap items-center gap-2 ${
                              isExpanded ? "flex" : "hidden md:flex"
                            }`}
                          >
                            <select
                              aria-label="Selecionar empresa para vincular"
                              value={selectedCompanies[order.id] ?? ""}
                              onChange={(e) =>
                                setSelectedCompanies((prev) => ({
                                  ...prev,
                                  [order.id]: e.target.value,
                                }))
                              }
                              className="min-w-[180px] flex-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                            >
                              <option value="">
                                Selecione uma empresa cadastrada...
                              </option>
                              {companies.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={!selectedCompanies[order.id] || isBusy}
                              onClick={() => void handleLink(order.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-500 dark:hover:bg-amber-600"
                            >
                              <Link2
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              <span>Vincular</span>
                            </button>

                            {!order.companyId && order.requesterPhone && (
                              <button
                                type="button"
                                disabled={
                                  !selectedCompanies[order.id] || isBusy
                                }
                                onClick={() =>
                                  void handleLinkAndSaveContact(order.id)
                                }
                                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-600 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-600 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-amber-950/50"
                              >
                                <Phone
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                <span>
                                  Vincular e salvar telefone
                                </span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="inline-flex items-center gap-2 text-base font-bold text-[var(--color-text-main)] sm:text-lg">
                          <Building2
                            className="h-5 w-5 shrink-0 text-[var(--color-primary)] dark:text-red-400"
                            aria-hidden="true"
                          />
                          <span>{order.company?.name}</span>
                        </span>
                        {order.company?.address && (
                          <span
                            className={`text-xs text-[var(--color-text-muted)] ${
                              isExpanded ? "inline" : "hidden md:inline"
                            }`}
                          >
                            {order.company.address}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Clean Contact Area */}
                    <div
                      className={`items-center gap-1.5 text-xs text-[var(--color-text-muted)] ${
                        isExpanded ? "flex" : "hidden md:flex"
                      }`}
                    >
                      <User
                        className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]"
                        aria-hidden="true"
                      />
                      <span className="truncate font-medium text-[var(--color-text-main)]">
                        {contactLabel}
                      </span>
                    </div>

                    {/* Raw Message Preview */}
                    <div
                      className={`items-start gap-2 rounded-xl bg-[var(--color-bg-main)] px-3 py-2 text-xs text-[var(--color-text-main)] ${
                        isExpanded ? "flex" : "hidden md:flex"
                      }`}
                    >
                      <MessageSquareText
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#15803D] dark:text-green-400"
                        aria-hidden="true"
                      />
                      <p className="line-clamp-3 italic">
                        &ldquo;{order.rawMessage}&rdquo;
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions Row: Direct Complete + Expand Toggle + Admin Delete */}
                <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--color-border)] pt-3">
                  <div className="flex items-center gap-2">
                    {order.status !== "CONCLUIDO" ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void onCompleteWithUndo(order);
                        }}
                        title="Concluir pedido"
                        aria-label={`Concluir pedido #${order.priorityOrder}`}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#15803D] px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#166534] disabled:opacity-60"
                      >
                        <CheckCircle2
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                        <span>Concluir</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#15803D] dark:text-green-400">
                        <CheckCircle2
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                        <span>Finalizado</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isAdmin && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void onDeleteWithUndo(order);
                        }}
                        title="Excluir pedido"
                        aria-label={`Excluir pedido #${order.priorityOrder}`}
                        className={`items-center gap-1 rounded-lg border border-transparent px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:border-red-200 hover:bg-red-50 hover:text-[#B91C1C] disabled:opacity-50 dark:hover:border-red-900/60 dark:hover:bg-red-950/50 dark:hover:text-red-400 ${
                          isExpanded ? "inline-flex" : "hidden md:inline-flex"
                        }`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleExpand(order)}
                      aria-expanded={isExpanded}
                      aria-label={
                        isExpanded
                          ? "Recolher detalhes da coleta"
                          : "Expandir detalhes e agendamento"
                      }
                      title={
                        isExpanded
                          ? "Recolher"
                          : "Agendar / Registrar coleta"
                      }
                      className="inline-flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-text-main)] hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      )}
                      <span className="hidden sm:inline">
                        {isExpanded ? "Fechar" : "Detalhes"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded Scheduling & Collection Details Panel */}
              {isExpanded && (
                <div
                  data-no-expand="true"
                  className="mt-4 border-t border-[var(--color-border)] pt-4"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label
                        htmlFor={`sched-${order.id}`}
                        className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]"
                      >
                        Agendar para o dia
                      </label>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <input
                          id={`sched-${order.id}`}
                          type="date"
                          value={draft.scheduledDate}
                          disabled={isBusy}
                          onChange={(e) =>
                            updateDraft(order, "scheduledDate", e.target.value)
                          }
                          className="min-w-[130px] flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3 py-2 text-xs text-[var(--color-text-main)] focus:border-[var(--color-primary)] focus:outline-none dark:bg-[#090D16]"
                        />
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              updateDraft(order, "scheduledDate", getTodayYmd())
                            }
                            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] px-2 py-1.5 text-[11px] font-semibold text-[var(--color-text-main)] hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            Hoje
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              updateDraft(
                                order,
                                "scheduledDate",
                                getTomorrowYmd()
                              )
                            }
                            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] px-2 py-1.5 text-[11px] font-semibold text-[var(--color-text-main)] hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            Amanhã
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              updateDraft(
                                order,
                                "scheduledDate",
                                getNextMondayYmd()
                              )
                            }
                            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] px-2 py-1.5 text-[11px] font-semibold text-[var(--color-text-main)] hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            Seg
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor={`truck-${order.id}`}
                        className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]"
                      >
                        Caminhão utilizado
                      </label>
                      <input
                        id={`truck-${order.id}`}
                        type="text"
                        list="truck-suggestions"
                        placeholder="Ex.: Caminhão 02 / Placa ABC-1234"
                        value={draft.truckUsed}
                        disabled={isBusy}
                        onChange={(e) =>
                          updateDraft(order, "truckUsed", e.target.value)
                        }
                        className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3 py-2 text-xs text-[var(--color-text-main)] placeholder:text-slate-400 focus:border-[var(--color-primary)] focus:outline-none dark:bg-[#090D16] dark:placeholder:text-slate-500"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor={`collector-${order.id}`}
                        className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]"
                      >
                        Quem realizou a coleta
                      </label>
                      <input
                        id={`collector-${order.id}`}
                        type="text"
                        placeholder={user.name}
                        value={draft.collectedBy}
                        disabled={isBusy}
                        onChange={(e) =>
                          updateDraft(order, "collectedBy", e.target.value)
                        }
                        className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3 py-2 text-xs text-[var(--color-text-main)] placeholder:text-slate-400 focus:border-[var(--color-primary)] focus:outline-none dark:bg-[#090D16] dark:placeholder:text-slate-500"
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <label
                      htmlFor={`notes-${order.id}`}
                      className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]"
                    >
                      Observações
                    </label>
                    <textarea
                      id={`notes-${order.id}`}
                      rows={2}
                      placeholder="Detalhes da rota, horário combinado, observações do local..."
                      value={draft.notes}
                      disabled={isBusy}
                      onChange={(e) =>
                        updateDraft(order, "notes", e.target.value)
                      }
                      className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3 py-2 text-xs text-[var(--color-text-main)] placeholder:text-slate-400 focus:border-[#B91C1C] focus:outline-none"
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => void handleToggleHistory(order.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-xs font-semibold text-[var(--color-text-main)] hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <History className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {historyOpen[order.id]
                          ? "Ocultar histórico"
                          : "Ver histórico"}
                      </span>
                    </button>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleSaveDetails(order)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#B91C1C] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#991B1B] disabled:opacity-60"
                      >
                        {isBusy ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Save className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <span>Salvar Dados / Agendamento</span>
                      </button>

                      {order.status !== "CONCLUIDO" && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleCompleteExpanded(order)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#15803D] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#166534] disabled:opacity-60"
                        >
                          {isBusy ? (
                            <Loader2
                              className="h-3.5 w-3.5 animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <CheckCircle2
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                          )}
                          <span>Concluir Coleta</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Audit History Section */}
                  {historyOpen[order.id] && (
                    <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] p-3">
                      <h4 className="mb-2 text-xs font-bold text-[var(--color-text-main)]">
                        Histórico de alterações
                      </h4>
                      {historyLoading[order.id] ? (
                        <div className="flex items-center gap-2 py-2 text-xs text-[var(--color-text-muted)]">
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                          <span>Carregando histórico...</span>
                        </div>
                      ) : (historyEvents[order.id]?.length ?? 0) === 0 ? (
                        <p className="text-xs text-[var(--color-text-muted)]">
                          Nenhuma alteração registrada ainda.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {historyEvents[order.id].map((ev) => (
                            <li
                              key={ev.id}
                              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-border)] pb-1.5 text-xs last:border-b-0 last:pb-0"
                            >
                              <div className="min-w-0">
                                <span className="font-semibold text-[var(--color-text-main)]">
                                  {ev.actorName}
                                </span>{" "}
                                <span className="text-[var(--color-text-muted)]">
                                  alterou{" "}
                                  <strong className="font-medium text-[var(--color-text-main)]">
                                    {ev.field}
                                  </strong>
                                  :
                                </span>{" "}
                                <span className="font-mono text-[11px] text-[var(--color-text-muted)]">
                                  {ev.beforeValue ?? "—"} &rarr;{" "}
                                  {ev.afterValue ?? "—"}
                                </span>
                              </div>
                              <span className="shrink-0 text-[11px] text-[var(--color-text-muted)]">
                                {formatDateTime(ev.createdAt)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
