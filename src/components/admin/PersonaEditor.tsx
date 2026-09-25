/**
 * PersonaEditor — admin click-editor island (client:only="preact").
 *
 * Talks to the agentfirm Shop-API (same-origin /agentfirm-api, CF-Access-gated — see
 * src/lib/shopApi.ts; no token in the bundle).
 *
 *  - List from GET /runtime: running personas on top (stopped ones marked), below —
 *    collapsed and grey — „Eingefroren (n)" (no container) and „Judges (n)" (no Teams app).
 *  - Tabs: Identität | Werkzeug-Gruppen | Freigaben | Wissen | Bild & Teams-App | Team | Verlauf
 *  - „Speichern" = PUT (full replace). Freigaben take effect ≤5 min; everything else needs
 *    „Ausrollen" (POST /personas/{key}/rollout, only while the container runs). The job log
 *    is polled from GET /personas/{key}/runtime.
 *  - No create / clone / delete here: a persona needs bot, manifest, PAT and a rollout entry,
 *    which the shop cannot provide (Klaus, 2026-09-25).
 */

import { useEffect, useState, useCallback, useRef } from 'preact/hooks';
import {
  listPersonas,
  listRuntime,
  getRuntime,
  startRollout,
  getPersona,
  putPersona,
  getCatalog,
  errorText,
  type PersonaSpec,
  type RuntimeItem,
  type PersonaRuntime,
  type CatalogResponse,
} from '../../lib/shopApi';
import { TabBar, normalizeTab, type Tab } from './TabBar';
import { IdentityTab } from './IdentityTab';
import { CouplingTab } from './CouplingTab';
import { ApprovalTab, policyProblems } from './ApprovalTab';
import { KnowledgeTab } from './KnowledgeTab';
import { AvatarTab } from './AvatarTab';
import { StreamTab, HistoryTab, fmtDate } from './StreamTab';

const POLL_MS = 1500;

type ErrorInfo = { message: string; problems: string[] };

