import { useEffect, useState, useCallback } from 'preact/hooks';
import { loadState } from '../lib/wizard-state';
import {
  getApprovals,
  setApproval,
  getApprovalHistory,
  type ApprovalMatrix,
  type ApprovalTool,
  type ApprovalMode,
  type ApprovalHistory,
} from '../lib/api';

/**
 * Persona-Approval-Management (P86.5) — Claude-style Allow/Ask/Deny per tool.
 *
 * Two tabs:
 *  - "Freigaben": Tool × Radio (Allow/Ask/Deny/Trusted-Empfänger) matrix; each
 *    change PUTs immediately (write→build→validate→reload upstream). Plus a
 *    "Persona vor-freigeben" batch button that sets every gated tool to Allow.
 *  - "Verlauf": timeline of gate firings + policy changes, and active live grants.
 *
 * Auth: the per-tenant bearer from the onboarding wizard (localStorage). When
 * there is no tenant session, or the persona is not in the tenant's allowlist,
 * the surface fails soft with a hint rather than crashing the persona page.
 */

const MODE_LABEL: Record<ApprovalMode, string> = {
  allow: 'Allow',
  ask: 'Ask',
  deny: 'Deny',
  recipient: 'Trusted-Empfänger',
};

const MODE_HINT: Record<ApprovalMode, string> = {
  allow: 'Immer ausführen — keine Rückfrage.',
  ask: 'Vor jedem Aufruf nachfragen (Default).',
  deny: 'Immer blockieren.',
  recipient: 'Nur für vertraute Empfänger automatisch erlauben.',
};

interface Props {
  personaKey: string;
  personaName: string;
}

