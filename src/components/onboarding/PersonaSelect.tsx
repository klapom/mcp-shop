import { useState } from 'preact/hooks';
import { PERSONAS } from '../../lib/personas.generated';
import { loadState, saveState } from '../../lib/wizard-state';

interface Props {
  onNext: () => void;
  onBack: () => void;
}

// Shorten wertstrom for display: take the part after the hyphen-separated number prefix
function formatWertstrom(w: string): string {
  const parts = w.split('-');
  if (parts.length > 1) return parts.slice(1).join('-');
  return w;
}

export default function PersonaSelect({ onNext, onBack }: Props) {
  const state = loadState();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(state.selectedPersonas ?? [])
  );

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleNext() {
    saveState({ selectedPersonas: [...selected] });
    onNext();
  }

  return (
    <div>
      <h2 class="text-2xl font-bold text-white mb-2">Personas auswählen</h2>
      <p class="text-gray-400 mb-6">
        Wählen Sie die KI-Agenten, die Sie für Ihr Unternehmen aktivieren möchten.
        {selected.size > 0 && (
          <span class="ml-2 text-indigo-400 font-medium">{selected.size} ausgewählt</span>
        )}
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {PERSONAS.map((p) => {
          const isSelected = selected.has(p.key);
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => toggle(p.key)}
              data-persona-key={p.key}
              class={`text-left rounded-xl border p-4 transition-all ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-900/30 ring-1 ring-indigo-500'
                  : 'border-white/10 bg-white/5 hover:border-indigo-500/50 hover:bg-white/8'
              }`}
            >
              <div class="flex items-start gap-3">
                <div class="relative flex-shrink-0">
                  <img
                    src={p.avatarUrl}
                    alt={p.displayName}
                    width={56}
                    height={56}
                    class="rounded-full object-cover w-14 h-14"
                    loading="lazy"
                  />
                  {isSelected && (
                    <span class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                      ✓
                    </span>
                  )}
                </div>
                <div class="min-w-0">
                  <div class="font-semibold text-white truncate">{p.displayName}</div>
                  <div class="text-xs text-gray-400 mt-0.5 line-clamp-2">{p.descShort}</div>
                  <div class="mt-1.5 inline-block text-xs bg-white/10 rounded px-1.5 py-0.5 text-gray-400">
                    {formatWertstrom(p.wertstrom)}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

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
          onClick={handleNext}
          disabled={selected.size === 0}
          class="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2.5 font-semibold text-white transition-colors"
        >
          Auswahl bestätigen ({selected.size})
        </button>
      </div>
    </div>
  );
}
