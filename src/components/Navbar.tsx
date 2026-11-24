"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  LogOut,
  Moon,
  Recycle,
  RotateCcw,
  Sun,
  Truck,
  User as UserIcon,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AuthUser, UserRole } from "@/types";
import { FONT_SCALES, usePreferences } from "@/components/ThemeProvider";
import { clearSession } from "@/lib/client-auth";

interface NavbarProps {
  user: AuthUser;
}

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN_MASTER: "ADM Master",
  ADMIN: "Administrador",
  OPERATOR: "Operador",
};

const ROLE_BADGE_STYLES: Record<UserRole, string> = {
  ADMIN_MASTER:
    "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800",
  ADMIN:
    "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
  OPERATOR:
    "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800",
};

export function Navbar({ user }: NavbarProps) {
  const router = useRouter();
  const {
    theme,
    toggleTheme,
    fontScale,
    increaseFont,
    decreaseFont,
    resetFont,
    soundEnabled,
    toggleSound,
  } = usePreferences();
  const [loggingOut, setLoggingOut] = useState(false);

  const isMinFont = fontScale === FONT_SCALES[0];
  const isMaxFont = fontScale === FONT_SCALES[FONT_SCALES.length - 1];

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      clearSession();
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm dark:bg-emerald-500">
            <Recycle className="h-5 w-5" aria-hidden="true" />
            <Truck
              className="absolute -right-1 -bottom-1 h-4 w-4 rounded-full bg-white p-0.5 text-emerald-700 shadow dark:bg-slate-900 dark:text-emerald-400"
              aria-hidden="true"
            />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              EcoColetas
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Gestão de Coletas e Trocas
            </p>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Font Accessibility Controls */}
          <div
            className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800"
            role="group"
            aria-label="Controle de tamanho de fonte"
          >
            <button
              type="button"
              onClick={decreaseFont}
              disabled={isMinFont}
              title="Diminuir fonte"
              aria-label="Diminuir tamanho da fonte"
              className="rounded-md px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              A-
            </button>
            <button
              type="button"
              onClick={increaseFont}
              disabled={isMaxFont}
              title="Aumentar fonte"
              aria-label="Aumentar tamanho da fonte"
              className="rounded-md px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              A+
            </button>
            {fontScale !== "100%" && (
              <button
                type="button"
                onClick={resetFont}
                title="Restaurar fonte padrão (100%)"
                aria-label="Restaurar tamanho padrão da fonte"
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-white dark:text-emerald-400 dark:hover:bg-slate-700"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                <span>{fontScale}</span>
              </button>
            )}
          </div>

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={toggleSound}
            aria-label={
              soundEnabled
                ? "Silenciar notificações"
                : "Ativar som de notificações"
            }
            title={
              soundEnabled
                ? "Silenciar notificações"
                : "Ativar som de notificações"
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {soundEnabled ? (
              <>
                <Volume2
                  className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <span>Som</span>
              </>
            ) : (
              <>
                <VolumeX className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                <span>Silenciar</span>
              </>
            )}
          </button>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={
              theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {theme === "dark" ? (
              <>
                <Sun className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                <span>Claro</span>
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
                <span>Escuro</span>
              </>
            )}
          </button>

          {/* User Info + Role Badge */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800/80">
            <UserIcon
              className="h-4 w-4 text-slate-500 dark:text-slate-400"
              aria-hidden="true"
            />
            <span className="max-w-[140px] truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
              {user.name}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ROLE_BADGE_STYLES[user.role]}`}
            >
              {ROLE_LABELS[user.role]}
            </span>
          </div>

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-900/60"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{loggingOut ? "Saindo..." : "Sair"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