export default function PersonaApprovals({ personaKey, personaName }: Props) {
  const [session, setSession] = useState<{ tenantId: string; token: string } | null>(null);
  const [tab, setTab] = useState<'freigaben' | 'verlauf'>('freigaben');

  useEffect(() => {
    const s = loadState();
    if (s.tenantId && s.token) setSession({ tenantId: s.tenantId, token: s.token });
  }, []);

  if (!session) {
    return (
      <div class="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
        Freigaben verwalten setzt eine aktive Tenant-Sitzung voraus.{' '}
        <a href="/onboarding" class="text-indigo-300 hover:text-indigo-200 underline">
          Onboarding starten
        </a>
        .
      </div>
    );
  }

  return (
    <div class="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <div class="flex border-b border-white/10 text-sm">
        <button
          type="button"
          onClick={() => setTab('freigaben')}
          class={`px-4 py-2.5 font-medium transition-colors ${
            tab === 'freigaben' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
          }`}
        >
          Freigaben
        </button>
        <button
          type="button"
          onClick={() => setTab('verlauf')}
          class={`px-4 py-2.5 font-medium transition-colors ${
            tab === 'verlauf' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
          }`}
        >
          Verlauf
        </button>
      </div>

      <div class="p-4">
        {tab === 'freigaben' ? (
          <FreigabenTab
            tenantId={session.tenantId}
            token={session.token}
            personaKey={personaKey}
            personaName={personaName}
          />
        ) : (
          <VerlaufTab
            tenantId={session.tenantId}
            token={session.token}
            personaKey={personaKey}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Freigaben tab — matrix + preapprove batch
// ---------------------------------------------------------------------------

interface TabProps {
  tenantId: string;
  token: string;
  personaKey: string;
}

function FreigabenTab({ tenantId, token, personaKey, personaName }: TabProps & { personaName: string }) {
  const [matrix, setMatrix] = useState<ApprovalMatrix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // tool currently saving
  const [confirmBatch, setConfirmBatch] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setMatrix(await getApprovals(tenantId, token, personaKey));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [tenantId, token, personaKey]);

  useEffect(() => {
    load();
  }, [load]);

  const updateTool = useCallback(
    async (tool: ApprovalTool, mode: ApprovalMode, patterns?: string[]) => {
      setSaving(tool.tool);
      setError(null);
      // Optimistic update.
      setMatrix((m) =>
        m
          ? {
              ...m,
              tools: m.tools.map((t) =>
                t.tool === tool.tool
                  ? { ...t, mode, source: 'bundle', trusted_patterns: patterns ?? t.trusted_patterns }
                  : t,
              ),
            }
          : m,
      );
      try {
        const body =
          mode === 'recipient'
            ? { mode, trusted_patterns: patterns ?? tool.trusted_patterns, match_arg: tool.match_arg ?? undefined }
            : { mode };
        const updated = await setApproval(tenantId, token, personaKey, tool.tool, body);
        setMatrix((m) =>
          m ? { ...m, tools: m.tools.map((t) => (t.tool === tool.tool ? updated : t)) } : m,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        await load(); // re-sync on failure (revert optimistic change)
      } finally {
        setSaving(null);
      }
    },
    [tenantId, token, personaKey, load],
  );

  const preapproveAll = useCallback(async () => {
    setConfirmBatch(false);
    const gated = (matrix?.tools ?? []).filter((t) => t.mode !== 'allow');
    for (const t of gated) {
      // Sequential — each PUT triggers an upstream bundle rebuild + hot-reload.
      // eslint-disable-next-line no-await-in-loop
      await updateTool(t, 'allow');
    }
  }, [matrix, updateTool]);

  if (error && !matrix) {
    return (
      <div class="text-sm text-amber-300/80">
        Freigaben nicht abrufbar: {error}
        <button type="button" onClick={load} class="ml-2 underline hover:text-amber-200">
          erneut
        </button>
      </div>
    );
  }
  if (!matrix) return <div class="text-xs text-white/40 animate-pulse">lädt …</div>;

  const gatedCount = matrix.tools.filter((t) => t.mode !== 'allow').length;

  return (
    <div class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <p class="text-xs text-white/50">
          {matrix.tools.length} freigabepflichtige Tools · {gatedCount} noch nicht auf Allow
        </p>
        <button
          type="button"
          disabled={gatedCount === 0 || saving !== null}
          onClick={() => setConfirmBatch(true)}
          class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Persona vor-freigeben
        </button>
      </div>

      {error && <div class="rounded bg-red-900/40 px-3 py-2 text-xs text-red-200">{error}</div>}

      <ul class="divide-y divide-white/5">
        {matrix.tools.map((t) => (
          <ToolRow
            key={t.tool}
            tool={t}
            saving={saving === t.tool}
            onChange={(mode, patterns) => updateTool(t, mode, patterns)}
          />
        ))}
      </ul>

      {confirmBatch && (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div class="max-w-md rounded-2xl border border-white/10 bg-[#15152a] p-6">
            <h3 class="text-lg font-semibold text-white">Persona vor-freigeben?</h3>
            <p class="mt-2 text-sm text-white/70">
              Setzt alle {gatedCount} noch nicht freigegebenen Tools von <b>{personaName}</b> auf{' '}
              <b>Allow</b>. {personaName} kann diese dann ohne Rückfrage ausführen — auch
              destruktive/outbound-Aktionen. Einzeln jederzeit zurücknehmbar.
            </p>
            <div class="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmBatch(false)}
                class="rounded-lg px-3 py-1.5 text-sm text-white/70 hover:text-white"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={preapproveAll}
                class="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Alle auf Allow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolRow({
  tool,
  saving,
  onChange,
}: {
  tool: ApprovalTool;
  saving: boolean;
  onChange: (mode: ApprovalMode, patterns?: string[]) => void;
}) {
  const [patternDraft, setPatternDraft] = useState((tool.trusted_patterns ?? []).join(', '));

  const commitPatterns = () => {
    const patterns = patternDraft
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    onChange('recipient', patterns);
  };

  return (
    <li class="py-3">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <span class="font-mono text-sm text-white">{tool.tool}</span>
          {tool.source === 'default' && (
            <span class="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">
              Default
            </span>
          )}
        </div>
        <div class="flex shrink-0 gap-1" role="radiogroup" aria-label={`Freigabe ${tool.tool}`}>
          {(['allow', 'ask', 'deny', 'recipient'] as ApprovalMode[]).map((mode) => {
            const active = tool.mode === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={saving}
                title={MODE_HINT[mode]}
                onClick={() => mode !== tool.mode && onChange(mode)}
                class={`rounded-md px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
                  active
                    ? mode === 'deny'
                      ? 'bg-red-600 text-white'
                      : mode === 'allow'
                        ? 'bg-green-600 text-white'
                        : 'bg-indigo-600 text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                {MODE_LABEL[mode]}
              </button>
            );
          })}
        </div>
      </div>
      {tool.mode === 'recipient' && (
        <div class="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={patternDraft}
            disabled={saving}
            placeholder="*@pommerconsulting.de, chef@kunde.de"
            onInput={(e) => setPatternDraft((e.target as HTMLInputElement).value)}
            class="flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/30"
          />
          <button
            type="button"
            disabled={saving}
            onClick={commitPatterns}
            class="rounded-md bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20 disabled:opacity-50"
          >
            Speichern
          </button>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Verlauf tab — audit timeline + live grants
// ---------------------------------------------------------------------------

function VerlaufTab({ tenantId, token, personaKey }: TabProps) {
  const [history, setHistory] = useState<ApprovalHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setHistory(await getApprovalHistory(tenantId, token, personaKey, { limit: 50 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [tenantId, token, personaKey]);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !history) {
    return (
      <div class="text-sm text-amber-300/80">
        Verlauf nicht abrufbar: {error}
        <button type="button" onClick={load} class="ml-2 underline hover:text-amber-200">
          erneut
        </button>
      </div>
    );
  }
  if (!history) return <div class="text-xs text-white/40 animate-pulse">lädt …</div>;

  return (
    <div class="space-y-4">
      {history.live_grants.length > 0 && (
        <div>
          <div class="mb-1 text-xs font-semibold text-white/80">Aktive Grants</div>
          <ul class="space-y-1">
            {history.live_grants.map((g, i) => (
              <li key={i} class="text-xs text-white/70">
                <span class="font-mono text-white">{g.tool}</span>
                <span class="text-white/40"> · {g.scope}</span>
                {g.ttl_seconds != null && (
                  <span class="text-white/40"> · noch {Math.round(g.ttl_seconds / 60)} min</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div class="mb-1 flex items-center justify-between">
          <span class="text-xs font-semibold text-white/80">
            Entscheidungen ({history.total})
          </span>
          {!history.audit_enabled && (
            <span class="text-[10px] text-amber-300/70">Audit-Log deaktiviert</span>
          )}
        </div>
        {history.entries.length === 0 ? (
          <div class="text-xs text-white/40 italic">Noch keine Gate-Entscheidungen aufgezeichnet.</div>
        ) : (
          <ul class="space-y-2 border-l border-white/10 pl-3">
            {history.entries.map((e, i) => (
              <li key={i} class="text-xs">
                <div class="flex items-baseline gap-2">
                  <span class="font-mono text-white">{e.tool ?? e.kind ?? '—'}</span>
                  {e.decision && (
                    <span
                      class={
                        e.decision === 'deny'
                          ? 'text-red-400'
                          : e.decision === 'allow'
                            ? 'text-green-400'
                            : 'text-white/60'
                      }
                    >
                      {e.decision}
                    </span>
                  )}
                  {e.kind === 'policy_change' && (
                    <span class="text-indigo-300/80">Policy geändert</span>
                  )}
                </div>
                {(e.at || e.by) && (
                  <div class="text-white/40">
                    {e.at}
                    {e.by ? ` · ${e.by}` : ''}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
