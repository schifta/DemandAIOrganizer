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
  OrderItem,
  OrderStatus,
} from "@/types";

export interface OrderUpdatePayload {
  status?: OrderStatus;
  scheduledDate?: string | null;
  truckUsed?: string | null;
  collectedBy?: string | null;
  notes?: string | null;
}

interface OrderQueueProps {
  orders: OrderItem[];
  companies: CompanyItem[];
  user: AuthUser;
  onStatusChange: (orderId: string, status: OrderStatus) => Promise<void>;
  onUpdateOrder: (orderId: string, updates: OrderUpdatePayload) => Promise<void>;
  onLinkCompany: (orderId: string, companyId: string) => Promise<void>;
  onDeleteOrder: (orderId: string) => Promise<void>;
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
      "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
    icon: <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  COLETA: {
    label: "COLETA",
    className:
      "bg-[#15803D]/10 text-[#15803D] border-[#15803D]/30 dark:bg-green-950/60 dark:text-green-300 dark:border-green-800",
    icon: <Truck className="h-3.5 w-3.5" aria-hidden="true" />,
  },
};

const CONTAINER_LABELS: Record<
  ContainerType,
  { label: string; icon: React.ReactNode }
> = {
  CAIXA_CACAMBA: {
    label: "Caixa / Caçamba",
    icon: <Box className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  TAMBOR: {
    label: "Tambor",
    icon: <Cylinder className="h-3.5 w-3.5" aria-hidden="true" />,
  },
};

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "PENDENTE", label: "Pendente" },
  { value: "EM_ROTA", label: "Em Rota" },
  { value: "CONCLUIDO", label: "Concluído" },
  { value: "CANCELADO", label: "Cancelado" },
];

