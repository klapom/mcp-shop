/** Identity tab: display_name, identity_prose, model (from /catalog.models), thinking on/off. */
import type { PersonaSpec, ModelOption } from '../../lib/shopApi';

interface Props {
  draft: PersonaSpec;
  models: ModelOption[] | null;
  onChange: (patch: Partial<PersonaSpec>) => void;
}

/** What „Thinking an" writes — the materializer only distinguishes on/off, not the level. */
export const THINKING_ON = 'medium';

export function IdentityTab({ draft, models, onChange }: Props) {
  const known = models?.some((m) => m.id === draft.model) ?? true;
  const thinking = draft.reasoning != null && draft.reasoning !== '' && draft.reasoning !== 'none';

  return (
    <div class="space-y-5">
      <Field label="Persona-Key">
        <input
          type="text"
          value={draft.key}
          disabled
          class="w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-sm text-white/50 cursor-not-allowed"
        />
      </Field>

      <Field label="Anzeigename">
        <input
          type="text"
          value={draft.display_name}
          aria-label="Anzeigename"
          onInput={(e) => onChange({ display_name: (e.target as HTMLInputElement).value })}
          class={inputCls}
        />
        <p class="mt-1 text-[11px] text-white/30">Erscheint auch im Footer jeder Antwort.</p>
      </Field>

      <Field label="Identität (System-Prompt)">
        <textarea
          value={draft.identity_prose}
          onInput={(e) => onChange({ identity_prose: (e.target as HTMLTextAreaElement).value })}
          rows={6}
          class={`${inputCls} resize-y`}
        />
        <p class="mt-1 text-[11px] text-white/30">
          Kern der SOUL.md dieser Persona — wirkt nach dem Ausrollen.
        </p>
      </Field>

      <div class="grid grid-cols-2 gap-4">
        <Field label="Modell">
          <select
            value={draft.model}
            data-testid="model-select"
            onChange={(e) => onChange({ model: (e.target as HTMLSelectElement).value })}
            class={inputCls}
          >
            {(models ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
                {m.default ? ' — Standard' : ''}
              </option>
            ))}
            {/* current value not (or not yet) in the catalog: show it instead of hiding it */}
            {!known || !models ? (
              <option value={draft.model}>
                {draft.model}
                {models ? ' (unbekannt — fällt auf den Standard-Endpoint zurück)' : ''}
              </option>
            ) : null}
          </select>
        </Field>

        <Field label="Thinking">
          <label class="mt-1.5 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              role="switch"
              data-testid="thinking-toggle"
              checked={thinking}
              onChange={(e) =>
                onChange({ reasoning: (e.target as HTMLInputElement).checked ? THINKING_ON : null })
              }
              class="h-4 w-4 rounded accent-[#E96C00]"
            />
            <span class="text-sm text-white/80">{thinking ? 'an' : 'aus'}</span>
          </label>
          <p class="mt-1 text-[11px] text-white/30">
            Das Modell denkt vor der Antwort nach (langsamer, gründlicher). Nur an/aus — eine
            Stufe gibt es nicht.
          </p>
        </Field>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

const inputCls =
  'w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30';

function Field({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return (
    <div>
      <label class="mb-1 block text-xs font-medium text-white/60">{label}</label>
      {children}
    </div>
  );
}
