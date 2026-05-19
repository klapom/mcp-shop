import { useState, useCallback, useRef } from 'preact/hooks';
import { loadState, saveState } from '../../lib/wizard-state';
import { PERSONAS } from '../../lib/personas.generated';
import { generateAvatar, avatarUrl } from '../../lib/api';
import type { AvatarParams } from '../../lib/wizard-state';

interface Props {
  onNext: () => void;
  onBack: () => void;
}

function defaultParams(key: string): AvatarParams {
  const persona = PERSONAS.find((p) => p.key === key);
  // Use sensible defaults; real defaults come from metadata.yaml image.parameters
  return {
    gender: 'f',
    age: 'late-30s',
    style: 'smart-casual',
    hair: 'natural',
    lighting: 'indigo-rim-soft',
    ethnicity: 'european',
    eye_color: 'brown',
    glasses: 'none',
    tattoos: 'none',
    piercings: 'none',
    address: 'sie',
    ...(persona ? {} : {}),
  };
}

interface DropdownFieldProps {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  locked?: boolean;
}

function DropdownField({ label, value, options, onChange, locked }: DropdownFieldProps) {
  return (
    <div>
      <label class="block text-xs text-gray-400 mb-1">{label}</label>
      {locked ? (
        <div class="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-gray-300 text-sm flex items-center gap-2">
          <span>{value}</span>
          <span class="text-xs text-gray-500 ml-auto">🔒 gelockt</span>
        </div>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
          class="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} class="bg-gray-900">
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function TextInputField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label class="block text-xs text-gray-400 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        class="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </div>
  );
}

function PersonaTab({
  personaKey,
  params,
  onParamsChange,
  generating,
  currentAvatarUrl,
}: {
  personaKey: string;
  params: AvatarParams;
  onParamsChange: (p: AvatarParams) => void;
  generating: boolean;
  currentAvatarUrl: string;
}) {
  function set(field: keyof AvatarParams, value: string) {
    onParamsChange({ ...params, [field]: value });
  }

  return (
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Avatar preview */}
      <div class="flex flex-col items-center gap-4">
        <div class="relative">
          <img
            src={currentAvatarUrl}
            alt="Avatar"
            class={`w-48 h-48 rounded-2xl object-cover border-2 border-white/10 ${generating ? 'opacity-50' : ''}`}
          />
          {generating && (
            <div class="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40">
              <span class="text-white text-sm font-medium animate-pulse">Generiert …</span>
            </div>
          )}
        </div>
        <div class="rounded-lg bg-indigo-900/30 border border-indigo-600/40 px-4 py-2.5 text-indigo-300 text-xs text-center max-w-xs">
          Persönlichkeit (Promises) sind gelockt — nur visuelle Parameter anpassbar
        </div>
      </div>

      {/* Controls */}
      <div class="space-y-3">
        <DropdownField
          label="Geschlecht"
          value={params.gender}
          onChange={(v) => set('gender', v)}
          options={[
            { value: 'f', label: 'Weiblich' },
            { value: 'm', label: 'Männlich' },
            { value: 'abstract', label: 'Abstrakt / Neutral' },
          ]}
        />
        <DropdownField
          label="Alter"
          value={params.age}
          onChange={(v) => set('age', v)}
          options={[
            'late-20s', 'early-30s', 'mid-30s', 'late-30s', 'early-40s',
            'mid-40s', 'late-40s', 'mid-50s', 'late-50s',
          ].map((v) => ({ value: v, label: v }))}
        />
        <TextInputField label="Style" value={params.style} onChange={(v) => set('style', v)} />
        <TextInputField label="Haar" value={params.hair} onChange={(v) => set('hair', v)} />
        <DropdownField
          label="Beleuchtung"
          value={params.lighting}
          onChange={() => {}}
          locked
          options={[{ value: 'indigo-rim-soft', label: 'indigo-rim-soft' }]}
        />
        <DropdownField
          label="Ethnizität"
          value={params.ethnicity}
          onChange={(v) => set('ethnicity', v)}
          options={[
            'european', 'african', 'south-asian', 'east-asian', 'middle-eastern', 'latin', 'mixed',
          ].map((v) => ({ value: v, label: v }))}
        />
        <DropdownField
          label="Augenfarbe"
          value={params.eye_color}
          onChange={(v) => set('eye_color', v)}
          options={['brown', 'blue', 'green', 'gray', 'hazel'].map((v) => ({ value: v, label: v }))}
        />
        <DropdownField
          label="Brille"
          value={params.glasses}
          onChange={(v) => set('glasses', v)}
          options={[
            { value: 'none', label: 'Keine' },
            { value: 'subtle-frame', label: 'Subtiles Gestell' },
            { value: 'bold-frame', label: 'Markantes Gestell' },
          ]}
        />
        <DropdownField
          label="Tattoos"
          value={params.tattoos}
          onChange={(v) => set('tattoos', v)}
          options={[
            { value: 'none', label: 'Keine' },
            { value: 'subtle-visible', label: 'Subtil sichtbar' },
          ]}
        />
        <DropdownField
          label="Piercings"
          value={params.piercings}
          onChange={(v) => set('piercings', v)}
          options={[
            { value: 'none', label: 'Keine' },
            { value: 'subtle-ear', label: 'Subtil Ohr' },
            { value: 'nose-stud', label: 'Nasenstud' },
            { value: 'subtle-ear-and-brow', label: 'Ohr & Augenbraue' },
          ]}
        />
        <DropdownField
          label="Ansprache (Voice)"
          value={params.address}
          onChange={(v) => set('address', v)}
          options={[
            { value: 'du', label: 'Du' },
            { value: 'sie', label: 'Sie' },
          ]}
        />
      </div>
    </div>
  );
}

export default function AvatarPersonalize({ onNext, onBack }: Props) {
  const state = loadState();
  const selectedKeys = state.selectedPersonas ?? [];
  const [activeTab, setActiveTab] = useState(selectedKeys[0] ?? '');

  const [paramsMap, setParamsMap] = useState<Record<string, AvatarParams>>(() => {
    const init: Record<string, AvatarParams> = {};
    for (const k of selectedKeys) {
      init[k] = state.avatars?.[k] ?? defaultParams(k);
    }
    return init;
  });

  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const k of selectedKeys) {
      init[k] = `/personas/${k}-default.webp`;
    }
    return init;
  });

  const [generatingKeys, setGeneratingKeys] = useState<Set<string>>(new Set());
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleParamsChange = useCallback(
    (key: string, params: AvatarParams) => {
      setParamsMap((prev) => ({ ...prev, [key]: params }));

      // Debounce avatar generation
      if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
      debounceTimers.current[key] = setTimeout(async () => {
        if (!state.tenantId || !state.token) return;
        setGeneratingKeys((prev) => new Set(prev).add(key));
        try {
          const res = await generateAvatar(state.tenantId, state.token, key, params);
          // Use the API URL directly with cache-bust
          const bust = Date.now();
          const apiBase =
            (import.meta as any).env?.PUBLIC_POMMER_API_URL ?? 'http://localhost:32050';
          setAvatarUrls((prev) => ({
            ...prev,
            [key]: `${apiBase}${res.avatar_url}?t=${bust}`,
          }));
        } catch {
          // Avatar generation failed silently — keep current image
        } finally {
          setGeneratingKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      }, 800);
    },
    [state.tenantId, state.token]
  );

  function handleNext() {
    saveState({ avatars: paramsMap });
    onNext();
  }

  function handleSkip() {
    onNext();
  }

  if (selectedKeys.length === 0) {
    return (
      <div>
        <h2 class="text-2xl font-bold text-white mb-4">Avatar-Personalisierung</h2>
        <p class="text-gray-400 mb-6">Keine Personas ausgewählt.</p>
        <div class="flex gap-3">
          <button type="button" onClick={onBack} class="rounded-lg border border-white/20 px-6 py-2.5 text-gray-300 hover:bg-white/5 transition-colors">Zurück</button>
          <button type="button" onClick={onNext} class="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 font-semibold text-white transition-colors">Weiter</button>
        </div>
      </div>
    );
  }

  const personaObjs = selectedKeys.map((k) => PERSONAS.find((p) => p.key === k)!).filter(Boolean);

  return (
    <div>
      <h2 class="text-2xl font-bold text-white mb-2">Avatar-Personalisierung</h2>
      <p class="text-gray-400 mb-6">
        Passen Sie die visuellen Parameter Ihrer Personas an. Änderungen werden nach 0,8 Sekunden automatisch generiert.
      </p>

      {/* Tabs */}
      <div class="flex gap-2 mb-6 flex-wrap">
        {personaObjs.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setActiveTab(p.key)}
            class={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              activeTab === p.key
                ? 'bg-indigo-600 text-white'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
            }`}
          >
            <img
              src={`/personas/${p.key}-default.webp`}
              alt={p.displayName}
              class="w-5 h-5 rounded-full object-cover"
            />
            {p.displayName}
            {generatingKeys.has(p.key) && <span class="animate-pulse text-xs">●</span>}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      {activeTab && paramsMap[activeTab] && (
        <PersonaTab
          personaKey={activeTab}
          params={paramsMap[activeTab]}
          onParamsChange={(p) => handleParamsChange(activeTab, p)}
          generating={generatingKeys.has(activeTab)}
          currentAvatarUrl={avatarUrls[activeTab] ?? `/personas/${activeTab}-default.webp`}
        />
      )}

      <div class="flex gap-3 mt-8">
        <button
          type="button"
          onClick={onBack}
          class="rounded-lg border border-white/20 px-6 py-2.5 text-gray-300 hover:bg-white/5 transition-colors"
        >
          Zurück
        </button>
        <button
          type="button"
          onClick={handleSkip}
          class="rounded-lg border border-white/20 px-6 py-2.5 text-gray-400 hover:bg-white/5 transition-colors"
        >
          Persona-Defaults beibehalten
        </button>
        <button
          type="button"
          onClick={handleNext}
          class="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 font-semibold text-white transition-colors"
        >
          Weiter zur Übersicht
        </button>
      </div>
    </div>
  );
}
