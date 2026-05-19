import { loadState } from '../../lib/wizard-state';
import type { AuditGap } from '../../lib/wizard-state';

interface Props {
  onNext: () => void;
  onBack: () => void;
}

const SEVERITY_COLORS: Record<AuditGap['severity'], string> = {
  high: 'bg-red-900/40 border-red-700 text-red-300',
  medium: 'bg-yellow-900/40 border-yellow-700 text-yellow-300',
  low: 'bg-blue-900/30 border-blue-700 text-blue-300',
};

const SEVERITY_LABEL: Record<AuditGap['severity'], string> = {
  high: 'Hoch',
  medium: 'Mittel',
  low: 'Niedrig',
};

export default function AuditReport({ onNext, onBack }: Props) {
  const state = loadState();
  const report = state.audit;

  if (!report) {
    return (
      <div>
        <h2 class="text-2xl font-bold text-white mb-4">Audit-Report</h2>
        <p class="text-gray-400">Kein Audit-Ergebnis vorhanden. Bitte Schritt 3 erneut durchführen.</p>
        <button
          type="button"
          onClick={onBack}
          class="mt-4 rounded-lg border border-white/20 px-6 py-2.5 text-gray-300 hover:bg-white/5 transition-colors"
        >
          Zurück
        </button>
      </div>
    );
  }

  const isStub = report._stub === true;
  const score = report.source_coverage_score;
  const scoreLabel =
    isStub || typeof score !== 'number' || !Number.isFinite(score)
      ? '—'
      : `${Math.round(score * 100)}%`;
  const gapCount = report.gap_count ?? report.gaps?.length ?? 0;
  const recCount = report.recommendation_count ?? report.recommendations?.length ?? 0;
  const gaps = report.gaps ?? [];
  const recommendations = report.recommendations ?? [];

  return (
    <div>
      <h2 class="text-2xl font-bold text-white mb-2">Audit-Report</h2>
      {isStub && (
        <div class="mb-4 rounded-lg bg-indigo-900/30 border border-indigo-600/50 px-4 py-3 text-indigo-200 text-sm">
          <div class="font-semibold mb-1">Audit noch nicht aktiv</div>
          <div class="text-indigo-300/80">
            Der Live-Wissens-Audit benötigt die hermes-rest-Anbindung. Im
            MVP-Stand sehen Sie hier einen Platzhalter — das Wizard läuft trotzdem
            durch. Aktivierung in Sprint P10.
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div class="grid grid-cols-3 gap-4 mb-8">
        <div class="rounded-xl bg-white/5 border border-white/10 p-4 text-center">
          <div class="text-3xl font-bold text-indigo-400">{scoreLabel}</div>
          <div class="text-xs text-gray-400 mt-1">Wissens-Abdeckung</div>
        </div>
        <div class="rounded-xl bg-white/5 border border-white/10 p-4 text-center">
          <div class="text-3xl font-bold text-red-400">{gapCount}</div>
          <div class="text-xs text-gray-400 mt-1">Wissenslücken</div>
        </div>
        <div class="rounded-xl bg-white/5 border border-white/10 p-4 text-center">
          <div class="text-3xl font-bold text-green-400">{recCount}</div>
          <div class="text-xs text-gray-400 mt-1">Empfehlungen</div>
        </div>
      </div>

      {/* Gaps */}
      {gaps.length > 0 && (
        <div class="mb-6">
          <h3 class="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">Wissenslücken</h3>
          <div class="space-y-2">
            {gaps.map((gap, i) => (
              <div
                key={i}
                class={`rounded-lg border px-4 py-3 flex items-start gap-3 ${SEVERITY_COLORS[gap.severity] ?? SEVERITY_COLORS.low}`}
              >
                <span class="text-xs font-semibold mt-0.5 flex-shrink-0">
                  {SEVERITY_LABEL[gap.severity] ?? gap.severity}
                </span>
                <span class="text-sm">{gap.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div class="mb-8">
          <h3 class="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">Empfehlungen</h3>
          <ul class="space-y-2">
            {recommendations.map((rec, i) => (
              <li key={i} class="flex items-start gap-2 text-sm text-gray-300">
                <span class="text-green-400 flex-shrink-0 mt-0.5">→</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div class="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          class="rounded-lg border border-white/20 px-6 py-2.5 text-gray-300 hover:bg-white/5 transition-colors"
        >
          Zurück
        </button>
        <button
          type="button"
          onClick={onNext}
          class="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 font-semibold text-white transition-colors"
        >
          Weiter zur Persona-Personalisierung
        </button>
      </div>
    </div>
  );
}