function ErrorBox({ error, testId }: { error: ErrorInfo | null; testId?: string }) {
  if (!error) return null;
  return (
    <div class="mt-2 rounded bg-red-900/40 px-3 py-2 text-xs text-red-200" data-testid={testId ?? 'error'}>
      <div class="font-medium">{error.message}</div>
      {error.problems.length > 0 && (
        <ul class="mt-1 list-disc pl-5">
          {error.problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export default function PersonaEditor() {
  const [runtime, setRuntime] = useState<RuntimeItem[] | null>(null);
  /** /runtime failed (docker unreachable → 503): plain key list, status unknown */
  const [fallbackKeys, setFallbackKeys] = useState<string[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [initialTab, setInitialTab] = useState<Tab | undefined>(undefined);

  const loadList = useCallback(() => {
    setListError(null);
    return listRuntime()
      .then((r) => {
        setRuntime(r.personas);
        setFallbackKeys(null);
      })
      .catch((e: unknown) => {
        setListError(errorText(e).message);
        return listPersonas()
          .then((r) => setFallbackKeys([...r.keys].sort()))
          .catch(() => {});
      });
  }, []);

  useEffect(() => {
    loadList();
    getCatalog()
      .then(setCatalog)
      .catch((e: unknown) => setCatalogError(errorText(e).message));
  }, [loadList]);

  // Deep-link support: /admin/personas/?persona=<key>&tab=avatar — Helga posts such links.
  useEffect(() => {
    if (typeof location === 'undefined') return;
    const q = new URLSearchParams(location.search);
    const persona = q.get('persona');
    if (persona) setSelectedKey(persona);
    setInitialTab(normalizeTab(q.get('tab')));
  }, []);

  const byKey = new Map((runtime ?? []).map((r) => [r.key, r]));

  function select(k: string) {
    setSelectedKey(k);
    setInitialTab(undefined); // manual nav → default tab
  }

  return (
    <div class="min-h-screen bg-[#0d0d1a] text-white">
      <div class="max-w-6xl mx-auto px-4 py-8">
        <div class="mb-6">
          <h1 class="text-2xl font-bold">Persona-Editor</h1>
          <p class="mt-1 text-sm text-white/50">
            Einstellungen der Personas. Freigaben wirken nach ≤5 min, alles andere nach dem
            Ausrollen.
          </p>
          {catalogError && (
            <p class="mt-1 text-xs text-amber-300/80">Katalog nicht abrufbar: {catalogError}</p>
          )}
        </div>

        <div class="flex gap-6">
          <aside class="w-52 shrink-0" data-testid="persona-list">
            {listError && (
              <div class="mb-2 text-xs text-amber-300/80" data-testid="list-error">
                Status nicht abrufbar: {listError}{' '}
                <button type="button" onClick={loadList} class="underline">
                  erneut
                </button>
              </div>
            )}
            {!runtime && !fallbackKeys && !listError && (
              <div class="text-xs text-white/40 animate-pulse">lädt …</div>
            )}
            {runtime && <PersonaList items={runtime} selected={selectedKey} onSelect={select} />}
            {!runtime && fallbackKeys && (
              <ul class="space-y-0.5">
                {fallbackKeys.map((k) => (
                  <li key={k}>
                    <PersonaButton k={k} selected={selectedKey === k} onSelect={select} />
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <main class="flex-1 min-w-0">
            {selectedKey ? (
              <EditPanel
                key={selectedKey}
                personaKey={selectedKey}
                initialTab={initialTab}
                listItem={byKey.get(selectedKey) ?? null}
                catalog={catalog}
                onRuntimeChanged={loadList}
              />
            ) : (
              <div class="flex h-64 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <p class="text-sm text-white/40">Persona aus der Liste wählen.</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Persona list (running on top; frozen + judges collapsed, grey)
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  running: 'läuft',
  stopped: 'gestoppt',
  frozen: 'eingefroren',
};

const DOT: Record<string, string> = {
  running: 'bg-green-400',
  stopped: 'bg-red-400',
  frozen: 'bg-white/20',
};

function PersonaList({
  items,
  selected,
  onSelect,
}: {
  items: RuntimeItem[];
  selected: string | null;
  onSelect: (k: string) => void;
}) {
  const sorted = [...items].sort((a, b) => a.key.localeCompare(b.key));
  const judges = sorted.filter((i) => !i.teams_app);
  const frozen = sorted.filter((i) => i.teams_app && i.status === 'frozen');
  const active = sorted.filter((i) => i.teams_app && i.status !== 'frozen');

  return (
    <div class="space-y-3">
      <ul class="space-y-0.5" data-testid="list-active">
        {active.map((i) => (
          <li key={i.key}>
            <PersonaButton k={i.key} item={i} selected={selected === i.key} onSelect={onSelect} />
          </li>
        ))}
      </ul>
      <Collapsed title="Eingefroren" testId="list-frozen" items={frozen} selected={selected} onSelect={onSelect} />
      <Collapsed title="Judges" testId="list-judges" items={judges} selected={selected} onSelect={onSelect} />
    </div>
  );
}

function Collapsed({
  title,
  testId,
  items,
  selected,
  onSelect,
}: {
  title: string;
  testId: string;
  items: RuntimeItem[];
  selected: string | null;
  onSelect: (k: string) => void;
}) {
  if (items.length === 0) return null;
  // open by default only when the selected persona sits in this group (deep link)
  const containsSelected = items.some((i) => i.key === selected);
  return (
    <details class="opacity-60" data-testid={testId} open={containsSelected}>
      <summary class="cursor-pointer select-none px-3 py-1 text-xs text-white/50">
        {title} ({items.length})
      </summary>
      <ul class="mt-1 space-y-0.5">
        {items.map((i) => (
          <li key={i.key}>
            <PersonaButton k={i.key} item={i} selected={selected === i.key} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function PersonaButton({
  k,
  item,
  selected,
  onSelect,
}: {
  k: string;
  item?: RuntimeItem;
  selected: boolean;
  onSelect: (k: string) => void;
}) {
  return (
    <button
      type="button"
      data-testid={`persona-${k}`}
      data-status={item?.status ?? 'unknown'}
      onClick={() => onSelect(k)}
      class={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-mono text-xs transition-colors ${
        selected ? 'bg-[#E96C00]/20 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white/80'
      }`}
    >
      {item && (
        <span
          class={`h-2 w-2 shrink-0 rounded-full ${DOT[item.status] ?? 'bg-white/20'}`}
          title={STATUS_LABEL[item.status] ?? item.status}
          aria-label={STATUS_LABEL[item.status] ?? item.status}
        />
      )}
      <span class="truncate">{k}</span>
      {item?.status === 'stopped' && (
        <span class="ml-auto shrink-0 text-[10px] text-red-300" data-testid="stopped-mark">
          gestoppt
        </span>
      )}
      {item?.pending && (
        <span
          class="ml-auto h-2 w-2 shrink-0 rounded-full bg-amber-400"
          title="Änderung ausstehend"
          data-testid="pending-mark"
        />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Edit panel (tabbed editor for one persona)
// ---------------------------------------------------------------------------

interface EditPanelProps {
  personaKey: string;
  initialTab?: Tab;
  listItem: RuntimeItem | null;
  catalog: CatalogResponse | null;
  onRuntimeChanged: () => void;
}

const SAVE_TABS: ReadonlySet<Tab> = new Set(['identity', 'coupling', 'approval', 'knowledge', 'stream']);

function EditPanel({ personaKey, initialTab, listItem, catalog, onRuntimeChanged }: EditPanelProps) {
  const [spec, setSpec] = useState<PersonaSpec | null>(null);
  const [draft, setDraft] = useState<PersonaSpec | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab ?? 'identity');
  const [changeNote, setChangeNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ErrorInfo | null>(null);
  const [saved, setSaved] = useState(false);
  const [historyBust, setHistoryBust] = useState(0);

  const [rt, setRt] = useState<PersonaRuntime | null>(null);
  const [rtError, setRtError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [rolloutError, setRolloutError] = useState<ErrorInfo | null>(null);
  const [finished, setFinished] = useState(false);
  const [starting, setStarting] = useState(false);

  const loadRuntime = useCallback(
    () =>
      getRuntime(personaKey)
        .then((r) => {
          setRt(r);
          setRtError(null);
          return r;
        })
        .catch((e: unknown) => {
          setRtError(errorText(e).message);
          return null;
        }),
    [personaKey],
  );

  useEffect(() => {
    getPersona(personaKey)
      .then((p) => {
        setSpec(p);
        setDraft(p);
      })
      .catch((e: unknown) => setLoadError(errorText(e).message));
    loadRuntime().then((r) => {
      if (r?.rollout?.job?.status === 'running') setPolling(true); // resume a running job
    });
  }, [personaKey, loadRuntime]);

  // Poll the job until it leaves "running".
  const pollRef = useRef<number | null>(null);
  useEffect(() => {
    if (!polling) return;
    let stopped = false;
    const tick = async () => {
      const r = await loadRuntime();
      if (stopped) return;
      if (r && r.rollout?.job?.status !== 'running') {
        setPolling(false);
        setFinished(true);
        onRuntimeChanged();
        return;
      }
      pollRef.current = window.setTimeout(tick, POLL_MS);
    };
    pollRef.current = window.setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
  }, [polling, loadRuntime, onRuntimeChanged]);

  function patch(updates: Partial<PersonaSpec>) {
    setDraft((d) => (d ? { ...d, ...updates } : d));
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await putPersona(draft, changeNote.trim() || undefined);
      setSpec(updated);
      setDraft(updated);
      setChangeNote('');
      setSaved(true);
      setHistoryBust((n) => n + 1);
      loadRuntime();
      onRuntimeChanged();
    } catch (e) {
      setSaveError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  async function rollout() {
    setStarting(true);
    setRolloutError(null);
    setFinished(false);
    try {
      await startRollout(personaKey);
      await loadRuntime();
      setPolling(true);
    } catch (e) {
      setRolloutError(errorText(e));
      loadRuntime();
    } finally {
      setStarting(false);
    }
  }

  if (loadError) {
    return (
      <div class="rounded-xl border border-red-700/30 bg-red-900/20 p-5 text-sm text-red-200">
        Persona konnte nicht geladen werden: {loadError}
      </div>
    );
  }
  if (!draft) {
    return <div class="text-xs text-white/40 animate-pulse">Persona lädt …</div>;
  }

  const isDirty = JSON.stringify(draft) !== JSON.stringify(spec);
  const problems = policyProblems(draft.approval_policies);
  // A change note alone may be saved (records a version; also marks the persona as pending).
  const canSave = !saving && problems.length === 0 && (isDirty || changeNote.trim() !== '');
  const status = rt?.status ?? listItem?.status ?? null;
  const pending = rt ? rt.pending : !!listItem?.pending;
  const teamsApp = rt?.teams_app ?? listItem?.teams_app ?? null;
  const knownTools = (catalog?.groups ?? []).flatMap((g) => [...g.tools, ...g.plugin_tools]);
  const ro = rt?.rollout ?? null;
  const showRolloutPanel =
    polling || finished || ro?.state === 'rollout_pending' || ro?.state === 'failed';

  return (
    <div class="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      {/* Header: name, status, pending, Ausrollen */}
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-semibold text-white">{draft.display_name}</span>
          <span class="font-mono text-xs text-white/40">{draft.key}</span>
          {status && (
            <span
              data-testid="status-badge"
              class={`rounded px-1.5 py-0.5 text-[10px] ${
                status === 'running'
                  ? 'bg-green-900/50 text-green-300'
                  : status === 'stopped'
                    ? 'bg-red-900/50 text-red-300'
                    : 'bg-white/5 text-white/40'
              }`}
            >
              {STATUS_LABEL[status] ?? status}
            </span>
          )}
          {pending && (
            <span class="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300" data-testid="pending-badge">
              Änderung ausstehend
            </span>
          )}
          {isDirty && (
            <span class="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">ungespeichert</span>
          )}
        </div>
        {status === 'running' && pending && !polling && (
          <button
            type="button"
            onClick={rollout}
            disabled={starting || isDirty}
            title={isDirty ? 'Erst speichern — ausgerollt wird der gespeicherte Stand.' : 'Container mit dem gespeicherten Stand neu starten'}
            data-testid="rollout-button"
            class="rounded-lg bg-emerald-700 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
          >
            {starting ? 'Starte …' : 'Ausrollen'}
          </button>
        )}
      </div>

      {rtError && (
        <div class="px-5 pt-2 text-xs text-amber-300/80" data-testid="runtime-error">
          Laufzeit-Status nicht abrufbar: {rtError}
        </div>
      )}
      {status === 'frozen' && (
        <div class="px-5 pt-2 text-xs text-white/40" data-testid="frozen-hint">
          Eingefroren (kein Container): Änderungen werden gespeichert, wirken aber erst, wenn die
          Persona wieder ausgerollt wird — nicht aus dem Shop.
        </div>
      )}
      {status === 'stopped' && (
        <div class="px-5 pt-2 text-xs text-red-300/80" data-testid="stopped-hint">
          Container gestoppt — Ausrollen aus dem Shop nicht möglich.
        </div>
      )}
      {rolloutError && (
        <div class="px-5">
          <ErrorBox error={rolloutError} testId="rollout-error" />
        </div>
      )}
      {showRolloutPanel && ro && <RolloutPanel ro={ro} polling={polling} />}

      <TabBar active={tab} onChange={setTab} />

      <div class="p-5">
        {tab === 'identity' && <IdentityTab draft={draft} models={catalog?.models ?? null} onChange={patch} />}
        {tab === 'coupling' && <CouplingTab draft={draft} groups={catalog?.groups ?? null} onChange={patch} />}
        {tab === 'approval' && (
          <ApprovalTab
            draft={draft}
            gatedTools={catalog?.gated_tools ?? null}
            knownTools={knownTools}
            onChange={patch}
          />
        )}
        {tab === 'knowledge' && <KnowledgeTab draft={draft} onChange={patch} />}
        {tab === 'avatar' && (
          <AvatarTab personaKey={personaKey} displayName={draft.display_name} teamsApp={teamsApp} />
        )}
        {tab === 'stream' && <StreamTab draft={draft} onChange={patch} />}
        {tab === 'history' && <HistoryTab key={`${personaKey}-${historyBust}`} personaKey={personaKey} />}
      </div>

      {SAVE_TABS.has(tab) && (
        <div class="border-t border-white/10 px-5 py-3">
          <div class="flex items-center gap-3">
            <input
              type="text"
              value={changeNote}
              onInput={(e) => setChangeNote((e.target as HTMLInputElement).value)}
              placeholder="Änderungsnotiz (optional) …"
              class="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
              disabled={saving}
            />
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              data-testid="save-button"
              class="rounded-lg bg-[#E96C00] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#E96C00]/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Speichern …' : 'Speichern'}
            </button>
          </div>
          <p class="mt-1 text-[11px] text-white/35">
            Freigaben wirken nach ≤5 min, alles andere nach dem Ausrollen.
          </p>
          {problems.length > 0 && (
            <div class="mt-2 rounded bg-amber-900/40 px-3 py-2 text-xs text-amber-200" data-testid="save-blocked">
              Speichern gesperrt:
              <ul class="mt-1 list-disc pl-5">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          <ErrorBox error={saveError} testId="save-error" />
          {saved && (
            <div class="mt-2 rounded bg-green-900/40 px-3 py-2 text-xs text-green-300" data-testid="save-ok">
              Gespeichert.{' '}
              {status === 'running'
                ? 'Freigaben wirken nach ≤5 min; für alles andere „Ausrollen“.'
                : 'Freigaben wirken nach ≤5 min; der Rest erst mit dem nächsten Rollout der Persona.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rollout job panel
// ---------------------------------------------------------------------------

function RolloutPanel({ ro, polling }: { ro: PersonaRuntime['rollout']; polling: boolean }) {
  const job = ro.job;
  let result: preact.ComponentChildren = null;
  if (!polling) {
    if (ro.state === 'rolled_out') {
      result = (
        <div class="text-green-300" data-testid="rollout-result">
          Ausgerollt{ro.rolled_out_at ? ` (${fmtDate(ro.rolled_out_at)})` : ''}.
        </div>
      );
    } else if (ro.state === 'rollout_pending') {
      result = (
        <div class="text-amber-300" data-testid="rollout-result">
          {ro.rollout_pending || 'Rollout ausstehend.'}
        </div>
      );
    } else if (ro.state === 'failed' || job?.status === 'failed' || job?.status === 'aborted') {
      result = (
        <div class="text-red-300" data-testid="rollout-result">
          Fehler: {ro.last_error || (job?.status === 'aborted' ? 'Job abgebrochen' : 'Rollout fehlgeschlagen')}
        </div>
      );
    }
  }
  return (
    <section class="mx-5 mt-3 rounded-xl border border-white/10 bg-black/40 p-3" data-testid="rollout-log">
      <div class="mb-2 flex items-center gap-2 text-xs">
        <span class="font-semibold text-white/80">Rollout</span>
        {polling ? (
          <span class="animate-pulse text-amber-300" data-testid="rollout-status">läuft …</span>
        ) : (
          job?.status && (
            <span class="text-white/50" data-testid="rollout-status">
              {job.status === 'done' ? 'beendet' : job.status}
              {job.exit_code != null && ` (Exit ${job.exit_code})`}
            </span>
          )
        )}
        {job?.by && <span class="text-white/30">von {job.by}</span>}
      </div>
      <pre
        class="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-white/70"
        data-testid="rollout-log-text"
      >
        {ro.log_tail || (polling ? 'warte auf Ausgabe …' : '(leer)')}
      </pre>
      {result && <div class="mt-2 text-xs">{result}</div>}
    </section>
  );
}
