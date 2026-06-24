/**
 * H9.10 — Seed-Wissen tab.
 *
 * Per-doc rows over `draft.knowledge`. Each doc carries a stable `name` (slug),
 * a `title`, a one-line `description` (the SOUL.md index line), a `tier`
 * (A = inline in the SOUL.md / always-on, B = on-demand via the read_knowledge
 * tool), `tags`, and the full markdown `body`. The user can add + remove docs.
 *
 * Mirrors how the seed knowledge is materialised: Tier A is inlined verbatim in
 * the system prompt; Tier B shows only as `name — description` and the body is
 * pulled on demand (progressive disclosure, skill-style).
 */
import { useState } from 'preact/hooks';
import type { PersonaSpec, KnowledgeDoc } from '../../lib/shopApi';

interface Props {
  draft: PersonaSpec;
  onChange: (patch: Partial<PersonaSpec>) => void;
}

const TIER_HINT: Record<'A' | 'B', string> = {
  A: 'Inline in der SOUL.md — immer aktiv (für verbindliche Baselines).',
  B: 'Nur als Index in der SOUL.md; Volltext on-demand über read_knowledge (Referenzwissen).',
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function KnowledgeTab({ draft, onChange }: Props) {
  const [newName, setNewName] = useState('');
  const docs = draft.knowledge ?? [];

  function update(index: number, patch: Partial<KnowledgeDoc>) {
    const next = docs.map((d, i) => (i === index ? { ...d, ...patch } : d));
    onChange({ knowledge: next });
  }

  function remove(index: number) {
    onChange({ knowledge: docs.filter((_, i) => i !== index) });
  }

  function add() {
    const name = slugify(newName);
    if (!name || docs.some((d) => d.name === name)) return;
    const doc: KnowledgeDoc = {
      name,
      title: newName.trim(),
      description: '',
      body: '',
      tags: [],
      tier: 'B',
    };
    onChange({ knowledge: [...docs, doc] });
    setNewName('');
  }

  return (
    <div class="space-y-4">
      <p class="text-xs text-white/40">
        Seed-Wissen der Persona. <b>Tier A</b> steht voll in der SOUL.md (immer aktiv),{' '}
        <b>Tier B</b> erscheint dort nur als Index — den Volltext holt die Persona bei Bedarf
        selbst über <code class="text-white/60">read_knowledge</code>. Änderungen wirken nach Save +
        Re-Materialisierung des Gateways.
      </p>

      {docs.length === 0 && (
        <div class="rounded-lg border border-white/10 bg-black/20 px-4 py-6 text-center text-xs text-white/40">
          Noch kein Wissen hinterlegt.
        </div>
      )}

      {docs.map((d, i) => (
        <div key={d.name} class="rounded-lg border border-white/10 bg-black/20 p-4 space-y-3">
          <div class="flex items-center justify-between gap-3">
            <code class="text-xs text-[#E96C00]">{d.name}</code>
            <button
              type="button"
              onClick={() => remove(i)}
              class="rounded border border-red-700/30 px-2 py-0.5 text-[11px] text-red-400 hover:bg-red-900/20"
            >
              Entfernen
            </button>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="mb-1 block text-[11px] uppercase tracking-wide text-white/40">Titel</span>
              <input
                type="text"
                value={d.title}
                onInput={(e) => update(i, { title: (e.target as HTMLInputElement).value })}
                class="w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-white/30"
              />
            </label>
            <label class="block">
              <span class="mb-1 block text-[11px] uppercase tracking-wide text-white/40">Tier</span>
              <select
                value={d.tier}
                onChange={(e) =>
                  update(i, { tier: (e.target as HTMLSelectElement).value as 'A' | 'B' })
                }
                class="w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-white/30"
              >
                <option value="A">A — inline (immer aktiv)</option>
                <option value="B">B — on-demand</option>
              </select>
            </label>
          </div>
          <p class="text-[11px] text-white/35">{TIER_HINT[d.tier]}</p>

          <label class="block">
            <span class="mb-1 block text-[11px] uppercase tracking-wide text-white/40">
              Beschreibung (Index-Zeile — leer = Titel)
            </span>
            <input
              type="text"
              value={d.description}
              onInput={(e) => update(i, { description: (e.target as HTMLInputElement).value })}
              placeholder={d.title}
              class="w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
            />
          </label>

          <label class="block">
            <span class="mb-1 block text-[11px] uppercase tracking-wide text-white/40">
              Tags (kommagetrennt — <code>baseline</code> ⇒ Default-Tier A)
            </span>
            <input
              type="text"
              value={d.tags.join(', ')}
              onInput={(e) =>
                update(i, {
                  tags: (e.target as HTMLInputElement).value
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
              class="w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-white/30"
            />
          </label>

          <label class="block">
            <span class="mb-1 block text-[11px] uppercase tracking-wide text-white/40">
              Inhalt (Markdown)
            </span>
            <textarea
              value={d.body}
              onInput={(e) => update(i, { body: (e.target as HTMLTextAreaElement).value })}
              rows={8}
              class="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs leading-relaxed text-white focus:outline-none focus:border-white/30"
            />
          </label>
        </div>
      ))}

      <div class="flex gap-2 pt-1">
        <input
          type="text"
          value={newName}
          onInput={(e) => setNewName((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Neuer Doc-Titel … (slug wird automatisch erzeugt)"
          class="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
        />
        <button
          type="button"
          onClick={add}
          disabled={!slugify(newName) || docs.some((d) => d.name === slugify(newName))}
          class="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20 disabled:opacity-40"
        >
          + Doc
        </button>
      </div>
    </div>
  );
}
