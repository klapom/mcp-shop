/**
 * SkillProposalsList — H8.14 Variante C: overview of all skill drafts the personas proposed.
 *
 * Grouped per persona; per draft: state badge, scanner/PII/code lights, collector hints
 * (container_changed, aborted job), Skilli's verdict, and the reject list with repeat counts.
 * Everything coming from drafts/verdicts is rendered as text (Preact escapes) — no innerHTML.
 */

import type { ComponentChildren } from 'preact';
import { useEffect, useState, useCallback } from 'preact/hooks';
import {
  listProposals,
  detailHref,
  safePrUrl,
  STATE_LABELS,
  type ProposalItem,
  type ProposalList,
  type ScanSummary,
} from '../../lib/skillProposalsApi';

// ---------------------------------------------------------------------------
// Shared presentational bits (also used by SkillProposalsDetail)
// ---------------------------------------------------------------------------

const STATE_STYLE: Record<string, string> = {
  new: 'bg-sky-500/20 text-sky-300',
  reported: 'bg-sky-500/20 text-sky-300',
  edited: 'bg-violet-500/20 text-violet-300',
  adopting: 'bg-amber-500/20 text-amber-300',
  merged: 'bg-emerald-500/20 text-emerald-300',
  rolling_out: 'bg-amber-500/20 text-amber-300',
  rolled_out: 'bg-green-600/30 text-green-300',
  rejected: 'bg-red-900/40 text-red-300',
};

export function StateBadge({ state }: { state: string | null }) {
  const s = state ?? 'unbekannt';
  return (
    <span
      data-testid="state-badge"
      class={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATE_STYLE[s] ?? 'bg-white/10 text-white/60'}`}
    >
      {STATE_LABELS[s] ?? s}
    </span>
  );
}

type Light = 'green' | 'red' | 'amber' | 'gray';
const LIGHT_STYLE: Record<Light, string> = {
  green: 'border-green-600/40 bg-green-900/30 text-green-300',
  red: 'border-red-600/40 bg-red-900/30 text-red-300',
  amber: 'border-amber-500/40 bg-amber-900/30 text-amber-300',
  gray: 'border-white/10 bg-white/5 text-white/50',
};

function Pill({ light, children, title }: { light: Light; children: ComponentChildren; title?: string }) {
  return (
    <span class={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] ${LIGHT_STYLE[light]}`} title={title}>
      <span aria-hidden="true">●</span>
      {children}
    </span>
  );
}

export function ScanLights({ scan }: { scan: ScanSummary | null }) {
  if (!scan) {
    return <Pill light="gray">kein Scan</Pill>;
  }
  const scanner: Light = scan.scanner === 'pass' ? 'green' : scan.scanner === 'error' ? 'amber' : 'red';
  const scannerText =
    scan.scanner === 'pass' ? 'Scanner grün' : scan.scanner === 'error' ? 'Scanner-Fehler' : 'Scanner rot';
  const pii: Light = scan.pii_open > 0 ? 'red' : 'green';
  const piiText =
    scan.pii_open > 0
      ? `PII offen: ${scan.pii_open}/${scan.pii_total}`
      : scan.pii_total > 0
        ? `PII bestätigt (${scan.pii_total})`
        : 'kein PII';
  return (
    <span class="inline-flex flex-wrap gap-1" data-testid="scan-lights">
      <Pill light={scanner}>{scannerText}</Pill>
      <Pill light={pii}>{piiText}</Pill>
      <Pill light={scan.carries_code ? 'amber' : 'green'}>{scan.carries_code ? 'trägt Code' : 'kein Code'}</Pill>
      {scan.symlinks > 0 && <Pill light="red">Symlinks: {scan.symlinks}</Pill>}
    </span>
  );
}

/** Collector/job hints shown in list and detail. */
export function ItemHints({ item }: { item: ProposalItem }) {
  const pr = safePrUrl(item.pr);
  return (
    <div class="space-y-1 text-xs">
      {item.container_changed && (
        <div class="rounded bg-amber-900/30 px-2 py-1 text-amber-200" data-testid="hint-container-changed">
          Die Persona hat den Entwurf seit deiner Korrektur im Container geändert — hier liegt weiter deine
          bearbeitete Fassung.
        </div>
      )}
      {item.aborted && (
        <div class="rounded bg-red-900/30 px-2 py-1 text-red-200" data-testid="hint-aborted">
          Der letzte Job ist abgebrochen (Prozess tot) — Aktion kann neu gestartet werden.
        </div>
      )}
      {item.last_error && (
        <div class="rounded bg-red-900/30 px-2 py-1 text-red-200">Letzter Fehler: {item.last_error}</div>
      )}
      {item.rollout_pending && (
        <div class="rounded bg-amber-900/30 px-2 py-1 text-amber-200">{item.rollout_pending}</div>
      )}
      {item.state === 'rejected' && item.reason && (
        <div class="text-white/50">Abgelehnt: {item.reason}</div>
      )}
      {item.repeats != null && item.repeats > 0 && (
        <div class="text-amber-300/80" data-testid="hint-repeats">
          Name war abgelehnt — die Persona hat ihn {item.repeats}× erneut vorgeschlagen.
        </div>
      )}
      {item.pr &&
        (pr ? (
          <a href={pr} target="_blank" rel="noopener noreferrer" class="text-sky-300 underline">
            PR: {pr}
          </a>
        ) : (
          <div class="text-white/50">PR: {item.pr}</div>
        ))}
    </div>
  );
}

