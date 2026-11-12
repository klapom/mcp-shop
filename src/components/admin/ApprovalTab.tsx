/**
 * Freigaben tab — per-tool approval policies (the persona's gate rules).
 *
 * Five modes: Erlauben (allow) · Protokollieren (log_only) · Nachfragen (require_approval) ·
 * Ablehnen (deny) · Trusted-Empfänger (match_arg + trusted_patterns + on_mismatch).
 * Semantics (agent-firm-V1 config/gated_tools.py + approval_gate engine): without a policy
 * a tool is ALLOWED; only the gated tools have a default (chat: ask, cron: deny). A
 * persona policy overrides that default on every path, including cron.
 * The gate re-reads policies from Neo4j — they take effect ≤5 min after saving, no rollout.
 *
 * H16: each rule shows its decision history (gate audit of the gateway, one request per tab
 * open, grouped client-side by `rule`). Standard rules without an own row show their history
 * in the defaults box — only when they have entries. A failing history never blocks editing.
 */
import { useEffect, useState } from 'preact/hooks';
import {
  getApprovalHistory,
  ShopApiError,
  type ApprovalHistory,
  type ApprovalHistoryEntry,
  type PersonaSpec,
  type ApprovalPolicy,
  type PolicyMismatch,
} from '../../lib/shopApi';

type PolicyMode = 'allow' | 'log_only' | 'ask' | 'deny' | 'recipient';

const MODES: PolicyMode[] = ['allow', 'log_only', 'ask', 'deny', 'recipient'];

const MODE_LABEL: Record<PolicyMode, string> = {
  allow: 'Erlauben',
  log_only: 'Protokollieren',
  ask: 'Nachfragen',
  deny: 'Ablehnen',
  recipient: 'Trusted-Empfänger',
};

const MODE_HINT: Record<PolicyMode, string> = {
  allow: 'Immer ausführen, ohne Rückfrage (auch im Cron).',
  log_only: 'Ausführen und im Freigabe-Protokoll vermerken (auch im Cron).',
  ask: 'Im Chat vor jedem Aufruf nachfragen; im Cron abgelehnt.',
  deny: 'Immer blockieren.',
  recipient: 'Bei vertrauten Empfängern ausführen, sonst die gewählte Abweichungs-Regel.',
};

const MISMATCH_LABEL: Record<PolicyMismatch, string> = {
  require_approval: 'Nachfragen',
  deny: 'Ablehnen',
  log_only: 'Protokollieren',
};

function policyToMode(policy: ApprovalPolicy): PolicyMode {
  switch (policy.always) {
    case 'allow':
      return 'allow';
    case 'log_only':
      return 'log_only';
    case 'deny':
      return 'deny';
    case 'require_approval':
      return 'ask';
    default:
      return 'recipient';
  }
}

function modeToPolicy(mode: PolicyMode, prev: ApprovalPolicy): ApprovalPolicy {
  if (mode === 'allow') return { always: 'allow' };
  if (mode === 'log_only') return { always: 'log_only' };
  if (mode === 'deny') return { always: 'deny' };
  if (mode === 'ask') return { always: 'require_approval' };
  // recipient — keep what the row had; match_arg must be filled in before saving
  return {
    match_arg: prev.match_arg ?? null,
    trusted_patterns: prev.trusted_patterns ?? [],
    on_mismatch: prev.on_mismatch ?? 'require_approval',
  };
}

