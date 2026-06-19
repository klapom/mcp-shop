/**
 * H4.4 — Approval-Policies tab.
 *
 * Per-tool rows: Allow / Ask / Deny / Recipient-gated.
 * Recipient-gated exposes match_arg + trusted_patterns + on_mismatch.
 * The user can add new tool rows and remove existing ones.
 */
import { useState } from 'preact/hooks';
import type { PersonaSpec, ApprovalPolicy } from '../../lib/shopApi';

type PolicyMode = 'allow' | 'ask' | 'deny' | 'recipient';

interface Props {
  draft: PersonaSpec;
  onChange: (patch: Partial<PersonaSpec>) => void;
}

const MODE_LABEL: Record<PolicyMode, string> = {
  allow: 'Allow',
  ask: 'Ask',
  deny: 'Deny',
  recipient: 'Trusted-Empfänger',
};

const MODE_HINT: Record<PolicyMode, string> = {
  allow: 'Immer ausführen — keine Rückfrage.',
  ask: 'Vor jedem Aufruf nachfragen (Default).',
  deny: 'Immer blockieren.',
  recipient: 'Nur für vertraute Empfänger automatisch erlauben.',
};

function policyToMode(policy: ApprovalPolicy): PolicyMode {
  if (!policy.always) return 'recipient';
  if (policy.always === 'allow' || policy.always === 'always:allow') return 'allow';
  if (policy.always === 'deny' || policy.always === 'always:deny') return 'deny';
  return 'ask';
}

function modeToPolicy(mode: PolicyMode, prev: ApprovalPolicy): ApprovalPolicy {
  if (mode === 'allow') return { always: 'allow' };
  if (mode === 'deny') return { always: 'deny' };
  if (mode === 'ask') return { always: 'require_approval' };
  // recipient — keep match_arg + trusted_patterns from prev
  return {
    match_arg: prev.match_arg ?? null,
    trusted_patterns: prev.trusted_patterns ?? [],
    on_mismatch: prev.on_mismatch ?? 'require_approval',
  };
}

export function ApprovalTab({ draft, onChange }: Props) {
  const [newTool, setNewTool] = useState('');
  const policies = draft.approval_policies ?? {};

  function updatePolicy(tool: string, patch: Partial<ApprovalPolicy>) {
    onChange({
      approval_policies: {
        ...policies,
        [tool]: { ...policies[tool], ...patch },
      },
    });
  }

  function removeTool(tool: string) {
    const next = { ...policies };
    delete next[tool];
    onChange({ approval_policies: next });
  }

  function addTool() {
    const key = newTool.trim();
    if (!key || key in policies) return;
    onChange({
      approval_policies: {
        ...policies,
        [key]: { always: 'require_approval' },
      },
    });
    setNewTool('');
  }

  const tools = Object.keys(policies);

  return (
    <div class="space-y-4">
      <p class="text-xs text-white/40">
        Jedes Tool bekommt eine Policy. „Ask" ist fail-closed-Default. Änderungen wirken nach
        Save + Loader-Hot-Reload (kein Container-Restart nötig).
      </p>

      {tools.length === 0 && (
        <p class="text-sm text-white/30 italic">Noch keine expliziten Policies definiert.</p>
      )}

      <ul class="divide-y divide-white/5">
        {tools.map((tool) => (
          <PolicyRow
            key={tool}
            tool={tool}
            policy={policies[tool]}
            onUpdate={(patch) => updatePolicy(tool, patch)}
            onRemove={() => removeTool(tool)}
          />
        ))}
      </ul>

      {/* Add new tool row */}
      <div class="flex gap-2 pt-2">
        <input
          type="text"
          value={newTool}
          onInput={(e) => setNewTool((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && addTool()}
          placeholder="Tool-Name hinzufügen…"
          class="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
        />
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
  onUpdate,
  onRemove,
}: {
  tool: string;
  policy: ApprovalPolicy;
  onUpdate: (patch: Partial<ApprovalPolicy>) => void;
  onRemove: () => void;
}) {
  const mode = policyToMode(policy);
  const [patternDraft, setPatternDraft] = useState(
    (policy.trusted_patterns ?? []).join(', '),
  );

  function setMode(m: PolicyMode) {
    const next = modeToPolicy(m, policy);
    onUpdate(next);
  }

  return (
    <li class="py-3">
      <div class="flex items-center gap-3">
        <span class="flex-1 min-w-0 font-mono text-sm text-white truncate">{tool}</span>
        <div class="flex shrink-0 gap-1" role="radiogroup" aria-label={`Policy ${tool}`}>
          {(['allow', 'ask', 'deny', 'recipient'] as PolicyMode[]).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={active}
                title={MODE_HINT[m]}
                onClick={() => m !== mode && setMode(m)}
                class={`rounded-md px-2 py-1 text-xs transition-colors ${
                  active
                    ? m === 'deny'
                      ? 'bg-red-600 text-white'
                      : m === 'allow'
                        ? 'bg-green-600 text-white'
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
          title="Policy entfernen"
          class="ml-1 rounded p-1 text-white/30 hover:text-red-400 hover:bg-white/5"
        >
          ✕
        </button>
      </div>

      {mode === 'recipient' && (
        <div class="mt-2 space-y-2 pl-1">
          <div>
            <label class="mb-0.5 block text-[11px] text-white/40">Match-Arg (Feld)</label>
            <input
              type="text"
              value={policy.match_arg ?? ''}
              placeholder="to"
              onInput={(e) =>
                onUpdate({ match_arg: (e.target as HTMLInputElement).value || null })
              }
              class="w-full rounded border border-white/10 bg-black/30 px-2 py-1 font-mono text-xs text-white placeholder:text-white/30"
            />
          </div>
          <div>
            <label class="mb-0.5 block text-[11px] text-white/40">
              Trusted Patterns (kommagetrennt)
            </label>
            <div class="flex gap-2">
              <input
                type="text"
                value={patternDraft}
                placeholder="*@pommerconsulting.de, chef@kunde.de"
                onInput={(e) => setPatternDraft((e.target as HTMLInputElement).value)}
                class="flex-1 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/30"
              />
              <button
                type="button"
                onClick={() =>
                  onUpdate({
                    trusted_patterns: patternDraft
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                class="rounded bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20"
              >
                OK
              </button>
            </div>
          </div>
          <div>
            <label class="mb-0.5 block text-[11px] text-white/40">On-Mismatch</label>
            <select
              value={policy.on_mismatch ?? 'require_approval'}
              onChange={(e) =>
                onUpdate({
                  on_mismatch: (e.target as HTMLSelectElement).value as
                    | 'deny'
                    | 'require_approval',
                })
              }
              class="rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-white"
            >
              <option value="require_approval">require_approval</option>
              <option value="deny">deny</option>
            </select>
          </div>
        </div>
      )}
    </li>
  );
}
