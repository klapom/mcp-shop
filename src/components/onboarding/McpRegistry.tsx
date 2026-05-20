import { useEffect, useState } from 'preact/hooks';
import { loadState, saveState } from '../../lib/wizard-state';
import { deleteMcp, listMcps, probeMcp, registerMcp } from '../../lib/api';
import type { McpProbeResult, McpServer } from '../../lib/api';
import { PERSONAS } from '../../lib/personas.generated';
import { POMMER_MCPS, defaultMcpsFor, personasUsingMcp } from '../../lib/persona-mcp-defaults';

interface Props {
  onNext: () => void;
  onBack: () => void;
}

export default function McpRegistry({ onNext, onBack }: Props) {
  const state = loadState();
  const selectedPersonas = state.selectedPersonas ?? [];
  const personaOptions = PERSONAS.filter((p) => selectedPersonas.includes(p.key));

  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // BYO-Form state
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [personaScope, setPersonaScope] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Per-MCP probe results
  const [probeResults, setProbeResults] = useState<Record<string, McpProbeResult | 'loading'>>({});

  // Pommer-MCP-Auswahl: beim ersten Betreten mit den Per-Persona-Defaults
  // vorbelegen, danach die gespeicherte Customer-Auswahl respektieren.
  const [pommerMcps, setPommerMcps] = useState<Set<string>>(() => {
    const saved = state.pommerMcps;
    if (saved !== undefined) return new Set(saved);
    return new Set(defaultMcpsFor(selectedPersonas));
  });

  function togglePommerMcp(id: string) {
    setPommerMcps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveState({ pommerMcps: [...next] });
      return next;
    });
  }

  // Erstauswahl auch ohne Toggle persistieren, damit der Activation-Snapshot
  // die Defaults sieht, falls der Customer den Step nur durchklickt.
  useEffect(() => {
    if (state.pommerMcps === undefined) {
      saveState({ pommerMcps: [...pommerMcps] });
    }
  }, []);

  async function refresh() {
    if (!state.tenantId || !state.token) return;
    setLoading(true);
    try {
      const list = await listMcps(state.tenantId, state.token);
      setServers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function togglePersonaScope(key: string) {
    setPersonaScope((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleAdd(e: Event) {
    e.preventDefault();
    if (!state.tenantId || !state.token || !name.trim() || !url.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await registerMcp(state.tenantId, state.token, {
        name: name.trim(),
        url: url.trim(),
        auth_token: authToken.trim() || undefined,
        persona_keys: personaScope.size > 0 ? [...personaScope] : null,
      });
      setName('');
      setUrl('');
      setAuthToken('');
      setPersonaScope(new Set());
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Anlage fehlgeschlagen');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(mcpId: string) {
    if (!state.tenantId || !state.token) return;
    try {
      await deleteMcp(state.tenantId, state.token, mcpId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen');
    }
  }

  async function handleProbe(mcpId: string) {
    if (!state.tenantId || !state.token) return;
    setProbeResults((prev) => ({ ...prev, [mcpId]: 'loading' }));
    try {
      const result = await probeMcp(state.tenantId, state.token, mcpId);
      setProbeResults((prev) => ({ ...prev, [mcpId]: result }));
    } catch (e) {
      setProbeResults((prev) => ({
        ...prev,
        [mcpId]: { ok: false, error: e instanceof Error ? e.message : 'Fehler' },
      }));
    }
  }

  function personaLabel(key: string): string {
    const p = PERSONAS.find((x) => x.key === key);
    return p?.displayName ?? key;
  }

  return (
    <div>
      <h2 class="text-2xl font-bold text-white mb-2">Datenquellen (MCPs)</h2>
      <p class="text-gray-400 mb-6">
        Datenquellen werden über das Model-Context-Protocol angebunden. Die Pommer-eigenen
        Quellen unten sind passend zu Deiner Persona-Auswahl vorausgewählt — Du kannst sie
        abwählen. Darunter kannst Du eigene MCPs ergänzen.
      </p>

      {error && (
        <div class="mb-4 rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Pommer-Datenquellen — per-Persona vorausgewählt, abwählbar */}
      <div class="mb-6">
        <div class="text-sm font-semibold text-indigo-200 mb-1">Pommer-Datenquellen</div>
        <p class="text-xs text-gray-500 mb-3">
          Von Pommer betrieben und gepflegt. Vorausgewählt anhand Deiner Personas.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {POMMER_MCPS.map((m) => {
            const checked = pommerMcps.has(m.id);
            const users = personasUsingMcp(m.id, selectedPersonas)
              .map((k) => PERSONAS.find((p) => p.key === k)?.displayName ?? k);
            return (
              <label
                key={m.id}
                data-pommer-mcp={m.id}
                class={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                  checked
                    ? 'bg-indigo-600/15 border-indigo-500/50'
                    : 'bg-white/5 border-white/10 hover:border-white/25'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => togglePommerMcp(m.id)}
                  class="mt-0.5 accent-indigo-500"
                />
                <div class="min-w-0">
                  <div class="text-sm font-medium text-white">{m.label}</div>
                  <div class="text-xs text-gray-400">{m.description}</div>
                  {users.length > 0 && (
                    <div class="mt-1 text-[10px] text-indigo-300">
                      für {users.join(', ')}
                    </div>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* BYO-Form */}
      <form onSubmit={handleAdd} class="rounded-xl bg-white/5 border border-white/10 p-5 mb-6 space-y-4">
        <div class="text-sm font-semibold text-indigo-200">MCP hinzufügen</div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
              placeholder="z.B. Open-Meteo Weather"
              class="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">URL</label>
            <input
              type="url"
              value={url}
              onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
              placeholder="https://example.com/mcp"
              class="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>
        </div>

        <div>
          <label class="block text-xs text-gray-400 mb-1">Auth-Token (optional)</label>
          <input
            type="password"
            value={authToken}
            onInput={(e) => setAuthToken((e.target as HTMLInputElement).value)}
            placeholder="Bearer-Token oder API-Key, wird verschlüsselt gespeichert"
            class="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {personaOptions.length > 0 && (
          <div>
            <label class="block text-xs text-gray-400 mb-2">
              Persona-Zugriff (leer = alle {personaOptions.length} ausgewählten Personas)
            </label>
            <div class="flex flex-wrap gap-2">
              {personaOptions.map((p) => {
                const isOn = personaScope.has(p.key);
                return (
                  <button
                    type="button"
                    key={p.key}
                    onClick={() => togglePersonaScope(p.key)}
                    class={`text-xs rounded-full px-3 py-1 border transition-colors ${
                      isOn
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'border-white/20 text-gray-400 hover:border-white/40'
                    }`}
                  >
                    {p.displayName}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div class="pt-1">
          <button
            type="submit"
            disabled={submitting || !name.trim() || !url.trim()}
            class="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 text-sm font-semibold text-white transition-colors"
          >
            {submitting ? 'Speichere …' : 'MCP hinzufügen'}
          </button>
        </div>
      </form>

      {/* Registered MCPs */}
      <div class="space-y-2 mb-6">
        {loading ? (
          <div class="text-gray-500 text-sm">Lade …</div>
        ) : servers.length === 0 ? (
          <div class="text-gray-500 text-sm italic">
            Noch keine MCPs registriert. Du kannst das auch überspringen.
          </div>
        ) : (
          servers.map((s) => {
            const probe = probeResults[s.id];
            return (
              <div key={s.id} class="rounded-lg bg-white/5 border border-white/10 px-4 py-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="font-semibold text-white text-sm">{s.name}</div>
                    <div class="text-gray-400 text-xs truncate">{s.url}</div>
                    <div class="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-gray-500">
                      {s.has_auth && <span class="bg-amber-500/15 text-amber-300 rounded px-1.5 py-0.5">🔒 mit Auth</span>}
                      {s.persona_keys === null || s.persona_keys.length === 0 ? (
                        <span class="bg-white/10 rounded px-1.5 py-0.5">alle Personas</span>
                      ) : (
                        s.persona_keys.map((k) => (
                          <span key={k} class="bg-indigo-500/15 text-indigo-300 rounded px-1.5 py-0.5">
                            {personaLabel(k)}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <div class="flex gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleProbe(s.id)}
                      class="text-xs rounded-md border border-white/15 px-3 py-1.5 text-gray-300 hover:bg-white/5"
                    >
                      Test
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(s.id)}
                      class="text-xs rounded-md border border-red-700/40 px-3 py-1.5 text-red-300 hover:bg-red-900/30"
                    >
                      Entfernen
                    </button>
                  </div>
                </div>
                {probe === 'loading' && (
                  <div class="mt-2 text-xs text-gray-400">Probe läuft …</div>
                )}
                {probe && probe !== 'loading' && (
                  <div
                    class={`mt-2 text-xs rounded-md px-2.5 py-1.5 ${
                      probe.ok
                        ? 'bg-green-900/30 border border-green-800/40 text-green-300'
                        : 'bg-red-900/30 border border-red-800/40 text-red-300'
                    }`}
                  >
                    {probe.ok ? (
                      <>
                        ✓ {probe.tools?.length ?? 0} Tools verfügbar
                        {probe.elapsed_ms !== undefined && ` (${probe.elapsed_ms}ms)`}
                        {probe.tools && probe.tools.length > 0 && (
                          <span class="text-gray-400 ml-2">
                            ({probe.tools.slice(0, 5).map((t) => t.name).join(', ')}
                            {probe.tools.length > 5 && ` …`})
                          </span>
                        )}
                      </>
                    ) : (
                      <>✗ {probe.error}</>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div class="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          class="rounded-lg border border-white/20 px-6 py-2.5 text-gray-300 hover:bg-white/5 transition-colors"
        >
          Zurück
        </button>
        <button
          type="button"
          onClick={onNext}
          class="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 font-semibold text-white transition-colors"
        >
          {(() => {
            const total = pommerMcps.size + servers.length;
            return `Weiter ${total > 0 ? `(${total} MCP${total !== 1 ? 's' : ''})` : '(überspringen)'}`;
          })()}
        </button>
      </div>
    </div>
  );
}
