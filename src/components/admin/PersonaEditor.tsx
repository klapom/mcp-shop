/**
 * PersonaEditor — H4 admin click-editor island.
 *
 * Client-only Preact island (client:only="preact") that talks directly to the
 * Shop-Config-API (H3.3) using shopApi.ts.
 *
 * Auth model:
 *   CF Access is the real perimeter gate for /admin/*. The Shop-Config-API
 *   Bearer token (PUBLIC_SHOP_API_TOKEN) is an eval-only convenience baked into
 *   the static bundle — it MUST be replaced by a server-side proxy or CF-Worker
 *   BFF before any non-eval production use. See src/lib/shopApi.ts for details.
 *
 * Features:
 *  - List + select personas
 *  - Create (new key) + Clone (copy existing into new key)
 *  - Tabs: Identity | Skills & MCPs | Verhalten | Approval-Policies | Stream | Verlauf
 *  - Save → PUT with change_note; hot-reload note; version history refresh after save
 *  - Delete with confirm dialog
 */

import { useEffect, useState, useCallback } from 'preact/hooks';
import {
  listPersonas,
  getPersona,
  putPersona,
  deletePersona,
  ShopApiError,
  type PersonaSpec,
} from '../../lib/shopApi';
import { TabBar, type Tab } from './TabBar';
import { IdentityTab } from './IdentityTab';
import { CouplingTab } from './CouplingTab';
import { BehaviorTab } from './BehaviorTab';
import { ApprovalTab } from './ApprovalTab';
import { StreamTab, HistoryTab } from './StreamTab';

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export default function PersonaEditor() {
  const [keys, setKeys] = useState<string[] | null>(null);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showClone, setShowClone] = useState(false);

  const loadKeys = useCallback(() => {
    setKeysError(null);
    listPersonas()
      .then((r) => setKeys(r.keys.sort()))
      .catch((e: unknown) => setKeysError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(loadKeys, [loadKeys]);

  function handleSaved(key: string) {
    loadKeys();
    setSelectedKey(key);
  }

  function handleDeleted() {
    loadKeys();
    setSelectedKey(null);
  }

  function handleCreated(key: string) {
    setShowCreate(false);
    setShowClone(false);
    loadKeys();
    setSelectedKey(key);
  }

  return (
    <div class="min-h-screen bg-[#0d0d1a] text-white">
      <div class="max-w-6xl mx-auto px-4 py-8">
        {/* Page header */}
        <div class="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold">Persona-Editor</h1>
            <p class="mt-1 text-sm text-white/50">
              Alle Verhaltens-Parameter einer Persona in einem Formular.
              Änderungen werden per PUT gegen die Shop-Config-API gespeichert;
              der Loader-Hot-Reload greift ohne Container-Restart.
            </p>
          </div>
          <div class="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => { setShowCreate(true); setShowClone(false); }}
              class="rounded-lg bg-[#E96C00] px-3 py-2 text-sm font-medium text-white hover:bg-[#E96C00]/90"
            >
              + Neu
            </button>
            {selectedKey && (
              <button
                type="button"
                onClick={() => { setShowClone(true); setShowCreate(false); }}
                class="rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/20"
              >
                Klonen
              </button>
            )}
          </div>
        </div>

        <div class="flex gap-6">
          {/* Sidebar: persona list */}
          <aside class="w-48 shrink-0">
            {keysError && (
              <div class="mb-2 text-xs text-amber-300/80">
                Fehler: {keysError}{' '}
                <button type="button" onClick={loadKeys} class="underline">
                  erneut
                </button>
              </div>
            )}
            {!keys && !keysError && (
              <div class="text-xs text-white/40 animate-pulse">lädt …</div>
            )}
            {keys && (
              <ul class="space-y-0.5">
                {keys.map((k) => (
                  <li key={k}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedKey(k);
                        setShowCreate(false);
                        setShowClone(false);
                      }}
                      class={`w-full truncate rounded-lg px-3 py-2 text-left font-mono text-xs transition-colors ${
                        selectedKey === k
                          ? 'bg-[#E96C00]/20 text-white'
                          : 'text-white/60 hover:bg-white/5 hover:text-white/80'
                      }`}
                    >
                      {k}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {/* Main editor area */}
          <main class="flex-1 min-w-0">
            {showCreate && (
              <CreateForm
                mode="create"
                onCreated={handleCreated}
                onCancel={() => setShowCreate(false)}
              />
            )}
            {showClone && selectedKey && (
              <CreateForm
                mode="clone"
                cloneFrom={selectedKey}
                onCreated={handleCreated}
                onCancel={() => setShowClone(false)}
              />
            )}
            {!showCreate && !showClone && selectedKey && (
              <EditPanel
                key={selectedKey}
                personaKey={selectedKey}
                onSaved={handleSaved}
                onDeleted={handleDeleted}
              />
            )}
            {!showCreate && !showClone && !selectedKey && (
              <div class="flex h-64 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <p class="text-sm text-white/40">
                  Persona aus der Liste wählen oder eine neue anlegen.
                </p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / Clone form
// ---------------------------------------------------------------------------

interface CreateFormProps {
  mode: 'create' | 'clone';
  cloneFrom?: string;
  onCreated: (key: string) => void;
  onCancel: () => void;
}

function CreateForm({ mode, cloneFrom, onCreated, onCancel }: CreateFormProps) {
  const [newKey, setNewKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const k = newKey.trim();
    if (!k) return;
    setSaving(true);
    setError(null);
    try {
      let spec: Partial<PersonaSpec>;
      if (mode === 'clone' && cloneFrom) {
        const src = await getPersona(cloneFrom);
        spec = { ...src, key: k, display_name: `${src.display_name} (Kopie)`, version: '' };
      } else {
        spec = {
          key: k,
          display_name: k,
          identity_prose: '',
          baseline_ref: 'shared/baselines/default-v1.md',
          model: 'qwen36-35b',
          reasoning: false,
          track_sovereign: true,
          track_microsoft: false,
          skills: [],
          mcps: [],
          tools: null,
          wertstrom: '',
          stream_lead: false,
          routing_keywords: [],
          footer_signature: `verfasst von ${k} (KI-Agent)`,
          approval_policies: {},
          version: '',
        };
      }
      await putPersona(k, { ...spec, change_note: mode === 'clone' ? `Geklont von ${cloneFrom}` : 'Erstellt' });
      onCreated(k);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="rounded-xl border border-white/10 bg-white/5 p-5">
      <h2 class="mb-4 text-base font-semibold">
        {mode === 'clone' ? `Persona klonen (von: ${cloneFrom})` : 'Neue Persona anlegen'}
      </h2>
      <div class="flex gap-3">
        <input
          type="text"
          value={newKey}
          onInput={(e) => setNewKey((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="persona-key (lowercase, keine Leerzeichen)"
          class="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
          disabled={saving}
        />
        <button
          type="button"
          onClick={submit}
          disabled={saving || !newKey.trim()}
          class="rounded-lg bg-[#E96C00] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#E96C00]/90 disabled:opacity-50"
        >
          {saving ? 'Anlegen …' : mode === 'clone' ? 'Klonen' : 'Anlegen'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          class="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
        >
          Abbrechen
        </button>
      </div>
      {error && (
        <div class="mt-3 rounded bg-red-900/40 px-3 py-2 text-xs text-red-200">{error}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit panel (tabbed editor for an existing persona)
// ---------------------------------------------------------------------------

interface EditPanelProps {
  personaKey: string;
  onSaved: (key: string) => void;
  onDeleted: () => void;
}

function EditPanel({ personaKey, onSaved, onDeleted }: EditPanelProps) {
  const [spec, setSpec] = useState<PersonaSpec | null>(null);
  const [draft, setDraft] = useState<PersonaSpec | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('identity');
  const [changeNote, setChangeNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Bump this to force HistoryTab to re-fetch after save
  const [historyBust, setHistoryBust] = useState(0);

  useEffect(() => {
    setSpec(null);
    setDraft(null);
    setLoadError(null);
    setSaveError(null);
    setSaveSuccess(false);
    setTab('identity');
    getPersona(personaKey)
      .then((p) => {
        setSpec(p);
        setDraft(p);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [personaKey]);

  function patch(updates: Partial<PersonaSpec>) {
    setDraft((d) => (d ? { ...d, ...updates } : d));
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const updated = await putPersona(draft.key, { ...draft, change_note: changeNote || undefined });
      setSpec(updated);
      setDraft(updated);
      setSaveSuccess(true);
      setHistoryBust((n) => n + 1);
      onSaved(draft.key);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    try {
      await deletePersona(personaKey);
      onDeleted();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
      setConfirmDelete(false);
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

  return (
    <div class="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      {/* Persona header */}
      <div class="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <div>
          <span class="font-semibold text-white">{draft.display_name}</span>
          <span class="ml-2 font-mono text-xs text-white/40">{draft.key}</span>
          <span class="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">
            v{draft.version}
          </span>
          {isDirty && (
            <span class="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">
              ungespeichert
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          class="rounded-lg border border-red-700/30 px-3 py-1 text-xs text-red-400 hover:bg-red-900/20"
        >
          Löschen
        </button>
      </div>

      {/* Tabs */}
      <TabBar active={tab} onChange={setTab} />

      {/* Tab content */}
      <div class="p-5">
        {tab === 'identity' && <IdentityTab draft={draft} onChange={patch} />}
        {tab === 'coupling' && <CouplingTab draft={draft} onChange={patch} />}
        {tab === 'behavior' && <BehaviorTab draft={draft} onChange={patch} />}
        {tab === 'approval' && <ApprovalTab draft={draft} onChange={patch} />}
        {tab === 'stream' && <StreamTab personaKey={personaKey} />}
        {tab === 'history' && <HistoryTab key={`${personaKey}-${historyBust}`} personaKey={personaKey} />}
      </div>

      {/* Save bar */}
      {tab !== 'stream' && tab !== 'history' && (
        <div class="border-t border-white/10 px-5 py-3">
          <div class="flex items-center gap-3">
            <input
              type="text"
              value={changeNote}
              onInput={(e) => setChangeNote((e.target as HTMLInputElement).value)}
              placeholder="Change-Note (optional) …"
              class="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
              disabled={saving}
            />
            <button
              type="button"
              onClick={save}
              disabled={saving || !isDirty}
              class="rounded-lg bg-[#E96C00] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#E96C00]/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Speichern …' : 'Speichern → live'}
            </button>
          </div>

          {saveError && (
            <div class="mt-2 rounded bg-red-900/40 px-3 py-2 text-xs text-red-200">
              {saveError}
            </div>
          )}
          {saveSuccess && (
            <div class="mt-2 rounded bg-green-900/40 px-3 py-2 text-xs text-green-300">
              Gespeichert. Der Persona-Loader hot-reloaded automatisch — kein Container-Restart
              nötig. Versionsverlauf wurde aktualisiert.
            </div>
          )}
        </div>
      )}

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div class="max-w-sm rounded-2xl border border-white/10 bg-[#15152a] p-6">
            <h3 class="text-lg font-semibold text-white">Persona löschen?</h3>
            <p class="mt-2 text-sm text-white/70">
              <b>{draft.display_name}</b> (<code class="text-xs">{draft.key}</code>) wird
              permanent gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <div class="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                class="rounded-lg px-3 py-1.5 text-sm text-white/70 hover:text-white"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={doDelete}
                disabled={deleting}
                class="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {deleting ? 'Löschen …' : 'Ja, löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
