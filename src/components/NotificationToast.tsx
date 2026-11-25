"use client";

import React from "react";
import { Bell, Truck, X } from "lucide-react";

export interface ToastItem {
  id: string;
  title: string;
  message: string;
  createdAt: number;
  actionLabel?: string;
  onAction?: () => void;
}

interface NotificationToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function NotificationToast({
  toasts,
  onDismiss,
}: NotificationToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2.5 pl-4"
      aria-label="Notificações de novos pedidos"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-emerald-200 bg-white/95 p-4 shadow-lg shadow-slate-900/10 backdrop-blur-md transition-all dark:border-emerald-800/80 dark:bg-slate-900/95 dark:shadow-black/40"
        >
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-400">
            <Bell className="h-4.5 w-4.5" aria-hidden="true" />
            <Truck
              className="absolute -right-1 -bottom-1 h-3.5 w-3.5 rounded-full bg-white p-0.5 text-emerald-600 shadow dark:bg-slate-900 dark:text-emerald-400"
              aria-hidden="true"
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              {toast.title}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {toast.message}
            </p>
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                onClick={() => {
                  toast.onAction?.();
                  onDismiss(toast.id);
                }}
                className="mt-2 inline-flex items-center rounded-lg bg-[#B91C1C] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#991B1B]"
              >
                {toast.actionLabel}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Fechar notificação"
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
