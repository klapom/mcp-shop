/** H4.2 — Identity tab: display_name, identity_prose, baseline_ref, model, reasoning. */
import type { PersonaSpec } from '../../lib/shopApi';

interface Props {
  draft: PersonaSpec;
  onChange: (patch: Partial<PersonaSpec>) => void;
}

const MODEL_OPTIONS = [
  'qwen36-35b',
  'gemma4-e4b-judge',
  'gpt-4o',
  'gpt-4o-mini',
  'claude-3-5-sonnet',
];

export function IdentityTab({ draft, onChange }: Props) {
  return (
    <div class="space-y-5">
      <Field label="Persona-Key">
        <input
          type="text"
          value={draft.key}
          disabled
          class="w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-sm text-white/50 cursor-not-allowed"
        />
        <p class="mt-1 text-[11px] text-white/30">Key ist nach Erstellung unveränderlich.</p>
      </Field>

      <Field label="Display Name">
        <input
          type="text"
          value={draft.display_name}
          onInput={(e) => onChange({ display_name: (e.target as HTMLInputElement).value })}
          class={inputCls}
        />
      </Field>

      <Field label="Identity Prose">
        <textarea
          value={draft.identity_prose}
          onInput={(e) => onChange({ identity_prose: (e.target as HTMLTextAreaElement).value })}
          rows={6}
          class={`${inputCls} resize-y`}
        />
        <p class="mt-1 text-[11px] text-white/30">
          Der Kern-System-Prompt dieser Persona — wird im Baseline-Block eingebettet.
        </p>
      </Field>

      <Field label="Baseline Ref">
        <input
          type="text"
          value={draft.baseline_ref}
          onInput={(e) => onChange({ baseline_ref: (e.target as HTMLInputElement).value })}
          placeholder="shared/baselines/default-v1.md"
          class={inputCls}
        />
      </Field>

      <div class="grid grid-cols-2 gap-4">
        <Field label="Modell">
          <select
            value={draft.model}
            onChange={(e) => onChange({ model: (e.target as HTMLSelectElement).value })}
            class={inputCls}
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
            {/* Fallback: if current model not in list, show it */}
            {!MODEL_OPTIONS.includes(draft.model) && (
              <option value={draft.model}>{draft.model}</option>
            )}
          </select>
        </Field>

        <Field label="Reasoning (optional, z.B. low/medium/high)">
          <input
            type="text"
            value={draft.reasoning ?? ''}
            onInput={(e) => {
              const v = (e.target as HTMLInputElement).value.trim();
              onChange({ reasoning: v === '' ? null : v });
            }}
            placeholder="leer = aus"
            class="mt-1.5 w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
          />
        </Field>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <Field label="Track: Sovereign">
          <label class="flex items-center gap-2 mt-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.track_sovereign}
              onChange={(e) => onChange({ track_sovereign: (e.target as HTMLInputElement).checked })}
              class="h-4 w-4 rounded accent-[#E96C00]"
            />
            <span class="text-sm text-white/80">Sovereign-Track aktiv</span>
          </label>
        </Field>

        <Field label="Track: Microsoft">
          <label class="flex items-center gap-2 mt-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.track_microsoft}
              onChange={(e) =>
                onChange({ track_microsoft: (e.target as HTMLInputElement).checked })
              }
              class="h-4 w-4 rounded accent-[#E96C00]"
            />
            <span class="text-sm text-white/80">Microsoft-Track aktiv</span>
          </label>
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
