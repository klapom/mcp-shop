/**
 * Team tab (Wertstrom + Stream-Lead, roster info) and the version history.
 *
 * Wertstrom/Stream-Lead only feed Helga's team roster (list_personas/describe_persona);
 * nothing of it ends up in a persona's prompt.
 */
import { useEffect, useState } from 'preact/hooks';
import { getCoPersonas, getVersions, type PersonaSpec, type VersionEntry } from '../../lib/shopApi';

const inputCls =
  'w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30';

// ---------------------------------------------------------------------------
// Team (roster info)
// ---------------------------------------------------------------------------

interface TeamProps {
  draft: PersonaSpec;
  onChange: (patch: Partial<PersonaSpec>) => void;
}

export function StreamTab({ draft, onChange }: TeamProps) {
  const [coPersonas, setCoPersonas] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCoPersonas(null);
    setError(null);
    getCoPersonas(draft.key)
      .then((r) => setCoPersonas(r.co_personas))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [draft.key]);

  return (
    <div class="space-y-5">
      <p class="text-xs text-white/40" data-testid="team-hint">
        Nur Roster-Info für Helga („wer ist im Team, wer macht was“). Steht nicht im Prompt der
        Persona.
      </p>

      <div>
        <label class="mb-1 block text-xs font-medium text-white/60">Wertstrom</label>
        <input
          type="text"
          value={draft.wertstrom ?? ''}
          onInput={(e) => onChange({ wertstrom: (e.target as HTMLInputElement).value || null })}
          placeholder="vertrieb"
          class={inputCls}
        />
      </div>

      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={draft.stream_lead}
          onChange={(e) => onChange({ stream_lead: (e.target as HTMLInputElement).checked })}
          class="h-4 w-4 rounded accent-[#E96C00]"
        />
        <span class="text-sm text-white/80">Leitet diesen Wertstrom</span>
      </label>

      <div>
        <div class="mb-1 text-xs font-medium text-white/60">Weitere Personas im selben Wertstrom</div>
        {error && <div class="text-sm text-amber-300/80">nicht abrufbar: {error}</div>}
        {!error && !coPersonas && <div class="text-xs text-white/40 animate-pulse">lädt …</div>}
        {coPersonas && coPersonas.length === 0 && <p class="text-sm text-white/30 italic">keine</p>}
        {coPersonas && coPersonas.length > 0 && (
          <ul class="flex flex-wrap gap-2">
            {coPersonas.map((cp) => (
              <li key={cp} class="rounded-full bg-white/5 px-3 py-1 font-mono text-xs text-white/70">
                {cp}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Version history
// ---------------------------------------------------------------------------

export function HistoryTab({ personaKey }: { personaKey: string }) {
  const [versions, setVersions] = useState<VersionEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Entries are identified by created_at: `version` repeats (it is the old bundle stamp).
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = () => {
    setVersions(null);
    setError(null);
    getVersions(personaKey)
      .then((r) => setVersions(r.versions))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };

  useEffect(load, [personaKey]);

  if (error) {
    return (
      <div class="text-sm text-amber-300/80">
        Verlauf nicht abrufbar: {error}{' '}
        <button type="button" onClick={load} class="underline hover:text-amber-200">
          erneut
        </button>
      </div>
    );
  }

  if (!versions) {
    return <div class="text-xs text-white/40 animate-pulse">lädt …</div>;
  }

  if (versions.length === 0) {
    return <p class="text-sm text-white/30 italic">Noch keine Versionen aufgezeichnet.</p>;
  }

  return (
    <ul class="space-y-2 border-l border-white/10 pl-3" data-testid="history">
      {versions.map((v) => (
        <li key={v.created_at} class="text-xs" data-testid="history-entry">
          <div class="flex items-baseline gap-2">
            <span class="text-white/70 shrink-0">{fmtDate(v.created_at)}</span>
            <span class="text-white truncate max-w-md">{v.change_note || <i class="text-white/30">ohne Notiz</i>}</span>
            {v.version && <span class="font-mono text-white/30">{v.version}</span>}
            <button
              type="button"
              onClick={() => setExpanded(expanded === v.created_at ? null : v.created_at)}
              class="ml-auto shrink-0 text-white/30 hover:text-white/60 underline"
            >
              {expanded === v.created_at ? 'weniger' : 'JSON'}
            </button>
          </div>
          {expanded === v.created_at && (
            <pre class="mt-1 overflow-auto rounded bg-black/40 p-2 text-[10px] text-white/60 max-h-48" data-testid="history-json">
              {prettySnapshot(v.snapshot)}
            </pre>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The store keeps the snapshot as a JSON string — pretty-print it either way. */
function prettySnapshot(s: unknown): string {
  if (typeof s === 'string') {
    try {
      return JSON.stringify(JSON.parse(s), null, 2);
    } catch {
      return s;
    }
  }
  return JSON.stringify(s, null, 2);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
