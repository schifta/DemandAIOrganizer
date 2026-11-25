"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Check,
  Clock,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
import { RegistrationRequestItem } from "@/types";
import { authFetch } from "@/lib/client-auth";

function formatRemainingTime(expiresAt: string, nowMs: number): string {
  const diffMs = new Date(expiresAt).getTime() - nowMs;
  if (diffMs <= 0) return "Expirada";
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${minutes}m restantes`;
}

export function RegistrationRequestsPanel() {
  const [requests, setRequests] = useState<RegistrationRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<
    Record<string, "OPERATOR" | "ADMIN">
  >({});
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const fetchRequests = useCallback(async () => {
    setError(null);
    try {
      const res = await authFetch("/api/registration-requests");
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Erro ao carregar solicitações de cadastro.");
        return;
      }
      const data = (await res.json()) as {
        requests: RegistrationRequestItem[];
      };
      setRequests(data.requests);
    } catch {
      setError("Erro de conexão ao buscar solicitações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  async function handleApprove(id: string) {
    const role = selectedRoles[id] ?? "OPERATOR";
    setBusyId(id);
    setError(null);
    try {
      const res = await authFetch(`/api/registration-requests/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Não foi possível aprovar a solicitação.");
        return;
      }

      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setError("Erro de conexão ao aprovar solicitação.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await authFetch(`/api/registration-requests/${id}/reject`, {
        method: "POST",
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Não foi possível recusar a solicitação.");
        return;
      }

      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setError("Erro de conexão ao recusar solicitação.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section
      aria-labelledby="registration-requests-heading"
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-card)] p-5 shadow-xs"
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#B91C1C]/10 text-[#B91C1C] dark:bg-red-950/60 dark:text-red-300">
            <UserPlus className="h-4.5 w-4.5" aria-hidden="true" />
          </div>
          <div>
            <h2
              id="registration-requests-heading"
              className="text-base font-bold text-[var(--color-text-main)]"
            >
              Aprovações de Cadastro
            </h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              Solicitações pendentes válidas por 24h
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void fetchRequests()}
          disabled={loading}
          title="Atualizar solicitações"
          aria-label="Atualizar lista de solicitações"
          className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-text-muted)] hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-[#B91C1C] dark:bg-red-950/50 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6 text-xs text-[var(--color-text-muted)]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          <span>Carregando solicitações...</span>
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-6 text-center text-xs text-[var(--color-text-muted)]">
          Nenhuma solicitação pendente no momento.
        </div>
      ) : (
        <ul className="space-y-3">
          {requests.map((req) => {
            const isBusy = busyId === req.id;
            const roleValue = selectedRoles[req.id] ?? "OPERATOR";

            return (
              <li
                key={req.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--color-text-main)]">
                      {req.name}
                    </p>
                    <p className="truncate text-xs text-[var(--color-text-muted)]">
                      {req.email}
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    <span>{formatRemainingTime(req.expiresAt, nowMs)}</span>
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="flex min-w-[140px] flex-1 items-center gap-1.5">
                    <ShieldCheck
                      className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]"
                      aria-hidden="true"
                    />
                    <select
                      aria-label={`Perfil para ${req.name}`}
                      value={roleValue}
                      disabled={isBusy}
                      onChange={(e) =>
                        setSelectedRoles((prev) => ({
                          ...prev,
                          [req.id]: e.target.value as "OPERATOR" | "ADMIN",
                        }))
                      }
                      className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-text-main)]"
                    >
                      <option value="OPERATOR">Operador</option>
                      <option value="ADMIN">Administrador</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleApprove(req.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#15803D] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#166534] disabled:opacity-50"
                  >
                    {isBusy ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>Aprovar</span>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleReject(req.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#B91C1C]/30 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#B91C1C] hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/50"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Recusar</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