/** What would make the API answer 422 — checked before saving (Speichern stays locked). */
export function policyProblems(policies: Record<string, ApprovalPolicy> | undefined): string[] {
  const out: string[] = [];
  for (const [tool, p] of Object.entries(policies ?? {})) {
    if (!p.always && !(p.match_arg ?? '').trim()) {
      out.push(`Freigabe „${tool}“: Trusted-Empfänger braucht das zu prüfende Argument (z. B. „to“).`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// History (H16)
// ---------------------------------------------------------------------------

const ACTION_LABEL: Record<string, string> = {
  approval_requested: 'Karte gezeigt',
  approved_once: 'einmal freigegeben',
  approved_session: 'für die Sitzung freigegeben',
  always_as_session: '„immer“ → für die Sitzung freigegeben',
  session_grant: 'Sitzungs-Freigabe genutzt',
  denied: 'abgelehnt',
  denied_repeat: 'erneut abgelehnt (keine Karte)',
  timeout: 'keine Antwort (Zeit abgelaufen)',
  require_approval: 'Freigabe nötig',
  deny: 'blockiert (Regel)',
  no_channel: 'blockiert (kein Kanal für die Karte)',
  preview_no_confirm: 'Vorschau, ohne Rückfrage',
  allow: 'automatisch erlaubt',
  log_only: 'ausgeführt + protokolliert',
};

const KLASS_STYLE: Record<string, string> = {
  entscheidung: 'text-white/80',
  frage: 'text-indigo-200/80',
  blockiert: 'text-red-300/90',
  auto: 'text-white/40',
  sonstige: 'text-white/50',
};

function actionLabel(action: string): string {
  if (ACTION_LABEL[action]) return ACTION_LABEL[action];
  if (action.startsWith('blocked_')) return `blockiert (${action.slice(8)})`;
  return action;
}

function fmtTs(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? ts
    : d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' });
}

type HistoryState =
  | { status: 'loading' }
  | { status: 'ok'; data: ApprovalHistory; byRule: Record<string, ApprovalHistoryEntry[]> }
  | { status: 'error'; message: string };

function useApprovalHistory(personaKey: string): HistoryState {
  const [state, setState] = useState<HistoryState>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    getApprovalHistory(personaKey)
      .then((data) => {
        const byRule: Record<string, ApprovalHistoryEntry[]> = {};
        for (const e of data.entries) {
          if (e.rule) (byRule[e.rule] ??= []).push(e);
        }
        if (alive) setState({ status: 'ok', data, byRule });
      })
      .catch((e) => {
        let message = e instanceof Error ? e.message : String(e);
        if (e instanceof ShopApiError && e.status === 409) message = 'Container läuft nicht — kein Verlauf.';
        if (e instanceof ShopApiError && e.status === 404) message = 'Kein Container (eingefroren) — kein Verlauf.';
        if (alive) setState({ status: 'error', message: `Verlauf nicht verfügbar: ${message}` });
      });
    return () => {
      alive = false;
    };
  }, [personaKey]);
  return state;
}

function HistoryList({ entries, testId }: { entries: ApprovalHistoryEntry[]; testId: string }) {
  if (entries.length === 0) {
    return (
      <p class="mt-1 text-[11px] italic text-white/30" data-testid={`${testId}-empty`}>
        noch keine Entscheidungen
      </p>
    );
  }
  return (
    <details class="mt-1" data-testid={testId}>
      <summary class="cursor-pointer text-[11px] text-white/50 hover:text-white/70">
        Verlauf ({entries.length})
      </summary>
      <ul class="mt-1 space-y-0.5 pl-2">
        {entries.map((e, i) => (
          <li key={i} class={`flex flex-wrap gap-2 text-[11px] ${KLASS_STYLE[e.klass] ?? 'text-white/50'}`}>
            <span class="font-mono text-white/40">{fmtTs(e.ts)}</span>
            <span data-testid="history-action">{actionLabel(e.action)}</span>
            {e.headless && <span class="rounded bg-white/10 px-1 text-[10px] text-white/60">Cron</span>}
            {e.tool_raw !== e.rule && <span class="font-mono text-white/30">{e.tool_raw}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

interface Props {
  personaKey: string;
  draft: PersonaSpec;
  gatedTools: string[] | null;
  /** all tool names from the catalog groups — autocomplete for new rows */
  knownTools: string[];
  onChange: (patch: Partial<PersonaSpec>) => void;
}

export function ApprovalTab({ personaKey, draft, gatedTools, knownTools, onChange }: Props) {
  const [newTool, setNewTool] = useState('');
  const history = useApprovalHistory(personaKey);
  const byRule = history.status === 'ok' ? history.byRule : {};
  const policies = draft.approval_policies ?? {};

  function setPolicy(tool: string, policy: ApprovalPolicy) {
    onChange({ approval_policies: { ...policies, [tool]: policy } });
  }

  function removeTool(tool: string) {
    const next = { ...policies };
    delete next[tool];
    onChange({ approval_policies: next });
  }

  function addTool() {
    const key = newTool.trim();
    if (!key || key in policies) return;
    setPolicy(key, { always: 'require_approval' });
    setNewTool('');
  }

  const tools = Object.keys(policies);
  const suggestions = [...new Set([...(gatedTools ?? []), ...knownTools])].filter((t) => !(t in policies)).sort();

  return (
    <div class="space-y-4">
      <div class="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/60" data-testid="approval-defaults">
        <p>
          <b class="text-white/80">Standard ohne eigene Regel:</b> erlaubt. Nur diese{' '}
          {gatedTools ? gatedTools.length : '…'} Werkzeuge fragen im Chat nach und werden im Cron
          abgelehnt. Eine eigene Regel (auch „Protokollieren“ oder „Erlauben“) überschreibt das —
          auch im Cron.
        </p>
        {gatedTools && (
          <ul class="mt-2 flex flex-wrap gap-1" data-testid="gated-tools">
            {gatedTools.map((t) => (
              <li
                key={t}
                class={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                  t in policies ? 'bg-indigo-600/30 text-indigo-200' : 'bg-white/5 text-white/50'
                }`}
                title={t in policies ? 'hier mit eigener Regel' : 'Standard: Chat nachfragen, Cron ablehnen'}
              >
                {t}
              </li>
            ))}
          </ul>
        )}
        <p class="mt-2 text-white/40">
          Werkzeug-Namen passen exakt oder als Endung: <code>send_email</code> gilt auch für{' '}
          <code>m365_send_email</code>. Freigaben wirken nach ≤5 min, ohne Ausrollen.
        </p>
        {gatedTools &&
          gatedTools
            .filter((t) => !(t in policies) && (byRule[t]?.length ?? 0) > 0)
            .map((t) => (
              <div key={t} class="mt-2" data-testid={`default-history-${t}`}>
                <span class="font-mono text-[11px] text-white/70">{t}</span>
                <HistoryList entries={byRule[t]} testId={`history-${t}`} />
              </div>
            ))}
      </div>

      {history.status === 'error' && (
        <p class="text-xs text-amber-300/80" data-testid="history-error">
          {history.message}
        </p>
      )}
      {history.status === 'ok' && history.data.auto_count > 0 && (
        <p class="text-[11px] text-white/30" data-testid="history-auto-count">
          Dazu {history.data.auto_count} automatisch erlaubte Aufrufe (nicht einzeln gelistet).
          {history.data.truncated && ' Nur die jüngsten Einträge gelesen.'}
        </p>
      )}

      {tools.length === 0 && (
        <p class="text-sm text-white/30 italic">Keine eigenen Regeln — es gilt der Standard.</p>
      )}

      <ul class="divide-y divide-white/5">
        {tools.map((tool) => (
          <PolicyRow
            key={tool}
            tool={tool}
            policy={policies[tool]}
            history={history.status === 'ok' ? (byRule[tool] ?? []) : null}
            onSet={(p) => setPolicy(tool, p)}
            onRemove={() => removeTool(tool)}
          />
        ))}
      </ul>

      <div class="flex gap-2 pt-2">
        <input
          type="text"
          value={newTool}
          list="approval-tool-suggestions"
          onInput={(e) => setNewTool((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && addTool()}
          placeholder="Werkzeug hinzufügen …"
          class="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
        />
        <datalist id="approval-tool-suggestions">
          {suggestions.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={addTool}
          class="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
        >
          + Hinzufügen
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-tool row
// ---------------------------------------------------------------------------

function PolicyRow({
  tool,
  policy,
  history,
  onSet,
  onRemove,
}: {
  tool: string;
  policy: ApprovalPolicy;
  /** null = history not loaded (loading/error) */
  history: ApprovalHistoryEntry[] | null;
  onSet: (p: ApprovalPolicy) => void;
  onRemove: () => void;
}) {
  const mode = policyToMode(policy);
  const [patternDraft, setPatternDraft] = useState((policy.trusted_patterns ?? []).join(', '));
  const missingArg = mode === 'recipient' && !(policy.match_arg ?? '').trim();

  return (
    <li class="py-3" data-testid={`policy-${tool}`}>
      <div class="flex flex-wrap items-center gap-3">
        <span class="flex-1 min-w-0 font-mono text-sm text-white truncate">{tool}</span>
        <div class="flex shrink-0 gap-1" role="radiogroup" aria-label={`Freigabe ${tool}`}>
          {MODES.map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={active}
                title={MODE_HINT[m]}
                onClick={() => m !== mode && onSet(modeToPolicy(m, policy))}
                class={`rounded-md px-2 py-1 text-xs transition-colors ${
                  active
                    ? m === 'deny'
                      ? 'bg-red-600 text-white'
                      : m === 'allow'
                        ? 'bg-green-600 text-white'
                        : m === 'log_only'
                          ? 'bg-teal-600 text-white'
                          : 'bg-indigo-600 text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                {MODE_LABEL[m]}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onRemove}
          title="Regel entfernen (dann gilt der Standard)"
          class="ml-1 rounded p-1 text-white/30 hover:text-red-400 hover:bg-white/5"
        >
          ✕
        </button>
      </div>

      {mode === 'recipient' && (
        <div class="mt-2 space-y-2 pl-1">
          <div>
            <label class="mb-0.5 block text-[11px] text-white/40">
              Zu prüfendes Argument (Pflicht, z. B. „to“)
            </label>
            <input
              type="text"
              value={policy.match_arg ?? ''}
              placeholder="to"
              data-testid="match-arg"
              onInput={(e) => onSet({ ...policy, match_arg: (e.target as HTMLInputElement).value || null })}
              class={`w-full rounded border bg-black/30 px-2 py-1 font-mono text-xs text-white placeholder:text-white/30 ${
                missingArg ? 'border-red-500/70' : 'border-white/10'
              }`}
            />
            {missingArg && (
              <p class="mt-0.5 text-[11px] text-red-300" data-testid="match-arg-missing">
                Ohne Argument würde jede Nachricht als „nicht vertraut“ gelten — bitte ausfüllen.
              </p>
            )}
          </div>
          <div>
            <label class="mb-0.5 block text-[11px] text-white/40">
              Vertraute Empfänger (Muster, kommagetrennt)
            </label>
            <input
              type="text"
              value={patternDraft}
              placeholder="*@pommerconsulting.de, chef@kunde.de"
              onInput={(e) => {
                const raw = (e.target as HTMLInputElement).value;
                setPatternDraft(raw);
                onSet({
                  ...policy,
                  trusted_patterns: raw.split(',').map((s) => s.trim()).filter(Boolean),
                });
              }}
              class="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/30"
            />
          </div>
          <div>
            <label class="mb-0.5 block text-[11px] text-white/40">Sonst (nicht vertraut)</label>
            <select
              value={policy.on_mismatch ?? 'require_approval'}
              onChange={(e) =>
                onSet({ ...policy, on_mismatch: (e.target as HTMLSelectElement).value as PolicyMismatch })
              }
              class="rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-white"
            >
              {(Object.keys(MISMATCH_LABEL) as PolicyMismatch[]).map((m) => (
                <option key={m} value={m}>
                  {MISMATCH_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {history && <HistoryList entries={history} testId={`history-${tool}`} />}
    </li>
  );
}
