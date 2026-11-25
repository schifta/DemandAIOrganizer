"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Lock,
  RefreshCw,
  UserMinus,
  Users,
} from "lucide-react";
import { UserListItem, UserRole } from "@/types";
import { authFetch } from "@/lib/client-auth";

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN_MASTER: "Master",
  ADMIN: "Administrador",
  OPERATOR: "Operador",
};

const ROLE_BADGE_STYLES: Record<UserRole, string> = {
  ADMIN_MASTER:
    "bg-[#B91C1C]/10 text-[#B91C1C] border-[#B91C1C]/30 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800",
  ADMIN:
    "bg-[#1E293B]/10 text-[#1E293B] border-[#334155]/30 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600",
  OPERATOR:
    "bg-[#15803D]/10 text-[#15803D] border-[#15803D]/30 dark:bg-green-950/60 dark:text-green-300 dark:border-green-800",
};

function isProtectedMaster(u: UserListItem): boolean {
  return (
    u.email.toLowerCase() === "gabriel.schifter@gmail.com" ||
    u.role === "ADMIN_MASTER"
  );
}

export function UserManagementPanel() {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setError(null);
    try {
      const res = await authFetch("/api/users");
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Erro ao carregar usuários.");
        return;
      }
      const data = (await res.json()) as { users: UserListItem[] };
      setUsers(data.users);
    } catch {
      setError("Erro de conexão ao buscar usuários.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  async function handleToggleRole(targetUser: UserListItem) {
    const nextRole: "ADMIN" | "OPERATOR" =
      targetUser.role === "ADMIN" ? "OPERATOR" : "ADMIN";
    setBusyId(targetUser.id);
    setError(null);
    try {
      const res = await authFetch(`/api/users/${targetUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        user?: UserListItem;
      };
      if (!res.ok) {
        setError(data.error || "Não foi possível alterar o cargo do usuário.");
        return;
      }
      if (data.user) {
        setUsers((prev) =>
          prev.map((u) => (u.id === targetUser.id ? data.user! : u))
        );
      }
    } catch {
      setError("Erro de conexão ao atualizar usuário.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemoveUser(targetUser: UserListItem) {
    setBusyId(targetUser.id);
    setError(null);
    try {
      const res = await authFetch(`/api/users/${targetUser.id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Não foi possível remover o usuário.");
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== targetUser.id));
    } catch {
      setError("Erro de conexão ao remover usuário.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section
      aria-labelledby="user-management-heading"
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-card)] p-5 shadow-xs"
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1E293B]/10 text-[#1E293B] dark:bg-slate-800 dark:text-slate-200">
            <Users className="h-4.5 w-4.5" aria-hidden="true" />
          </div>
          <div>
            <h2
              id="user-management-heading"
              className="text-base font-bold text-[var(--color-text-main)]"
            >
              Equipe e Usuários
            </h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              Gerencie acessos e permissões
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void fetchUsers()}
          disabled={loading}
          title="Atualizar lista de usuários"
          aria-label="Atualizar lista de usuários"
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
          <span>Carregando usuários...</span>
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-6 text-center text-xs text-[var(--color-text-muted)]">
          Nenhum usuário encontrado.
        </div>
      ) : (
        <ul className="space-y-3">
          {users.map((u) => {
            const protectedMaster = isProtectedMaster(u);
            const isBusy = busyId === u.id;

            return (
              <li
                key={u.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--color-text-main)]">
                      {u.name}
                    </p>
                    <p className="truncate text-xs text-[var(--color-text-muted)]">
                      {u.email}
                    </p>
                  </div>

                  {protectedMaster ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#B91C1C]/30 bg-[#B91C1C]/10 px-2 py-0.5 text-[11px] font-semibold text-[#B91C1C] dark:border-red-800 dark:bg-red-950/60 dark:text-red-300">
                      <Lock className="h-3 w-3" aria-hidden="true" />
                      <span>Protegido #0</span>
                    </span>
                  ) : (
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ROLE_BADGE_STYLES[u.role]}`}
                    >
                      {ROLE_LABELS[u.role]}
                    </span>
                  )}
                </div>

                {!protectedMaster && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleToggleRole(u)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-text-main)] hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
                    >
                      {u.role === "ADMIN" ? (
                        <>
                          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Rebaixar a Operador</span>
                        </>
                      ) : (
                        <>
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Promover a Admin</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleRemoveUser(u)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#B91C1C]/30 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#B91C1C] hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/50"
                    >
                      {isBusy ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span>Expulsar</span>
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
