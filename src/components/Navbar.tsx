"use client";

import React from "react";
import {
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
import { InstallAppButton } from "@/components/InstallAppButton";

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
    "bg-[#B91C1C]/10 text-[#B91C1C] border-[#B91C1C]/30 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800",
  ADMIN:
    "bg-[#1E293B]/10 text-[#1E293B] border-[#334155]/30 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600",
  OPERATOR:
    "bg-[#15803D]/10 text-[#15803D] border-[#15803D]/30 dark:bg-green-950/60 dark:text-green-300 dark:border-green-800",
};

export function Navbar({ user }: NavbarProps) {
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

  const isMinFont = fontScale === FONT_SCALES[0];
  const isMaxFont = fontScale === FONT_SCALES[FONT_SCALES.length - 1];

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-bg-alt)]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#B91C1C] text-white shadow-sm">
            <Recycle className="h-5 w-5" aria-hidden="true" />
            <Truck
              className="absolute -right-1 -bottom-1 h-4 w-4 rounded-full bg-white p-0.5 text-[#1E293B] shadow dark:bg-[#0F172A] dark:text-[#F8FAFC]"
              aria-hidden="true"
            />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-[var(--color-text-main)]">
              EcoColetas
            </h1>
            <p className="text-xs text-[var(--color-text-muted)]">
              Gestão de Coletas e Trocas
            </p>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* Font Accessibility Controls — Standalone A- and A+ */}
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

          {/* PWA Install Shortcut */}
          <InstallAppButton />

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
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-main)] shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {soundEnabled ? (
              <>
                <Volume2
                  className="h-3.5 w-3.5 text-[#15803D] dark:text-green-400"
                  aria-hidden="true"
                />
                <span>Som</span>
              </>
            ) : (
              <>
                <VolumeX
                  className="h-3.5 w-3.5 text-[var(--color-text-muted)]"
                  aria-hidden="true"
                />
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-main)] shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-800"
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

          {/* User Info + Role Badge */}
          <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-1.5">
            <UserIcon
              className="h-4 w-4 text-[var(--color-text-muted)]"
              aria-hidden="true"
            />
            <span className="max-w-[140px] truncate text-xs font-semibold text-[var(--color-text-main)]">
              {user.name}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ROLE_BADGE_STYLES[user.role]}`}
            >
              {ROLE_LABELS[user.role]}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
