"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { AccessKeyItem } from "@/types";

interface AccessKeyPanelProps {
  accessKeys: AccessKeyItem[];
  onKeyCreated: () => Promise<void> | void;
}

function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return "00:00";
  const totalSeconds = Math.floor(msRemaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function AccessKeyPanel({
  accessKeys,
  onKeyCreated,
}: AccessKeyPanelProps) {
  const [roleToGrant, setRoleToGrant] = useState<"OPERATOR" | "ADMIN">(
    "OPERATOR"
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Tick every second for live MM:SS countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const activeKey = useMemo(() => {
    return accessKeys.find(
      (k) => k.usedAt === null && new Date(k.expiresAt).getTime() > nowMs
    );
  }, [accessKeys, nowMs]);

  async function handleGenerateKey() {
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/access-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleToGrant }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Não foi possível gerar a key de acesso.");
        return;
      }

      await onKeyCreated();
    } catch {
      setError("Erro de conexão ao gerar key de acesso.");
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => {
        setCopiedCode((prev) => (prev === code ? null : prev));
      }, 2000);
    } catch {
      // Fallback ignored if clipboard is unavailable
    }
  }

  return (
    <section
      aria-labelledby="access-keys-heading"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
          <KeyRound className="h-4.5 w-4.5" aria-hidden="true" />
        </div>
        <div>
          <h2
            id="access-keys-heading"
            className="text-base font-bold text-slate-900 dark:text-white"
          >
            Keys de Acesso (5 min)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Convide novos operadores ou administradores com validade temporária
          </p>
        </div>
      </div>

      {/* Generator Controls */}
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <select
          aria-label="Perfil a conceder"
          value={roleToGrant}
          onChange={(e) =>
            setRoleToGrant(e.target.value as "OPERATOR" | "ADMIN")
          }
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="OPERATOR">Operador (OPERATOR)</option>
          <option value="ADMIN">Administrador (ADMIN)</option>
        </select>

        <button
          type="button"
          onClick={handleGenerateKey}
          disabled={creating}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-600"
        >
          {creating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Gerando...</span>
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Gerar Key de 5 min</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
        >
          {error}
        </p>
      )}

      {/* Active Key Highlight + Live Countdown */}
      {activeKey && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 dark:border-emerald-900/70 dark:bg-emerald-950/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Key ativa ({activeKey.roleToGrant === "ADMIN" ? "Administrador" : "Operador"})
              </span>
              <p className="mt-0.5 font-mono text-lg font-bold tracking-wider text-slate-900 dark:text-white">
                {activeKey.code}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 font-mono text-xs font-bold text-emerald-700 shadow-2xs dark:bg-slate-900 dark:text-emerald-400">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {formatCountdown(
                    new Date(activeKey.expiresAt).getTime() - nowMs
                  )}
                </span>
              </span>

              <button
                type="button"
                onClick={() => handleCopy(activeKey.code)}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
              >
                {copiedCode === activeKey.code ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent Keys List */}
      <div className="mt-4 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Histórico recente
        </h3>

        {accessKeys.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Nenhuma key gerada ainda.
          </p>
        ) : (
          <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {accessKeys.map((keyItem) => {
              const expiresMs = new Date(keyItem.expiresAt).getTime();
              const isUsed = keyItem.usedAt !== null;
              const isExpired = !isUsed && expiresMs <= nowMs;
              const isActive = !isUsed && !isExpired;

              return (
                <li
                  key={keyItem.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                        {keyItem.code}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                        {keyItem.roleToGrant === "ADMIN" ? "ADMIN" : "OPERADOR"}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                      Criada por {keyItem.createdBy.name}
                      {keyItem.usedBy ? ` • Usada por ${keyItem.usedBy.name}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {isActive && (
                      <>
                        <span className="font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          {formatCountdown(expiresMs - nowMs)}
                        </span>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                          Ativa
                        </span>
                      </>
                    )}
                    {isUsed && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:bg-sky-950/70 dark:text-sky-300">
                        Usada
                      </span>
                    )}
                    {isExpired && (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        Expirada
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
