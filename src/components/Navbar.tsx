"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ClipboardCopy,
  Download,
  Moon,
  RotateCcw,
  Settings,
  Sun,
  User as UserIcon,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AuthUser } from "@/types";
import { FONT_SCALES, usePreferences } from "@/components/ThemeProvider";
import { InstallAppButton } from "@/components/InstallAppButton";

interface NavbarProps {
  user: AuthUser;
  onCopyDailyRoute?: () => void;
  onExportCsv?: () => void;
}

const ROLE_LABELS: Record<"ADMIN" | "OPERATOR", string> = {
  ADMIN: "Administrador",
  OPERATOR: "Operador",
};

const ROLE_BADGE_STYLES: Record<"ADMIN" | "OPERATOR", string> = {
  ADMIN:
    "bg-[#1E293B]/10 text-[#1E293B] border-[#334155]/30 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600",
  OPERATOR:
    "bg-[#15803D]/10 text-[#15803D] border-[#15803D]/30 dark:bg-green-950/60 dark:text-green-300 dark:border-green-800",
};

export function Navbar({
  user,
  onCopyDailyRoute,
  onExportCsv,
}: NavbarProps) {
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

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isMinFont = fontScale === FONT_SCALES[0];
  const isMaxFont = fontScale === FONT_SCALES[FONT_SCALES.length - 1];

  useEffect(() => {
    if (!menuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-bg-alt)]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <img
            src="/logo-schifter.png"
            alt="Schifter Coletas"
            className="h-10 w-auto max-w-[160px] object-contain"
          />
          <div>
            <h1 className="text-lg font-bold tracking-tight text-[var(--color-text-main)]">
              Schifter Coletas
            </h1>
            <p className="text-xs text-[var(--color-text-muted)]">
              Gestão de Coletas e Trocas
            </p>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* User Info + Subtle Role Pill (never show ADMIN_MASTER) */}
          <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-1.5">
            <UserIcon
              className="h-4 w-4 text-[var(--color-text-muted)]"
              aria-hidden="true"
            />
            <span className="max-w-[140px] truncate text-xs font-semibold text-[var(--color-text-main)]">
              {user.name}
            </span>
            {(user.role === "ADMIN" || user.role === "OPERATOR") && (
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ROLE_BADGE_STYLES[user.role]}`}
              >
                {ROLE_LABELS[user.role]}
              </span>
            )}
          </div>

          {/* Gear Settings Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="Preferências e configurações"
              title="Preferências e configurações"
              className="inline-flex items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-card)] p-2 text-[var(--color-text-main)] shadow-2xs hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                aria-label="Menu de preferências"
                className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4 shadow-xl shadow-slate-900/10 dark:shadow-2xl dark:shadow-black/60"
              >
                <div className="space-y-3.5">
                  {/* Theme Toggle */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--color-text-main)]">
                      Tema
                    </span>
                    <button
                      type="button"
                      onClick={toggleTheme}
                      aria-label={
                        theme === "dark"
                          ? "Mudar para tema claro"
                          : "Mudar para tema escuro"
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-main)] hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {theme === "dark" ? (
                        <>
                          <Sun
                            className="h-3.5 w-3.5 text-amber-400"
                            aria-hidden="true"
                          />
                          <span>Claro</span>
                        </>
                      ) : (
                        <>
                          <Moon
                            className="h-3.5 w-3.5 text-[#334155]"
                            aria-hidden="true"
                          />
                          <span>Escuro</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Font Size Controls */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--color-text-main)]">
                      Tamanho da fonte
                    </span>
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
                        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] px-2.5 py-1 text-xs font-bold text-[var(--color-text-main)] hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800"
                      >
                        A-
                      </button>
                      <button
                        type="button"
                        onClick={increaseFont}
                        disabled={isMaxFont}
                        title="Aumentar tamanho da fonte"
                        aria-label="Aumentar tamanho da fonte (A+)"
                        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] px-2.5 py-1 text-xs font-bold text-[var(--color-text-main)] hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800"
                      >
                        A+
                      </button>
                      {fontScale !== "100%" && (
                        <button
                          type="button"
                          onClick={resetFont}
                          title="Restaurar fonte padrão (100%)"
                          aria-label="Restaurar tamanho padrão da fonte"
                          className="inline-flex items-center gap-1 rounded-lg border border-[#B91C1C]/30 bg-[#B91C1C]/10 px-2 py-1 text-xs font-semibold text-[#B91C1C] hover:bg-[#B91C1C]/20 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                        >
                          <RotateCcw className="h-3 w-3" aria-hidden="true" />
                          <span>{fontScale}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Sound Toggle */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--color-text-main)]">
                      Notificações sonoras
                    </span>
                    <button
                      type="button"
                      onClick={toggleSound}
                      aria-label={
                        soundEnabled
                          ? "Silenciar notificações"
                          : "Ativar som de notificações"
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-main)] hover:bg-slate-100 dark:hover:bg-slate-800"
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
                  </div>

                  {/* Admin Actions (inside Gear menu) */}
                  {(onCopyDailyRoute || onExportCsv) && (
                    <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                        Ações operacionais
                      </p>
                      {onCopyDailyRoute && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onCopyDailyRoute();
                            setMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-xs font-semibold text-[var(--color-text-main)] hover:bg-slate-100 dark:hover:bg-slate-800/80"
                        >
                          <ClipboardCopy
                            className="h-3.5 w-3.5 text-[var(--color-text-muted)]"
                            aria-hidden="true"
                          />
                          <span>Copiar rota do dia</span>
                        </button>
                      )}
                      {onExportCsv && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onExportCsv();
                            setMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-xs font-semibold text-[var(--color-text-main)] hover:bg-slate-100 dark:hover:bg-slate-800/80"
                        >
                          <Download
                            className="h-3.5 w-3.5 text-[var(--color-text-muted)]"
                            aria-hidden="true"
                          />
                          <span>Exportar CSV</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Install App Button */}
                  <div className="border-t border-[var(--color-border)] pt-3">
                    <InstallAppButton />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
