/**
 * Werkzeug-Gruppen tab — which tool groups (tool_groups.yaml, via GET /catalog.groups) a
 * persona gets. A group grants gateway tools (→ PAT allow-list) and/or plugin tools; it is
 * NOT prompt text.
 *
 * Groups on `hold` are not selectable: derive_allowed_tools skips them (include_held is
 * never set), so ticking one would grant nothing while looking like it does. A held group
 * that a persona already carries stays visible (marked) and can only be removed.
 */
import { useState } from 'preact/hooks';
import type { PersonaSpec, ToolGroup } from '../../lib/shopApi';

interface Props {
  draft: PersonaSpec;
  groups: ToolGroup[] | null;
  onChange: (patch: Partial<PersonaSpec>) => void;
}

export function CouplingTab({ draft, groups, onChange }: Props) {
  const [open, setOpen] = useState<string | null>(null);

  if (!groups) {
    return <div class="text-xs text-white/40 animate-pulse">Katalog lädt …</div>;
  }

  const active = new Set(draft.skills ?? []);
  const known = new Set(groups.map((g) => g.name));
  const unknown = (draft.skills ?? []).filter((s) => !known.has(s));

  function toggle(name: string) {
    const cur = draft.skills ?? [];
    onChange({ skills: cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name] });
  }

  return (
    <div class="space-y-4">
      <p class="text-xs text-white/40">
        Jede Gruppe gibt der Persona Werkzeuge frei (Gateway-Tools über ihren Zugangsschlüssel
        bzw. Plugin-Tools). Die Gruppen stehen nicht im Prompt. Wirkt nach dem Ausrollen.
        „Details“ zeigt Namespace und Werkzeuge.
      </p>

      <ul class="divide-y divide-white/5" data-testid="group-list">
        {groups.map((g) => {
          const on = active.has(g.name);
          const held = !!g.hold;
          const grantsNothing = !g.whole_namespace && g.tools.length === 0 && g.plugin_tools.length === 0;
          return (
            <li key={g.name} class="py-2" data-testid={`group-${g.name}`}>
              <div class="flex items-center gap-3">
                <label
                  class={`flex flex-1 min-w-0 items-center gap-2 ${held && !on ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                  title={held ? `Gesperrt: ${g.hold}` : undefined}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={held && !on}
                    onChange={() => toggle(g.name)}
                    class="h-4 w-4 accent-[#E96C00]"
                    aria-label={g.name}
                  />
                  <span class="font-mono text-sm text-white">{g.name}</span>
                  {g.namespace && <span class="text-[11px] text-white/35">{g.namespace}</span>}
                  {held && (
                    <span class="rounded bg-red-900/50 px-1.5 py-0.5 text-[10px] text-red-200" data-testid="hold-badge">
                      gesperrt
                    </span>
                  )}
                  {g.opt_in && (
                    <span class="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300" title="nur auf ausdrückliche Entscheidung vergeben (destruktiv, Dritte oder querlesend)">
                      Opt-in
                    </span>
                  )}
                  {grantsNothing && (
                    <span class="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">gibt nichts frei</span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => setOpen(open === g.name ? null : g.name)}
                  class="shrink-0 text-[11px] text-white/40 underline hover:text-white/70"
                >
                  {open === g.name ? 'weniger' : 'Details'}
                </button>
              </div>
              {held && (
                <p class="mt-1 pl-6 text-[11px] text-red-300/80" data-testid="hold-text">
                  Gesperrt: {g.hold} — gibt derzeit nichts frei{on ? '; nur Entfernen möglich.' : '.'}
                </p>
              )}
              {open === g.name && (
                <div class="mt-1 pl-6 text-[11px] text-white/50" data-testid="group-details">
                  <div>
                    Namespace: <code>{g.namespace ?? '—'}</code>
                    {g.source && <> · Quelle: {g.source}</>}
                  </div>
                  <div class="mt-0.5">
                    Werkzeuge:{' '}
                    {g.whole_namespace ? (
                      <code>{g.namespace}_* (ganzer Namespace)</code>
                    ) : g.tools.length ? (
                      <code class="break-words">{g.tools.join(', ')}</code>
                    ) : (
                      '—'
                    )}
                  </div>
                  {g.plugin_tools.length > 0 && (
                    <div class="mt-0.5">
                      Plugin-Werkzeuge: <code>{g.plugin_tools.join(', ')}</code>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {unknown.length > 0 && (
        <div class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200" data-testid="unknown-groups">
          Nicht im Katalog (geben nichts frei):{' '}
          {unknown.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggle(s)}
              title="entfernen"
              class="ml-1 rounded bg-black/30 px-2 py-0.5 font-mono hover:bg-black/50"
            >
              {s} ✕
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