const STATUS_COLORS: Record<OrderStatus, string> = {
  PENDENTE:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  EM_ROTA:
    "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
  CONCLUIDO:
    "border-[#15803D]/40 bg-green-50 text-[#15803D] dark:border-green-800 dark:bg-green-950/50 dark:text-green-200",
  CANCELADO:
    "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
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
  onStatusChange,
  onUpdateOrder,
  onLinkCompany,
  onDeleteOrder,
  onMoveOrder,
  onDropReorder,
}: OrderQueueProps) {
  const isAdmin = user.role === "ADMIN_MASTER" || user.role === "ADMIN";

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [selectedCompanies, setSelectedCompanies] = useState<
    Record<string, string>
  >({});
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, OrderDraft>>({});

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

  function toggleExpand(order: OrderItem) {
    if (expandedId === order.id) {
      setExpandedId(null);
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
    setExpandedId(order.id);
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
    orderId: string,
    field: keyof OrderDraft,
    value: string
  ) {
    setDrafts((prev) => {
      const current = prev[orderId] ?? {
        scheduledDate: "",
        truckUsed: "",
        collectedBy: user.name,
        notes: "",
      };
      return {
        ...prev,
        [orderId]: {
          ...current,
          [field]: value,
        },
      };
    });
  }

  async function handleSaveDetails(order: OrderItem) {
    const draft = drafts[order.id];
    if (!draft) return;
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

  async function handleCompleteOrder(order: OrderItem) {
    const draft = drafts[order.id];
    setBusyOrderId(order.id);
    try {
      await onUpdateOrder(order.id, {
        status: "CONCLUIDO",
        scheduledDate: draft?.scheduledDate ? draft.scheduledDate : null,
        truckUsed: draft?.truckUsed.trim() ? draft.truckUsed.trim() : null,
        collectedBy:
          draft?.collectedBy.trim() || order.collectedBy || user.name,
        notes: draft?.notes.trim() ? draft.notes.trim() : null,
      });
      setExpandedId(null);
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleStatus(orderId: string, nextStatus: OrderStatus) {
    setBusyOrderId(orderId);
    try {
      await onStatusChange(orderId, nextStatus);
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

  async function handleDelete(orderId: string) {
    setBusyOrderId(orderId);
    try {
      await onDeleteOrder(orderId);
      setConfirmDeleteId(null);
    } finally {
      setBusyOrderId(null);
    }
  }

  return (
    <div className="space-y-3" role="list" aria-label="Fila de pedidos">
      {orders.map((order, index) => {
        const actionMeta = ACTION_BADGES[order.actionType] ?? ACTION_BADGES.COLETA;
        const containerMeta =
          CONTAINER_LABELS[order.containerType] ??
          CONTAINER_LABELS.CAIXA_CACAMBA;
        const isUnlinked = order.needsReview || !order.company;
        const isDragging = draggedId === order.id;
        const isDragOver = dragOverId === order.id && draggedId !== order.id;
        const isBusy = busyOrderId === order.id;
        const isExpanded = expandedId === order.id;
        const draft = drafts[order.id] ?? {
          scheduledDate: formatDateInput(order.scheduledDate),
          truckUsed: order.truckUsed ?? "",
          collectedBy: order.collectedBy || user.name,
          notes: order.notes ?? "",
        };

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
            className={`group cursor-pointer rounded-2xl border bg-[var(--color-surface-card)] p-4 shadow-xs transition-all sm:p-5 ${
              isDragging
                ? "scale-[0.99] border-[#B91C1C] opacity-50"
                : isDragOver
                  ? "border-[#B91C1C] ring-2 ring-[#B91C1C]/30"
                  : isUnlinked
                    ? "border-amber-300 dark:border-amber-800/80"
                    : "border-[var(--color-border)] hover:border-slate-300 dark:hover:border-slate-600"
            }`}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              {/* Left: Drag handle + Priority + Core Info */}
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {/* Admin Reorder Controls */}
                {isAdmin && (
                  <div
                    data-no-expand="true"
                    className="flex shrink-0 flex-col items-center gap-1 pt-0.5"
                  >
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
                    <span className="inline-flex items-center rounded-lg bg-[#1E293B] px-2.5 py-1 text-xs font-bold text-white dark:bg-slate-100 dark:text-[#0F172A]">
                      #{order.priorityOrder}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${actionMeta.className}`}
                    >
                      {actionMeta.icon}
                      <span>{actionMeta.label}</span>
                    </span>

                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-main)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-text-main)]">
                      {containerMeta.icon}
                      <span>{containerMeta.label}</span>
                      <span className="ml-0.5 rounded-md bg-[#B91C1C] px-1.5 py-0.2 text-[11px] font-bold text-white">
                        {order.quantity}x
                      </span>
                    </span>

                    <span className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{formatDateTime(order.createdAt)}</span>
                    </span>

                    {order.scheduledDate && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#B91C1C]/30 bg-[#B91C1C]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#B91C1C] dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
                        <Calendar className="h-3 w-3" aria-hidden="true" />
                        <span>
                          Agendada: {formatScheduledBadge(order.scheduledDate)}
                        </span>
                      </span>
                    )}

                    {order.truckUsed && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-[#1E293B] dark:bg-slate-800 dark:text-slate-200">
                        <Truck className="h-3 w-3" aria-hidden="true" />
                        <span>Caminhão: {order.truckUsed}</span>
                      </span>
                    )}

                    {order.collectedBy && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#15803D]/30 bg-green-50 px-2.5 py-0.5 text-[11px] font-semibold text-[#15803D] dark:border-green-800 dark:bg-green-950/50 dark:text-green-300">
                        <User className="h-3 w-3" aria-hidden="true" />
                        <span>Por: {order.collectedBy}</span>
                      </span>
                    )}

                    {order.manuallyEdited && (
                      <span
                        title="Card editado manualmente (protegido contra sobrescrita automática)"
                        className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-[#334155] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      >
                        <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                        <span>Protegido (editado)</span>
                      </span>
                    )}
                  </div>

                  {/* Company or Needs Review Alert */}
                  {isUnlinked ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 dark:border-amber-900/60 dark:bg-amber-950/40">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
                        <AlertTriangle
                          className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                          aria-hidden="true"
                        />
                        <span>Empresa não identificada — Revisar</span>
                        {order.companyFallbackNote && (
                          <span className="font-normal text-amber-800 dark:text-amber-300">
                            ({order.companyFallbackNote})
                          </span>
                        )}
                      </div>

                      {isAdmin && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <select
                            aria-label="Selecionar empresa para vincular"
                            value={selectedCompanies[order.id] ?? ""}
                            onChange={(e) =>
                              setSelectedCompanies((prev) => ({
                                ...prev,
                                [order.id]: e.target.value,
                              }))
                            }
                            className="min-w-[200px] flex-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
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
                            onClick={() => handleLink(order.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-500 dark:hover:bg-amber-600"
                          >
                            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Vincular</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--color-text-main)]">
                        <Building2
                          className="h-4 w-4 text-[#B91C1C] dark:text-red-400"
                          aria-hidden="true"
                        />
                        <span>{order.company?.name}</span>
                      </span>
                      {order.company?.address && (
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {order.company.address}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Requester + Original WhatsApp Message */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
                    <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-text-main)]">
                      <User
                        className="h-3.5 w-3.5 text-[var(--color-text-muted)]"
                        aria-hidden="true"
                      />
                      <span>{order.requesterName}</span>
                    </span>
                    {order.requesterPhone && (
                      <span className="inline-flex items-center gap-1.5 font-mono">
                        <Phone
                          className="h-3.5 w-3.5 text-[var(--color-text-muted)]"
                          aria-hidden="true"
                        />
                        <span>{order.requesterPhone}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-start gap-2 rounded-xl bg-[var(--color-bg-main)] px-3 py-2 text-xs text-[var(--color-text-main)]">
                    <MessageSquareText
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#15803D] dark:text-green-400"
                      aria-hidden="true"
                    />
                    <p className="italic">&ldquo;{order.rawMessage}&rdquo;</p>
                  </div>
                </div>
              </div>

              {/* Right: Status Selector + Expand Toggle + Admin Delete */}
              <div className="flex shrink-0 flex-row items-center justify-between gap-2 border-t border-[var(--color-border)] pt-3 lg:flex-col lg:items-end lg:border-t-0 lg:pt-0">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor={`status-${order.id}`}
                    className="text-xs font-medium text-[var(--color-text-muted)] lg:sr-only"
                  >
                    Status
                  </label>
                  <select
                    id={`status-${order.id}`}
                    value={order.status}
                    disabled={isBusy}
                    onChange={(e) =>
                      handleStatus(order.id, e.target.value as OrderStatus)
                    }
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold focus:outline-none disabled:opacity-60 ${STATUS_COLORS[order.status]}`}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => toggleExpand(order)}
                    aria-expanded={isExpanded}
                    aria-label={
                      isExpanded
                        ? "Recolher detalhes da coleta"
                        : "Expandir detalhes e agendamento"
                    }
                    title={isExpanded ? "Recolher" : "Agendar / Registrar coleta"}
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

                {order.status === "CONCLUIDO" && (
                  <span className="hidden items-center gap-1 text-[11px] font-semibold text-[#15803D] lg:inline-flex dark:text-green-400">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Finalizado</span>
                  </span>
                )}

                {isAdmin && (
                  <div className="flex items-center gap-1.5">
                    {confirmDeleteId === order.id ? (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDelete(order.id)}
                          className="rounded-lg bg-[#B91C1C] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#991B1B] disabled:opacity-50"
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(order.id)}
                        title="Excluir pedido"
                        aria-label={`Excluir pedido #${order.priorityOrder}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-transparent px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:border-red-200 hover:bg-red-50 hover:text-[#B91C1C] dark:hover:border-red-900/60 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="lg:hidden">Excluir</span>
                      </button>
                    )}
                  </div>
                )}
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
                    <input
                      id={`sched-${order.id}`}
                      type="date"
                      value={draft.scheduledDate}
                      disabled={isBusy}
                      onChange={(e) =>
                        updateDraft(order.id, "scheduledDate", e.target.value)
                      }
                      className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3 py-2 text-xs text-[var(--color-text-main)] focus:border-[#B91C1C] focus:outline-none"
                    />
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
                      placeholder="Ex.: Caminhão 02 / Placa ABC-1234"
                      value={draft.truckUsed}
                      disabled={isBusy}
                      onChange={(e) =>
                        updateDraft(order.id, "truckUsed", e.target.value)
                      }
                      className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3 py-2 text-xs text-[var(--color-text-main)] placeholder:text-slate-400 focus:border-[#B91C1C] focus:outline-none"
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
                        updateDraft(order.id, "collectedBy", e.target.value)
                      }
                      className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3 py-2 text-xs text-[var(--color-text-main)] placeholder:text-slate-400 focus:border-[#B91C1C] focus:outline-none"
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
                      updateDraft(order.id, "notes", e.target.value)
                    }
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3 py-2 text-xs text-[var(--color-text-main)] placeholder:text-slate-400 focus:border-[#B91C1C] focus:outline-none"
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
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
                      onClick={() => void handleCompleteOrder(order)}
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
            )}
          </article>
        );
      })}
    </div>
  );
}
