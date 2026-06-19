/**
 * H4.4 — Behavior tab: footer_signature, wertstrom, stream_lead, routing_keywords.
 */
import type { PersonaSpec } from '../../lib/shopApi';

interface Props {
  draft: PersonaSpec;
  onChange: (patch: Partial<PersonaSpec>) => void;
}

const inputCls =
  'w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30';

export function BehaviorTab({ draft, onChange }: Props) {
  const keywordsStr = (draft.routing_keywords ?? []).join(', ');

  function handleKeywords(raw: string) {
    const parsed = raw
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    onChange({ routing_keywords: parsed });
  }

  return (
    <div class="space-y-5">
      <Field label="Footer-Signatur">
        <input
          type="text"
          value={draft.footer_signature}
          onInput={(e) => onChange({ footer_signature: (e.target as HTMLInputElement).value })}
          placeholder="verfasst von <Persona> (KI-Agent)"
          class={inputCls}
        />
        <p class="mt-1 text-[11px] text-white/30">
          Disclaimer-Footer in jeder Persona-Antwort (E-Mail, Teams).
        </p>
      </Field>

      <Field label="Wertstrom">
        <input
          type="text"
          value={draft.wertstrom}
          onInput={(e) => onChange({ wertstrom: (e.target as HTMLInputElement).value })}
          placeholder="vertrieb"
          class={inputCls}
        />
        <p class="mt-1 text-[11px] text-white/30">
          Stream-Zuordnung — bestimmt Roster-Discovery und Co-Personas-Block.
        </p>
      </Field>

      <Field label="Stream-Lead">
        <label class="flex items-center gap-2 mt-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.stream_lead}
            onChange={(e) => onChange({ stream_lead: (e.target as HTMLInputElement).checked })}
            class="h-4 w-4 rounded accent-[#E96C00]"
          />
          <span class="text-sm text-white/80">
            Diese Persona ist Stream-Lead für ihren Wertstrom
          </span>
        </label>
        <p class="mt-1 text-[11px] text-white/30">
          Stream-Leads erhalten auto-generierten Co-Personas-Block (§9 CLAUDE.md P37).
        </p>
      </Field>

      <Field label="Routing-Keywords">
        <input
          type="text"
          value={keywordsStr}
          onInput={(e) => handleKeywords((e.target as HTMLInputElement).value)}
          placeholder="ot, leitsystem, steuerung, opc"
          class={inputCls}
        />
        <p class="mt-1 text-[11px] text-white/30">
          Kommagetrennt — hermes-Router matcht eingehende Nachrichten auf diese Keywords.
        </p>
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return (
    <div>
      <label class="mb-1 block text-xs font-medium text-white/60">{label}</label>
      {children}
    </div>
  );
}
