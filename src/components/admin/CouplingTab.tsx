/**
 * H4.3 — Coupling tab: Skills toggles, MCPs toggles, Tools whitelist.
 * Options come from GET /catalog.
 */
import { useEffect, useState } from 'preact/hooks';
import type { PersonaSpec, CatalogResponse } from '../../lib/shopApi';
import { getCatalog, ShopApiError } from '../../lib/shopApi';

interface Props {
  draft: PersonaSpec;
  onChange: (patch: Partial<PersonaSpec>) => void;
}

export function CouplingTab({ draft, onChange }: Props) {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCatalog()
      .then(setCatalog)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return <div class="text-sm text-amber-300/80">Catalog nicht abrufbar: {error}</div>;
  }
  if (!catalog) {
    return <div class="text-xs text-white/40 animate-pulse">Catalog lädt …</div>;
  }

  function toggleList(key: 'skills' | 'mcps', item: string) {
    const current = draft[key] as string[];
    const next = current.includes(item)
      ? current.filter((x) => x !== item)
      : [...current, item];
    onChange({ [key]: next });
  }

  function toggleTool(tool: string) {
    const current = draft.tools ?? [];
    const next = current.includes(tool)
      ? current.filter((x) => x !== tool)
      : [...current, tool];
    onChange({ tools: next.length > 0 ? next : null });
  }

  return (
    <div class="space-y-6">
      <Section title="Skills" hint="Aktivierte Skills erscheinen im System-Prompt der Persona.">
        <ToggleGrid
          items={catalog.skills}
          active={draft.skills}
          onToggle={(item) => toggleList('skills', item)}
        />
      </Section>

      <Section title="MCPs" hint="MCPs werden via Pack-Manifest verdrahtet.">
        <ToggleGrid
          items={catalog.mcps}
          active={draft.mcps}
          onToggle={(item) => toggleList('mcps', item)}
        />
      </Section>

      <Section
        title="Tools whitelist"
        hint={
          draft.tools === null
            ? 'Aktuell: alle Catalog-Tools aktiv (tools = null). Auswahl schaltet auf explizite Whitelist.'
            : `Explizite Whitelist: ${draft.tools.length} Tools ausgewählt.`
        }
      >
        <div class="mb-2 flex items-center gap-3">
          <label class="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.tools === null}
              onChange={(e) =>
                onChange({ tools: (e.target as HTMLInputElement).checked ? null : [] })
              }
              class="h-3.5 w-3.5 accent-[#E96C00]"
            />
            Alle Catalog-Tools (tools = null)
          </label>
        </div>
        {draft.tools !== null && (
          <ToggleGrid
            items={catalog.tools}
            active={draft.tools}
            onToggle={toggleTool}
          />
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small sub-components
// ---------------------------------------------------------------------------

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: preact.ComponentChildren;
}) {
  return (
    <div>
      <div class="mb-1">
        <span class="text-sm font-medium text-white/80">{title}</span>
        {hint && <p class="mt-0.5 text-[11px] text-white/40">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function ToggleGrid({
  items,
  active,
  onToggle,
}: {
  items: string[];
  active: string[];
  onToggle: (item: string) => void;
}) {
  if (items.length === 0) {
    return <p class="text-xs text-white/30 italic">Keine Einträge im Catalog.</p>;
  }
  return (
    <div class="flex flex-wrap gap-2">
      {items.map((item) => {
        const on = active.includes(item);
        return (
          <button
            key={item}
            type="button"
            onClick={() => onToggle(item)}
            class={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              on
                ? 'bg-[#E96C00] text-white'
                : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'
            }`}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}
