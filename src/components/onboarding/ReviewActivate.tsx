import { useState } from 'preact/hooks';
import { loadState } from '../../lib/wizard-state';
import { PERSONAS } from '../../lib/personas.generated';
import { NACE_SECTIONS } from '../../lib/nace';
import { requestActivation } from '../../lib/api';

interface Props {
  onBack: () => void;
}

export default function ReviewActivate({ onBack }: Props) {
  const state = loadState();
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<'sent' | 'queued' | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const brancheLabel = NACE_SECTIONS.find((s) => s.code === state.branche)?.label ?? state.branche ?? '—';
  const selectedPersonas = (state.selectedPersonas ?? [])
    .map((k) => PERSONAS.find((p) => p.key === k))
    .filter(Boolean);

  async function handleActivate() {
    if (!state.tenantId || !state.token) {
      setError('Keine aktive Tenant-Session — Wizard von vorne starten.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const voiceMap: Record<string, string> = {};
      for (const [key, params] of Object.entries(state.avatars ?? {})) {
        if (params?.address) voiceMap[key] = params.address;
      }
      const resp = await requestActivation(state.tenantId, state.token, {
        persona_keys: state.selectedPersonas ?? [],
        persona_voice_map: Object.keys(voiceMap).length > 0 ? voiceMap : undefined,
        upload_count: state.uploads?.length ?? 0,
        mcp_count: 0, // wird vom Backend selbst gezählt via DB
        audit_score: state.audit?.source_coverage_score ?? null,
      });
      setNotificationStatus(resp.notification_status === 'sent' ? 'sent' : 'queued');
      setSubmitted(true);
      setShowModal(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h2 class="text-2xl font-bold text-white mb-2">Zusammenfassung & Aktivierung</h2>
      <p class="text-gray-400 mb-8">Überprüfen Sie Ihre Angaben, bevor wir Pommer Consulting kontaktieren.</p>

      {/* Summary */}
      <div class="space-y-4 mb-8">
        <div class="rounded-xl bg-white/5 border border-white/10 p-5">
          <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Unternehmen</div>
          <div class="text-white font-semibold">{state.company ?? '—'}</div>
          <div class="text-gray-400 text-sm mt-0.5">{brancheLabel}</div>
        </div>

        <div class="rounded-xl bg-white/5 border border-white/10 p-5">
          <div class="text-xs text-gray-500 uppercase tracking-wide mb-3">Ausgewählte Personas ({selectedPersonas.length})</div>
          <div class="flex flex-wrap gap-3">
            {selectedPersonas.map((p) => p && (
              <div key={p.key} class="flex items-center gap-2">
                <img
                  src={state.avatars?.[p.key] ? `/personas/${p.key}-default.webp` : p.avatarUrl}
                  alt={p.displayName}
                  class="w-10 h-10 rounded-full object-cover"
                />
                <div>
                  <div class="text-white text-sm font-medium">{p.displayName}</div>
                  <div class="text-gray-500 text-xs">{p.wertstrom}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {state.audit && (
          <div class="rounded-xl bg-white/5 border border-white/10 p-5">
            <div class="text-xs text-gray-500 uppercase tracking-wide mb-3">Audit-Ergebnis</div>
            <div class="flex gap-6">
              <div>
                <div class="text-2xl font-bold text-indigo-400">
                  {Math.round(state.audit.source_coverage_score * 100)}%
                </div>
                <div class="text-xs text-gray-500">Coverage</div>
              </div>
              <div>
                <div class="text-2xl font-bold text-red-400">{state.audit.gap_count}</div>
                <div class="text-xs text-gray-500">Gaps</div>
              </div>
              <div>
                <div class="text-2xl font-bold text-green-400">{state.audit.recommendation_count}</div>
                <div class="text-xs text-gray-500">Empfehlungen</div>
              </div>
            </div>
          </div>
        )}

        {state.uploads && state.uploads.length > 0 && (
          <div class="rounded-xl bg-white/5 border border-white/10 p-5">
            <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Hochgeladene Dokumente</div>
            <div class="text-white font-semibold">{state.uploads.length} Datei{state.uploads.length !== 1 ? 'en' : ''}</div>
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
          disabled={submitting || submitted}
          class="rounded-lg border border-white/20 px-6 py-2.5 text-gray-300 hover:bg-white/5 disabled:opacity-50 transition-colors"
        >
          Zurück
        </button>
        <button
          type="button"
          onClick={handleActivate}
          disabled={submitting || submitted}
          id="activate-btn"
          class="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed px-8 py-3 font-semibold text-white text-lg transition-colors"
        >
          {submitting ? 'Wird gesendet …' : submitted ? '✓ Angefragt' : 'Pommer Consulting kontaktiert mich für Aktivierung'}
        </button>
      </div>

      {/* Success Modal */}
      {showModal && (
        <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div class="rounded-2xl bg-gray-900 border border-white/10 p-8 max-w-md w-full text-center shadow-2xl">
            <div class="text-5xl mb-4">{notificationStatus === 'sent' ? '✉️' : '✓'}</div>
            <h3 class="text-2xl font-bold text-white mb-3">Anfrage eingegangen</h3>
            <p class="text-gray-300 mb-3">
              {notificationStatus === 'sent'
                ? 'Pommer Consulting wurde per E-Mail benachrichtigt und meldet sich bei Ihnen.'
                : 'Anfrage wurde gespeichert. Der Mail-Versand wird im Hintergrund nachgezogen — Pommer Consulting sieht den Eintrag.'}
            </p>
            <p class="text-gray-500 text-xs mb-6">Tenant-ID: <code>{state.tenantId}</code></p>
            <a
              href="/"
              class="inline-block rounded-lg bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 font-semibold text-white transition-colors"
            >
              Zur Startseite
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
