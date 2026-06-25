/**
 * Avatar tab — generate the persona's brand-conform avatar (FLUX) and download
 * the ready-to-sideload Teams app package.
 *
 * Talks directly to shop_api (POST /personas/{key}/avatar, GET .../avatar,
 * GET .../teams-package.zip) — not part of the persona-spec draft, so it acts on
 * the personaKey like StreamTab/HistoryTab.
 */
import { useState } from 'preact/hooks';
import { generateAvatar, avatarUrl, teamsPackageUrl, type AvatarParams } from '../../lib/shopApi';

interface Props {
  personaKey: string;
  displayName: string;
}

const GENDER = [
  ['woman', 'Weiblich'], ['man', 'Männlich'],
  ['androgynous', 'Androgyn'], ['abstract', 'Abstrakt'],
] as const;
const AGE = [['late20s', 'Ende 20'], ['40s', 'Mitte 40'], ['senior', 'Senior']] as const;
const LOOK = [['formal', 'Formell'], ['smart_casual', 'Smart Casual'], ['creative', 'Kreativ']] as const;
const STYLE = [
  ['photorealistic', 'Fotorealistisch'], ['illustration', 'Illustration'],
  ['cartoon', 'Cartoon'], ['abstract', 'Abstrakt-geometrisch'],
] as const;
const BACKGROUND = [
  ['indigo', 'Pommer Indigo'], ['steel', 'Pommer Steel'],
  ['slate', 'Slate (dark)'], ['cloud', 'Cloud (light)'],
] as const;

function Select({ label, value, options, onChange }: {
  label: string; value: string; options: readonly (readonly [string, string])[];
  onChange: (v: string) => void;
}) {
  return (
    <label class="block">
      <span class="mb-1 block text-[11px] uppercase tracking-wide text-white/40">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
        class="w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-white/30"
      >
        {options.map(([v, l]) => <option value={v}>{l}</option>)}
      </select>
    </label>
  );
}

export function AvatarTab({ personaKey, displayName }: Props) {
  const [p, setP] = useState<AvatarParams>({
    gender: 'abstract', age: '40s', look: 'smart_casual',
    style: 'photorealistic', background: 'indigo', extra: '', watermark: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bust, setBust] = useState(Date.now());
  const [seed, setSeed] = useState<number | null>(null);

  function set(patch: Partial<AvatarParams>) { setP((s) => ({ ...s, ...patch })); }

  async function generate() {
    setBusy(true); setError(null);
    try {
      const r = await generateAvatar(personaKey, { ...p, extra: p.extra?.trim() || null });
      setSeed(r.seed_used);
      setBust(Date.now()); // cache-bust the preview
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="space-y-4">
      <p class="text-xs text-white/40">
        Erzeugt das Persona-Bild brand-konform über FLUX (Pommer-Indigo, minimalistisch). Nach dem
        Generieren kannst du das fertige <b>Teams-App-Paket</b> (Manifest + Avatar-Icon) herunterladen
        und im Teams-Client hochladen (Sideload).
      </p>

      <div class="flex gap-5">
        {/* Preview */}
        <div class="shrink-0">
          <div class="h-40 w-40 overflow-hidden rounded-xl border border-white/10 bg-black/30">
            <img
              src={avatarUrl(personaKey, bust)}
              alt={`${displayName} Avatar`}
              class="h-full w-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
            />
          </div>
          {seed !== null && <p class="mt-1 text-center text-[10px] text-white/30">seed {seed}</p>}
        </div>

        {/* Sliders */}
        <div class="grid flex-1 grid-cols-2 gap-3 self-start">
          <Select label="Ausdruck" value={p.gender} options={GENDER} onChange={(v) => set({ gender: v })} />
          <Select label="Alter" value={p.age} options={AGE} onChange={(v) => set({ age: v })} />
          <Select label="Look" value={p.look} options={LOOK} onChange={(v) => set({ look: v })} />
          <Select label="Stil" value={p.style} options={STYLE} onChange={(v) => set({ style: v })} />
          <Select label="Hintergrund" value={p.background} options={BACKGROUND} onChange={(v) => set({ background: v })} />
          <label class="flex items-end gap-2 pb-1.5 text-xs text-white/60">
            <input type="checkbox" checked={p.watermark} onChange={(e) => set({ watermark: (e.target as HTMLInputElement).checked })} />
            Name als Watermark
          </label>
        </div>
      </div>

      <label class="block">
        <span class="mb-1 block text-[11px] uppercase tracking-wide text-white/40">
          Zusatz-Beschreibung (optional, wird dem Prompt vorangestellt)
        </span>
        <input
          type="text"
          value={p.extra ?? ''}
          onInput={(e) => set({ extra: (e.target as HTMLInputElement).value })}
          placeholder="z.B. 'freundlicher Buchhalter mit Bart'"
          class="w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
        />
      </label>

      <div class="flex items-center gap-3">
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          class="rounded-lg bg-[#E96C00] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#E96C00]/90 disabled:opacity-50"
        >
          {busy ? 'Generiere … (einige Sekunden)' : 'Avatar generieren'}
        </button>
        <a
          href={teamsPackageUrl(personaKey)}
          class="rounded-lg bg-white/10 px-4 py-1.5 text-sm text-white hover:bg-white/20"
        >
          Teams-Paket (ZIP) herunterladen
        </a>
      </div>

      {error && <div class="rounded bg-red-900/40 px-3 py-2 text-xs text-red-200">{error}</div>}
    </div>
  );
}
