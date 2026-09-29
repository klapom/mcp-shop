/** PersonaProposalsList — H10.13b/T44: overview of persona drafts, newest first. Text-only rendering. */

import { useEffect, useState, useCallback } from 'preact/hooks';
import {
  listPersonaProposals,
  personaDetailHref,
  PERSONA_STATE_LABELS,
  type PersonaProposalItem,
} from '../../lib/personaProposalsApi';
import { formatStamp } from '../../lib/skillProposalsApi';

const STATE_STYLE: Record<string, string> = {
  new: 'bg-sky-500/20 text-sky-300',
  adopted: 'bg-emerald-500/20 text-emerald-300',
  rejected: 'bg-red-900/40 text-red-300',
};

export function PersonaStateBadge({ state }: { state: string }) {
  return (
    <span
      data-testid="state-badge"
      class={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATE_STYLE[state] ?? 'bg-white/10 text-white/60'}`}
    >
      {PERSONA_STATE_LABELS[state] ?? state}
    </span>
  );
}

export function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function PersonaProposalsList() {
  const [items, setItems] = useState<PersonaProposalItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    listPersonaProposals()
      .then((l) => setItems([...l].sort((a, b) => Date.parse(b.created) - Date.parse(a.created) || 0)))
      .catch((e: unknown) => setError(errText(e)));
  }, []);
  useEffect(load, [load]);

  if (error) {
    return (
      <div class="rounded-xl border border-red-700/30 bg-red-900/20 p-5 text-sm text-red-200">
        Fehler: {error}{' '}
        <button type="button" onClick={load} class="underline">
          erneut
        </button>
      </div>
    );
  }
  if (!items) return <div class="text-xs text-white/40 animate-pulse">lädt …</div>;
  if (items.length === 0) {
    return <div class="rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-white/50">Keine Persona-Entwürfe vorhanden.</div>;
  }

  return (
    <div class="overflow-x-auto rounded-xl border border-white/10">
      <table class="w-full text-left text-xs">
        <thead class="bg-white/5 text-white/50">
          <tr>
            <th class="px-3 py-2">Key</th>
            <th class="px-3 py-2">Anzeigename</th>
            <th class="px-3 py-2">Zustand</th>
            <th class="px-3 py-2">Owner</th>
            <th class="px-3 py-2">Datum</th>
            <th class="px-3 py-2">Wertstrom</th>
            <th class="px-3 py-2">Skills</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.key} class="border-t border-white/5" data-testid={`pp-row-${p.key}`}>
              <td class="px-3 py-2 font-mono">
                <a href={personaDetailHref(p.key)} class="text-white hover:text-[#E96C00]">
                  {p.key}
                </a>
              </td>
              <td class="px-3 py-2">{p.display_name}</td>
              <td class="px-3 py-2">
                <PersonaStateBadge state={p.state} />
              </td>
              <td class="px-3 py-2 text-white/70">{p.owner}</td>
              <td class="px-3 py-2 text-white/50">{formatStamp(p.created, 'created')?.text ?? '—'}</td>
              <td class="px-3 py-2 text-white/70">{p.wertstrom}</td>
              <td class="px-3 py-2 text-white/70">{(p.skills ?? []).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
