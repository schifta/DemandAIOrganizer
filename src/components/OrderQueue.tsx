"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Box,
  Building2,
  CheckCircle2,
  Clock,
  Cylinder,
  GripVertical,
  Link2,
  MessageSquareText,
  Package,
  Phone,
  RefreshCw,
  Trash2,
  Truck,
  User,
} from "lucide-react";
import {
  ActionType,
  CompanyItem,
  ContainerType,
  OrderItem,
  OrderStatus,
  UserRole,
} from "@/types";

interface OrderQueueProps {
  orders: OrderItem[];
  companies: CompanyItem[];
  userRole: UserRole;
  onStatusChange: (orderId: string, status: OrderStatus) => Promise<void>;
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
      "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
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
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
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

export function OrderQueue({
  orders,
  companies,
  userRole,
  onStatusChange,
  onLinkCompany,
  onDeleteOrder,
  onMoveOrder,
  onDropReorder,
}: OrderQueueProps) {
  const isAdmin = userRole === "ADMIN_MASTER" || userRole === "ADMIN";

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [selectedCompanies, setSelectedCompanies] = useState<
    Record<string, string>
  >({});
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900/60">
        <Package
          className="mb-3 h-10 w-10 text-slate-400 dark:text-slate-500"
          aria-hidden="true"
        />
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
          Nenhum pedido encontrado neste filtro
        </h3>
        <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          Novas solicitações recebidas pelo WhatsApp aparecerão aqui em ordem de
          prioridade.
        </p>
      </div>
    );
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

        return (
          <article
            key={order.id}
            role="listitem"
            draggable={isAdmin}
            onDragStart={(e) => {
              if (!isAdmin) return;
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
            className={`group rounded-2xl border bg-white p-4 shadow-xs transition-all sm:p-5 dark:bg-slate-900 ${
              isDragging
                ? "scale-[0.99] border-emerald-400 opacity-50 dark:border-emerald-600"
                : isDragOver
                  ? "border-emerald-500 ring-2 ring-emerald-500/30 dark:border-emerald-400"
                  : isUnlinked
                    ? "border-amber-300 dark:border-amber-800/80"
                    : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
            }`}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              {/* Left: Drag handle + Priority + Core Info */}
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {/* Admin Reorder Controls */}
                {isAdmin && (
                  <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
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
                      className="rounded-md border border-slate-200 p-1 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onMoveOrder(order.id, "down")}
                      disabled={index === orders.length - 1}
                      title="Mover para baixo na fila"
                      aria-label={`Mover pedido #${order.priorityOrder} para baixo`}
                      className="rounded-md border border-slate-200 p-1 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}

                <div className="min-w-0 flex-1 space-y-2.5">
                  {/* Top Badges Row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">
                      #{order.priorityOrder}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${actionMeta.className}`}
                    >
                      {actionMeta.icon}
                      <span>{actionMeta.label}</span>
                    </span>

                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {containerMeta.icon}
                      <span>{containerMeta.label}</span>
                      <span className="ml-0.5 rounded-md bg-emerald-600 px-1.5 py-0.2 text-[11px] font-bold text-white dark:bg-emerald-500">
                        {order.quantity}x
                      </span>
                    </span>

                    <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{formatDateTime(order.createdAt)}</span>
                    </span>
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
                      <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                        <Building2
                          className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                          aria-hidden="true"
                        />
                        <span>{order.company?.name}</span>
                      </span>
                      {order.company?.address && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {order.company.address}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Requester + Original WhatsApp Message */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <User className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      <span>{order.requesterName}</span>
                    </span>
                    {order.requesterPhone && (
                      <span className="inline-flex items-center gap-1.5 font-mono text-slate-500 dark:text-slate-400">
                        <Phone className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                        <span>{order.requesterPhone}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                    <MessageSquareText
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                    <p className="italic">&ldquo;{order.rawMessage}&rdquo;</p>
                  </div>
                </div>
              </div>

              {/* Right: Status Selector + Admin Delete */}
              <div className="flex shrink-0 flex-row items-center justify-between gap-2 border-t border-slate-100 pt-3 lg:flex-col lg:items-end lg:border-t-0 lg:pt-0 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor={`status-${order.id}`}
                    className="text-xs font-medium text-slate-500 lg:sr-only dark:text-slate-400"
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
                </div>

                {order.status === "CONCLUIDO" && (
                  <span className="hidden items-center gap-1 text-[11px] font-medium text-emerald-600 lg:inline-flex dark:text-emerald-400">
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
                          className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
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
                        className="inline-flex items-center gap-1 rounded-lg border border-transparent px-2 py-1 text-xs font-medium text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:border-rose-900/60 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="lg:hidden">Excluir</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
