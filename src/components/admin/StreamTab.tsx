/**
 * H4 — Stream tab: derived co-personas (read-only) + version history.
 */
import { useEffect, useState } from 'preact/hooks';
import { getCoPersonas, getVersions, type VersionEntry } from '../../lib/shopApi';

// ---------------------------------------------------------------------------
// Stream co-personas (read-only)
// ---------------------------------------------------------------------------

export function StreamTab({ personaKey }: { personaKey: string }) {
  const [coPersonas, setCoPersonas] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCoPersonas(null);
    setError(null);
    getCoPersonas(personaKey)
      .then((r) => setCoPersonas(r.co_personas))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [personaKey]);

  return (
    <div class="space-y-3">
      <p class="text-xs text-white/40">
        Co-Personas werden automatisch aus Wertstrom-Zugehörigkeit abgeleitet (P37). Diese
        Ansicht ist read-only — Änderungen via Wertstrom-Feld im Verhalten-Tab.
      </p>

      {error && (
        <div class="text-sm text-amber-300/80">Co-Personas nicht abrufbar: {error}</div>
      )}

      {!error && !coPersonas && (
        <div class="text-xs text-white/40 animate-pulse">lädt …</div>
      )}

      {coPersonas && coPersonas.length === 0 && (
        <p class="text-sm text-white/30 italic">
          Keine Co-Personas im gleichen Wertstrom oder kein Stream-Lead.
        </p>
      )}

      {coPersonas && coPersonas.length > 0 && (
        <ul class="flex flex-wrap gap-2">
          {coPersonas.map((cp) => (
            <li
              key={cp}
              class="rounded-full bg-white/5 px-3 py-1 font-mono text-xs text-white/70"
            >
              {cp}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Version history
// ---------------------------------------------------------------------------

export function HistoryTab({ personaKey }: { personaKey: string }) {
  const [versions, setVersions] = useState<VersionEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    return (
      <p class="text-sm text-white/30 italic">Noch keine Versionen aufgezeichnet.</p>
    );
  }

  return (
    <ul class="space-y-2 border-l border-white/10 pl-3">
      {versions.map((v) => (
        <li key={v.version} class="text-xs">
          <div class="flex items-baseline gap-2">
            <span class="font-mono text-white">{v.version}</span>
            {v.change_note && (
              <span class="text-white/60 truncate max-w-xs">{v.change_note}</span>
            )}
            <span class="text-white/30 ml-auto shrink-0">{fmtDate(v.created_at)}</span>
            <button
              type="button"
              onClick={() => setExpanded(expanded === v.version ? null : v.version)}
              class="shrink-0 text-white/30 hover:text-white/60 underline"
            >
              {expanded === v.version ? 'weniger' : 'JSON'}
            </button>
          </div>
          {expanded === v.version && (
            <pre class="mt-1 overflow-auto rounded bg-black/40 p-2 text-[10px] text-white/60 max-h-48">
              {JSON.stringify(v.snapshot, null, 2)}
            </pre>
          )}
        </li>
      ))}
    </ul>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
