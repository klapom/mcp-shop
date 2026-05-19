import { useMemo, useState } from 'preact/hooks';
import { PERSONAS } from '../../lib/personas.generated';
import { loadState, saveState } from '../../lib/wizard-state';
import { WERTSTROEME, getWertstrom, wertstromSortKey } from '../../lib/wertstroeme';

interface Props {
  onNext: () => void;
  onBack: () => void;
}

export default function PersonaSelect({ onNext, onBack }: Props) {
  const state = loadState();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(state.selectedPersonas ?? [])
  );
  const [activeStreams, setActiveStreams] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  // Sortiert nach Wertstrom-ID, dann Display-Name.
  const sortedPersonas = useMemo(() => {
    return [...PERSONAS].sort((a, b) => {
      const sa = wertstromSortKey(a.wertstrom);
      const sb = wertstromSortKey(b.wertstrom);
      if (sa !== sb) return sa - sb;
      return a.displayName.localeCompare(b.displayName, 'de');
    });
  }, []);

  // Wertströme die mind. eine Persona haben → für die Filter-Chips.
  const populatedStreams = useMemo(() => {
    const slugs = new Set(PERSONAS.map((p) => p.wertstrom));
    return WERTSTROEME.filter((w) => slugs.has(w.slug));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortedPersonas.filter((p) => {
      if (activeStreams.size > 0 && !activeStreams.has(p.wertstrom)) return false;
      if (!q) return true;
      const w = getWertstrom(p.wertstrom);
      const haystack = [
        p.key,
        p.displayName,
        p.descShort,
        p.wertstrom,
        w?.title ?? '',
        ...(p.tags ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [sortedPersonas, activeStreams, query]);

  function togglePersona(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleStream(slug: string) {
    setActiveStreams((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function clearFilters() {
    setActiveStreams(new Set());
    setQuery('');
  }

  function handleNext() {
    saveState({ selectedPersonas: [...selected] });
    onNext();
  }

  return (
    <div>
      <h2 class="text-2xl font-bold text-white mb-2">Personas auswählen</h2>
      <p class="text-gray-400 mb-4">
        Wählen Sie die KI-Agenten, die Sie für Ihr Unternehmen aktivieren möchten.
        {selected.size > 0 && (
          <span class="ml-2 text-indigo-400 font-medium">{selected.size} ausgewählt</span>
        )}
      </p>

      {/* Filter-Block */}
      <div class="mb-5 space-y-3">
        <div class="relative">
          <input
            type="text"
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            placeholder="Suche: Name, Rolle, Tag, Wertstrom …"
            class="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 pl-10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <svg
            class="absolute left-3 top-3 w-4 h-4 text-gray-500"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0z" />
          </svg>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          {populatedStreams.map((w) => {
            const isActive = activeStreams.has(w.slug);
            return (
              <button
                key={w.slug}
                type="button"
                onClick={() => toggleStream(w.slug)}
                class={`text-xs rounded-full px-3 py-1 border transition-colors ${
                  isActive
                    ? `${w.textAccent} border-current`
                    : 'text-gray-400 border-white/15 hover:border-white/30'
                }`}
              >
                <span class="opacity-60 mr-1">{w.id}</span>
                {w.title}
              </button>
            );
          })}
          {(activeStreams.size > 0 || query) && (
            <button
              type="button"
              onClick={clearFilters}
              class="text-xs text-gray-500 hover:text-gray-300 underline"
            >
              Filter zurücksetzen
            </button>
          )}
        </div>

        {filtered.length === 0 && (
          <div class="text-sm text-gray-500 italic">
            Keine Personas passen zu diesem Filter. Filter zurücksetzen, um alle 16 zu sehen.
          </div>
        )}
      </div>

      {/* Grid */}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {filtered.map((p) => {
          const isSelected = selected.has(p.key);
          const w = getWertstrom(p.wertstrom);
          const accentClass = w?.accent ?? 'border-white/10';
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => togglePersona(p.key)}
              data-persona-key={p.key}
              class={`text-left rounded-xl border border-white/10 border-l-4 ${accentClass} p-4 transition-all ${
                isSelected
                  ? 'bg-indigo-900/30 ring-1 ring-indigo-500'
                  : 'bg-white/5 hover:bg-white/8'
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
                  {w && (
                    <div class={`mt-1.5 inline-block text-[10px] rounded px-1.5 py-0.5 ${w.textAccent}`}>
                      {w.id} · {w.title}
                    </div>
                  )}
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
