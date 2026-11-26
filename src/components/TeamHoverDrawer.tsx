"use client";

import React, { useEffect, useRef, useState } from "react";
import { Users, X } from "lucide-react";
import { RegistrationRequestsPanel } from "@/components/RegistrationRequestsPanel";
import { UserManagementPanel } from "@/components/UserManagementPanel";

interface TeamHoverDrawerProps {
  companiesReloadTrigger?: number;
}

export function TeamHoverDrawer({
  companiesReloadTrigger,
}: TeamHoverDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  function openDrawer() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsOpen(true);
  }

  function scheduleClose() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  }

  return (
    <>
      {/* Discreet Floating Side Tab */}
      <button
        type="button"
        onMouseEnter={openDrawer}
        onMouseLeave={scheduleClose}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label="Abrir painel de equipe e acessos"
        title="Equipe e acessos"
        className={`fixed top-1/2 right-0 z-40 flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-l-2xl border border-r-0 border-[var(--color-border)] bg-[var(--color-surface-card)] px-2.5 py-3.5 text-xs font-bold text-[var(--color-text-main)] shadow-lg transition-all hover:bg-slate-100 dark:hover:bg-slate-800 ${
          isOpen ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <Users
          className="h-4 w-4 text-[var(--color-primary)] dark:text-red-400"
          aria-hidden="true"
        />
        <span className="[writing-mode:vertical-rl] rotate-180 tracking-wide">
          Equipe
        </span>
      </button>

      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          aria-hidden="true"
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] md:hidden"
        />
      )}

      {/* Slide-over Drawer Panel */}
      <aside
        aria-label="Gerenciamento de equipe e solicitações"
        data-reload-trigger={companiesReloadTrigger}
        onMouseEnter={openDrawer}
        onMouseLeave={scheduleClose}
        className={`fixed inset-y-0 right-0 z-50 flex w-[min(92vw,440px)] flex-col border-l border-[var(--color-border)] bg-[var(--color-bg-alt)] shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Users
              className="h-4.5 w-4.5 text-[var(--color-primary)] dark:text-red-400"
              aria-hidden="true"
            />
            <h2 className="text-sm font-bold text-[var(--color-text-main)]">
              Equipe &amp; Acessos
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Fechar painel de equipe"
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] p-1.5 text-[var(--color-text-muted)] hover:bg-slate-100 hover:text-[var(--color-text-main)] dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-5">
          <RegistrationRequestsPanel />
          <UserManagementPanel />
        </div>
      </aside>
    </>
  );
}
