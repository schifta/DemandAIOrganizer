"use client";

import React, { FormEvent, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  X,
} from "lucide-react";

interface WebhookSimulatorProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderCreated: () => Promise<void> | void;
}

interface QuickPreset {
  label: string;
  phone: string;
  senderName: string;
  text: string;
}

const QUICK_PRESETS: QuickPreset[] = [
  {
    label: "Troca de caixa (Carlos Silva)",
    phone: "5511999990001",
    senderName: "Carlos Silva",
    text: "Preciso da troca de uma caixa/caçamba",
  },
  {
    label: "Coleta 8 tambores (Mariana)",
    phone: "5511999990002",
    senderName: "Mariana",
    text: "Oi, sou a Mariana, preciso de uma coleta de 8 tambores",
  },
  {
    label: "Contato desconhecido (Empresa Nova)",
    phone: "5511999990099",
    senderName: "João",
    text: "Olá, sou João da Empresa Nova, preciso coletar 3 caçambas",
  },
];

export function WebhookSimulator({
  isOpen,
  onClose,
  onOrderCreated,
}: WebhookSimulatorProps) {
  const [phone, setPhone] = useState("5511999990001");
  const [senderName, setSenderName] = useState("Carlos Silva");
  const [text, setText] = useState("Preciso da troca de uma caixa/caçamba");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultJson, setResultJson] = useState<Record<string, unknown> | null>(
    null
  );

  if (!isOpen) return null;

  function applyPreset(preset: QuickPreset) {
    setPhone(preset.phone);
    setSenderName(preset.senderName);
    setText(preset.text);
    setError(null);
    setResultJson(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResultJson(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          senderName: senderName.trim(),
          text: text.trim(),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Erro ao simular recebimento do WhatsApp."
        );
        return;
      }

      setResultJson(data);
      await onOrderCreated();
    } catch {
      setError("Erro de conexão ao enviar simulação.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="webhook-simulator-title"
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="webhook-simulator-title"
                className="text-lg font-bold text-slate-900 dark:text-white"
              >
                Simular Mensagem WhatsApp
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Testa o parser NLP e adiciona o pedido automaticamente na fila
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar simulador"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Quick-fill Presets */}
        <div className="mb-5">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Sparkles className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            <span>Exemplos rápidos</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {QUICK_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="sim-phone"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
              >
                Telefone (WhatsApp)
              </label>
              <input
                id="sim-phone"
                type="text"
                required
                placeholder="5511999990001"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="sim-name"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
              >
                Nome do Remetente
              </label>
              <input
                id="sim-name"
                type="text"
                required
                placeholder="Carlos Silva"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="sim-text"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
            >
              Mensagem recebida
            </label>
            <textarea
              id="sim-text"
              rows={3}
              required
              placeholder="Ex.: Preciso da troca de uma caixa/caçamba"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-600"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Processando...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" aria-hidden="true" />
                  <span>Enviar para Webhook</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Extracted Result */}
        {resultJson && (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 dark:border-emerald-900/60 dark:bg-emerald-950/40">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>Pedido criado e extraído com sucesso!</span>
            </div>
            <pre className="max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] text-emerald-300">
              {JSON.stringify(resultJson.extracted ?? resultJson, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
