"use client";

import React, { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  LogIn,
  Moon,
  Recycle,
  RotateCcw,
  Sun,
  Truck,
  UserPlus,
} from "lucide-react";
import { FONT_SCALES, usePreferences } from "@/components/ThemeProvider";
import {
  authFetch,
  clearSession,
  getStoredToken,
  saveSession,
} from "@/lib/client-auth";
import { AuthUser } from "@/types";

type AuthTab = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const { theme, toggleTheme, fontScale, increaseFont, decreaseFont, resetFont } =
    usePreferences();

  const [tab, setTab] = useState<AuthTab>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");

  const isMinFont = fontScale === FONT_SCALES[0];
  const isMaxFont = fontScale === FONT_SCALES[FONT_SCALES.length - 1];

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;

    let active = true;
    authFetch("/api/auth/me")
      .then((res) => {
        if (!active) return;
        if (res.ok) {
          router.replace("/");
          router.refresh();
        } else if (res.status === 401) {
          clearSession();
        }
      })
      .catch(() => {
        // Ignore connection error during initial session check
      });

    return () => {
      active = false;
    };
  }, [router]);

  function switchTab(nextTab: AuthTab) {
    setTab(nextTab);
    setError(null);
    setRegSuccess(null);
  }

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        token?: string;
        user?: AuthUser;
      };

      if (!res.ok) {
        setError(data.error || "Não foi possível entrar. Verifique seus dados.");
        return;
      }

      if (data.token && data.user) {
        saveSession(data.token, data.user);
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Erro de conexão ao tentar entrar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setRegSuccess(null);

    if (regPassword.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regName.trim(),
          email: regEmail.trim(),
          password: regPassword,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        pendingApproval?: boolean;
        message?: string;
      };

      if (!res.ok) {
        setError(
          data.error || "Não foi possível enviar a solicitação de cadastro."
        );
        return;
      }

      setRegName("");
      setRegEmail("");
      setRegPassword("");
      setRegSuccess(
        "Solicitação enviada! Aguarde a aprovação de qualquer administrador (válida por 24h; limite de 3 por dia)."
      );
    } catch {
      setError("Erro de conexão ao solicitar cadastro. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[var(--color-bg-main)] px-4 py-10">
      {/* Top-right Accessibility & Theme Controls */}
      <div className="fixed top-4 right-4 z-20 flex items-center gap-2">
        <div
          className="flex items-center gap-1.5"
          role="group"
          aria-label="Controle de tamanho de fonte"
        >
          <button
            type="button"
            onClick={decreaseFont}
            disabled={isMinFont}
            title="Diminuir tamanho da fonte"
            aria-label="Diminuir tamanho da fonte (A-)"
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2.5 py-1.5 text-xs font-bold text-[var(--color-text-main)] shadow-2xs hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800"
          >
            A-
          </button>
          <button
            type="button"
            onClick={increaseFont}
            disabled={isMaxFont}
            title="Aumentar tamanho da fonte"
            aria-label="Aumentar tamanho da fonte (A+)"
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2.5 py-1.5 text-xs font-bold text-[var(--color-text-main)] shadow-2xs hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800"
          >
            A+
          </button>
          {fontScale !== "100%" && (
            <button
              type="button"
              onClick={resetFont}
              title="Restaurar fonte padrão (100%)"
              aria-label="Restaurar tamanho padrão da fonte"
              className="inline-flex items-center gap-1 rounded-lg border border-[#B91C1C]/30 bg-[#B91C1C]/10 px-2 py-1.5 text-xs font-semibold text-[#B91C1C] hover:bg-[#B91C1C]/20 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              <span>{fontScale}</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={
            theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-card)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-main)] shadow-2xs hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {theme === "dark" ? (
            <>
              <Sun className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              <span>Claro</span>
            </>
          ) : (
            <>
              <Moon className="h-3.5 w-3.5 text-[#334155]" aria-hidden="true" />
              <span>Escuro</span>
            </>
          )}
        </button>
      </div>

      {/* Auth Card */}
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-card)] p-6 shadow-xl shadow-slate-200/60 sm:p-8 dark:shadow-none">
        {/* Branding */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="relative mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#B91C1C] text-white shadow-md">
            <Recycle className="h-7 w-7" aria-hidden="true" />
            <Truck
              className="absolute -right-1.5 -bottom-1.5 h-5 w-5 rounded-full bg-white p-0.5 text-[#1E293B] shadow dark:bg-[#0F172A] dark:text-[#F8FAFC]"
              aria-hidden="true"
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-main)]">
            EcoColetas
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Controle de fila de coletas e trocas via WhatsApp
          </p>
        </div>

        {/* Tabs */}
        <div
          className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800"
          role="tablist"
          aria-label="Opções de autenticação"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "login"}
            onClick={() => switchTab("login")}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all sm:text-sm ${
              tab === "login"
                ? "bg-[var(--color-surface-card)] text-[#B91C1C] shadow-xs dark:text-red-400"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]"
            }`}
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            <span>Entrar</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "register"}
            onClick={() => switchTab("register")}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all sm:text-sm ${
              tab === "register"
                ? "bg-[var(--color-surface-card)] text-[#B91C1C] shadow-xs dark:text-red-400"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]"
            }`}
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            <span>Solicitar Cadastro</span>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-[#991B1B] dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
          >
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-[#B91C1C] dark:text-red-400"
              aria-hidden="true"
            />
            <span>{error}</span>
          </div>
        )}

        {/* Success Alert */}
        {regSuccess && (
          <div
            role="status"
            className="mb-5 flex items-start gap-2.5 rounded-xl border border-[#15803D]/30 bg-green-50 px-3.5 py-3 text-sm text-[#15803D] dark:border-green-800 dark:bg-green-950/50 dark:text-green-200"
          >
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0 text-[#15803D] dark:text-green-400"
              aria-hidden="true"
            />
            <span>{regSuccess}</span>
          </div>
        )}

        {/* Login Form */}
        {tab === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
              >
                E-mail
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                placeholder="nome@ecocoletas.com.br"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3.5 py-2.5 text-sm text-[var(--color-text-main)] placeholder:text-slate-400 focus:border-[#B91C1C] focus:outline-none dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
              >
                Senha
              </label>
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3.5 py-2.5 text-sm text-[var(--color-text-main)] placeholder:text-slate-400 focus:border-[#B91C1C] focus:outline-none dark:placeholder:text-slate-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Entrando...</span>
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  <span>Entrar no painel</span>
                </>
              )}
            </button>
          </form>
        ) : (
          /* Registration Request Form */
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label
                htmlFor="reg-name"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
              >
                Nome completo
              </label>
              <input
                id="reg-name"
                type="text"
                required
                autoComplete="name"
                placeholder="Ex.: Ana Paula"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3.5 py-2.5 text-sm text-[var(--color-text-main)] placeholder:text-slate-400 focus:border-[#B91C1C] focus:outline-none dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="reg-email"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
              >
                E-mail
              </label>
              <input
                id="reg-email"
                type="email"
                required
                autoComplete="email"
                placeholder="operador@ecocoletas.com.br"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3.5 py-2.5 text-sm text-[var(--color-text-main)] placeholder:text-slate-400 focus:border-[#B91C1C] focus:outline-none dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="reg-password"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
              >
                Senha (mín. 6 caracteres)
              </label>
              <input
                id="reg-password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Crie uma senha"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3.5 py-2.5 text-sm text-[var(--color-text-main)] placeholder:text-slate-400 focus:border-[#B91C1C] focus:outline-none dark:placeholder:text-slate-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Enviando solicitação...</span>
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  <span>Solicitar Cadastro</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
