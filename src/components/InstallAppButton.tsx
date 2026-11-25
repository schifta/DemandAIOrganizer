"use client";

import React, { useEffect, useRef, useState } from "react";
import { Download, Smartphone, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Ignore service worker registration errors
      });
    }

    const standaloneMatch = window.matchMedia(
      "(display-mode: standalone)"
    ).matches;
    const iosStandalone =
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standaloneMatch || iosStandalone) {
      setIsInstalled(true);
    }

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowInstructions(false);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!showInstructions) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowInstructions(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowInstructions(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showInstructions]);

  if (isInstalled) {
    return null;
  }

  async function handleClick() {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setIsInstalled(true);
        }
        setDeferredPrompt(null);
        return;
      } catch {
        // Fallback to manual instructions if prompt fails
      }
    }
    setShowInstructions((prev) => !prev);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={handleClick}
        title="Instalar aplicativo no dispositivo"
        aria-label="Instalar App"
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#B91C1C]/30 bg-[#B91C1C]/10 px-2.5 py-1.5 text-xs font-semibold text-[#B91C1C] hover:bg-[#B91C1C] hover:text-white dark:border-red-500/40 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-[#B91C1C] dark:hover:text-white"
      >
        {deferredPrompt ? (
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span>Instalar App</span>
      </button>

      {showInstructions && (
        <div
          role="dialog"
          aria-label="Instruções para instalar o aplicativo"
          className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-card)] p-3.5 text-xs text-[var(--color-text-main)] shadow-lg"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="font-bold text-[#B91C1C] dark:text-red-400">
              Como instalar o Schifter Coletas
            </span>
            <button
              type="button"
              onClick={() => setShowInstructions(false)}
              aria-label="Fechar instruções"
              className="rounded-md p-0.5 text-[var(--color-text-muted)] hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <p className="leading-relaxed text-[var(--color-text-muted)]">
            No iPhone/Safari: toque em <strong>Compartilhar</strong> →{" "}
            <strong>Adicionar à Tela de Início</strong>. No Chrome/Edge: use o
            ícone de instalar na barra de endereço.
          </p>
        </div>
      )}
    </div>
  );
}
