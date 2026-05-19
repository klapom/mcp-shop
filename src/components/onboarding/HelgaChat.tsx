import { useState } from 'preact/hooks';
import { loadState, saveState } from '../../lib/wizard-state';
import { runAudit } from '../../lib/api';
import type { AuditReport } from '../../lib/wizard-state';

// TODO: Replace scripted chat with real SSE stream from hermes-rest once
// the chat endpoint is production-ready. Endpoint will be:
//   GET /tenants/{id}/chat/stream?persona=helga&message=<user_msg>
// Response: text/event-stream with data: {delta: "...", done: bool}
// Use EventSource API in the browser.

interface ChatMessage {
  role: 'helga' | 'user';
  text: string;
}

interface Props {
  onNext: (report: AuditReport) => void;
  onBack: () => void;
}

const STUB_REPORT: AuditReport = {
  source_coverage_score: 0.72,
  gap_count: 3,
  recommendation_count: 4,
  gaps: [
    { severity: 'high', description: 'Keine IT-Service-Catalog-Dokumentation gefunden.' },
    { severity: 'medium', description: 'Unvollständige Prozess-Beschreibungen für Ticketing-Workflows.' },
    { severity: 'low', description: 'Fehlende Eskalationspfade in Support-Handbuch.' },
  ],
  recommendations: [
    'IT-Service-Catalog als strukturiertes YAML bereitstellen.',
    'Ticketing-Prozess-Dokumentation ergänzen (Verantwortlichkeiten, SLAs).',
    'Eskalationspfade in einem separaten Dokument definieren.',
    'Glossar mit unternehmensinternen Fachbegriffen erstellen.',
  ],
  _stub: true,
};

export default function HelgaChat({ onNext, onBack }: Props) {
  const state = loadState();
  const uploadCount = state.uploads?.length ?? 0;
  const selectedCount = state.selectedPersonas?.length ?? 0;

  const initMessages: ChatMessage[] = [
    {
      role: 'helga',
      text: `Willkommen bei Pommer Agents! Ich bin Helga, eure HR-Agentin. Ich habe ${uploadCount} Dokument${uploadCount !== 1 ? 'e' : ''} gesehen und ${selectedCount} Persona${selectedCount !== 1 ? 's' : ''} ausgewählt. Soll ich einen Wissens-Audit starten?`,
    },
  ];

  const [messages, setMessages] = useState<ChatMessage[]>(initMessages);
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditDone, setAuditDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startAudit() {
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: 'Ja, starte den Audit.' },
      { role: 'helga', text: 'Perfekt! Ich analysiere jetzt eure Dokumente …' },
    ]);
    setAuditRunning(true);
    setError(null);

    let report: AuditReport;

    if (!state.tenantId || !state.token) {
      // No real tenant — use stub
      report = STUB_REPORT;
      await new Promise((r) => setTimeout(r, 800));
    } else {
      try {
        report = await runAudit(state.tenantId, state.token);
      } catch {
        // API not ready — fall back to stub
        report = STUB_REPORT;
      }
    }

    saveState({ audit: report });

    setMessages((prev) => [
      ...prev,
      {
        role: 'helga',
        text: `Audit abgeschlossen! Coverage-Score: ${Math.round(report.source_coverage_score * 100)}%. Ich habe ${report.gap_count} Gap${report.gap_count !== 1 ? 's' : ''} und ${report.recommendation_count} Empfehlung${report.recommendation_count !== 1 ? 'en' : ''} gefunden.${report._stub ? ' (Demo-Ergebnis — Live-Audit folgt mit hermes-rest-Integration)' : ''}`,
      },
    ]);
    setAuditRunning(false);
    setAuditDone(true);

    // Auto-advance after short delay to show result
    setTimeout(() => onNext(report), 1200);
  }

  return (
    <div>
      <h2 class="text-2xl font-bold text-white mb-2">Wissens-Audit mit Helga</h2>
      <p class="text-gray-400 mb-6">Helga analysiert eure Dokumente und gibt euch Feedback.</p>

      {/* Chat window */}
      <div class="rounded-xl border border-white/10 bg-white/3 p-4 space-y-4 mb-6 min-h-[220px]">
        {messages.map((msg, i) => (
          <div key={i} class={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {msg.role === 'helga' && (
              <img
                src="/personas/helga-default.webp"
                alt="Helga"
                class="w-9 h-9 rounded-full object-cover flex-shrink-0 mt-0.5"
              />
            )}
            <div
              class={`rounded-xl px-4 py-2.5 max-w-sm text-sm ${
                msg.role === 'helga'
                  ? 'bg-indigo-900/50 text-gray-200'
                  : 'bg-white/10 text-gray-200'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {auditRunning && (
          <div class="flex gap-3">
            <img
              src="/personas/helga-default.webp"
              alt="Helga"
              class="w-9 h-9 rounded-full object-cover flex-shrink-0"
            />
            <div class="rounded-xl bg-indigo-900/50 px-4 py-2.5 text-gray-300 text-sm flex items-center gap-2">
              <span class="animate-pulse">●</span>
              <span class="animate-pulse" style="animation-delay: 0.2s">●</span>
              <span class="animate-pulse" style="animation-delay: 0.4s">●</span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div class="mb-4 rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div class="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={auditRunning}
          class="rounded-lg border border-white/20 px-6 py-2.5 text-gray-300 hover:bg-white/5 disabled:opacity-50 transition-colors"
        >
          Zurück
        </button>
        {!auditDone && (
          <button
            type="button"
            id="start-audit-btn"
            onClick={startAudit}
            disabled={auditRunning}
            class="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2.5 font-semibold text-white transition-colors"
          >
            {auditRunning ? 'Audit läuft …' : 'Ja, starte Audit'}
          </button>
        )}
        {auditDone && (
          <div class="text-green-400 flex items-center gap-2 text-sm">
            <span>✓</span> Audit abgeschlossen — weiter …
          </div>
        )}
      </div>
    </div>
  );
}