const VERDICT_LABEL: Record<string, string> = {
  adopt: 'übernehmen',
  fix: 'nachbessern',
  reject: 'ablehnen',
};

export function ReviewBox({ review }: { review: Record<string, unknown> | null }) {
  if (!review) {
    return (
      <div class="text-xs text-white/40" data-testid="review">
        Skilli: kein strukturiertes Urteil
      </div>
    );
  }
  const rec = typeof review.recommendation === 'string' ? review.recommendation : null;
  const reason = typeof review.reason === 'string' ? review.reason : null;
  return (
    <div class="text-xs text-white/70" data-testid="review">
      <span class="font-medium text-white/90">Skilli:</span>{' '}
      {rec ? <b>{VERDICT_LABEL[rec] ?? rec}</b> : null}
      {reason ? <span> — {reason}</span> : null}
      {!rec && !reason && <pre class="mt-1 whitespace-pre-wrap text-[11px]">{JSON.stringify(review, null, 2)}</pre>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const STATE_ORDER = ['reported', 'new', 'edited', 'adopting', 'merged', 'rolling_out', 'rolled_out', 'rejected'];

function byState(a: ProposalItem, b: ProposalItem): number {
  const ia = STATE_ORDER.indexOf(a.state ?? '');
  const ib = STATE_ORDER.indexOf(b.state ?? '');
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.name.localeCompare(b.name);
}

export default function SkillProposalsList() {
  const [data, setData] = useState<ProposalList | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    listProposals()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(load, [load]);

  if (error) {
    return (
      <div class="rounded-xl border border-red-700/30 bg-red-900/20 p-5 text-sm text-red-200">
        Fehler: {error}{' '}
        <button type="button" onClick={load} class="underline">
          erneut
        </button>
      </div>
    );
  }
  if (!data) {
    return <div class="text-xs text-white/40 animate-pulse">lädt …</div>;
  }

  const groups = new Map<string, ProposalItem[]>();
  for (const p of data.proposals) {
    if (!groups.has(p.persona)) groups.set(p.persona, []);
    groups.get(p.persona)!.push(p);
  }
  const personas = [...groups.keys()].sort();
  const rejected = Object.entries(data.rejected ?? {}).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div class="space-y-6">
      {personas.length === 0 && (
        <div class="rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-white/50">
          Keine Skill-Vorschläge vorhanden.
        </div>
      )}

      {personas.map((persona) => (
        <section key={persona} data-testid={`group-${persona}`}>
          <h2 class="mb-2 font-mono text-sm font-semibold text-white/80">{persona}</h2>
          <ul class="space-y-2">
            {groups
              .get(persona)!
              .sort(byState)
              .map((p) => (
                <li
                  key={p.name}
                  class="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                  data-testid={`proposal-${p.persona}-${p.name}`}
                >
                  <div class="flex flex-wrap items-center gap-2">
                    <a href={detailHref(p.persona, p.name)} class="font-mono text-sm text-white hover:text-[#E96C00]">
                      {p.name}
                    </a>
                    <StateBadge state={p.state} />
                    <ScanLights scan={p.scan} />
                  </div>
                  <div class="mt-2 space-y-1">
                    <ReviewBox review={p.review} />
                    <ItemHints item={p} />
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ))}

      {rejected.length > 0 && (
        <section data-testid="rejected-list">
          <h2 class="mb-2 text-sm font-semibold text-white/80">Abgelehnte Namen</h2>
          <div class="overflow-x-auto rounded-xl border border-white/10">
            <table class="w-full text-left text-xs">
              <thead class="bg-white/5 text-white/50">
                <tr>
                  <th class="px-3 py-2">Persona/Skill</th>
                  <th class="px-3 py-2">Grund</th>
                  <th class="px-3 py-2">abgelehnt am</th>
                  <th class="px-3 py-2">erneut vorgeschlagen</th>
                </tr>
              </thead>
              <tbody>
                {rejected.map(([key, r]) => (
                  <tr key={key} class="border-t border-white/5">
                    <td class="px-3 py-2 font-mono">{key}</td>
                    <td class="px-3 py-2 text-white/70">{r.reason}</td>
                    <td class="px-3 py-2 text-white/50">{r.at}</td>
                    <td class={`px-3 py-2 ${r.repeats > 0 ? 'text-amber-300' : 'text-white/50'}`}>{r.repeats}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
