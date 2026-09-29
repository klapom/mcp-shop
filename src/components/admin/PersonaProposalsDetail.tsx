/**
 * PersonaProposalsDetail — H10.13b/T44: review one persona draft (?k=<key>).
 *
 * Draft fields are editable while state is `new`; adopt (with confirmation dialog) sends the
 * edited fields, reject requires a non-empty reason. API errors (409/422 …) are shown, never
 * swallowed. adopted/rejected → read-only. Untrusted content: text/vnodes only, no innerHTML.
 */

import { useEffect, useState, useCallback } from 'preact/hooks';
import {
  getPersonaProposal,
  adoptPersonaProposal,
  rejectPersonaProposal,
  type PersonaProposalDetail,
} from '../../lib/personaProposalsApi';
import { ProposalApiError, formatStamp } from '../../lib/skillProposalsApi';
import MarkdownText from './MarkdownText';
import { PersonaStateBadge } from './PersonaProposalsList';

interface ErrorInfo {
  message: string;
  problems: string[];
  status?: number;
}

function toErrorInfo(e: unknown): ErrorInfo {
  if (e instanceof ProposalApiError) {
    return { message: e.status ? `${e.message} (HTTP ${e.status})` : e.message, problems: e.problems, status: e.status };
  }
  return { message: e instanceof Error ? e.message : String(e), problems: [] };
}

function ErrorBox({ error, testId }: { error: ErrorInfo | null; testId: string }) {
  if (!error) return null;
  return (
    <div class="mt-2 rounded bg-red-900/40 px-3 py-2 text-xs text-red-200" data-testid={testId} role="alert">
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

const parseSkills = (s: string): string[] =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

const INPUT =
  'w-full rounded-md border border-white/10 bg-black/30 p-2 text-xs text-white focus:border-white/30 focus:outline-none disabled:opacity-60';

export default function PersonaProposalsDetail({ pkey }: { pkey: string }) {
  const [detail, setDetail] = useState<PersonaProposalDetail | null>(null);
  const [loadError, setLoadError] = useState<ErrorInfo | null>(null);
  const [adoptedNote, setAdoptedNote] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    return getPersonaProposal(pkey)
      .then(setDetail)
      .catch((e: unknown) => setLoadError(toErrorInfo(e)));
  }, [pkey]);
  useEffect(() => {
    load();
  }, [load]);

  if (loadError?.status === 404) {
    return (
      <div class="rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-white/70" data-testid="load-error">
        Diesen Entwurf gibt es nicht: <span class="font-mono">{pkey}</span>
      </div>
    );
  }
  if (loadError) {
    return (
      <div class="rounded-xl border border-red-700/30 bg-red-900/20 p-5 text-sm text-red-200" data-testid="load-error">
        Entwurf {pkey} konnte nicht geladen werden: {loadError.message}
      </div>
    );
  }
  if (!detail) return <div class="text-xs text-white/40 animate-pulse">Entwurf lädt …</div>;

  return (
    <DetailBody
      // remount form state when the draft reloads after adopt/reject
      key={`${detail.meta.state}`}
      detail={detail}
      adoptedNote={adoptedNote}
      onAdopted={() => {
        setAdoptedNote(true);
        load();
      }}
      onRejected={load}
    />
  );
}

function DetailBody({
  detail,
  adoptedNote,
  onAdopted,
  onRejected,
}: {
  detail: PersonaProposalDetail;
  adoptedNote: boolean;
  onAdopted: () => void;
  onRejected: () => void;
}) {
  const { draft, meta } = detail;
  const state = meta.state;
  const editable = state === 'new';

  const [displayName, setDisplayName] = useState(draft.display_name ?? '');
  const [identity, setIdentity] = useState(draft.identity_prose ?? '');
  const [wertstrom, setWertstrom] = useState(draft.wertstrom ?? '');
  const [streamLead, setStreamLead] = useState(draft.stream_lead ?? '');
  const [skills, setSkills] = useState((draft.skills ?? []).join(', '));

  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'adopt' | 'reject' | null>(null);
  const [adoptError, setAdoptError] = useState<ErrorInfo | null>(null);
  const [rejectError, setRejectError] = useState<ErrorInfo | null>(null);

  async function doAdopt() {
    setBusy('adopt');
    setAdoptError(null);
    try {
      await adoptPersonaProposal(detail.key, {
        display_name: displayName,
        identity_prose: identity,
        wertstrom,
        stream_lead: streamLead,
        skills: parseSkills(skills),
      });
      setConfirming(false);
      onAdopted();
    } catch (e) {
      setConfirming(false);
      setAdoptError(toErrorInfo(e));
    } finally {
      setBusy(null);
    }
  }

  async function doReject() {
    if (!reason.trim()) return;
    setBusy('reject');
    setRejectError(null);
    try {
      await rejectPersonaProposal(detail.key, reason.trim());
      onRejected();
    } catch (e) {
      setRejectError(toErrorInfo(e));
    } finally {
      setBusy(null);
    }
  }

  const created = formatStamp(meta.created, 'created')?.text;
  const adoptedAt = formatStamp(meta.adopted_at, 'adopted_at')?.text;
  const rejectedAt = formatStamp(meta.rejected_at, 'rejected_at')?.text;

  return (
    <div class="space-y-5">
      <div class="rounded-xl border border-white/10 bg-white/5 px-5 py-4">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="font-mono text-lg font-semibold" data-testid="pp-detail-title">
            {detail.key}
          </h2>
          <PersonaStateBadge state={state} />
        </div>
        <div class="mt-1 text-[11px] text-white/40" data-testid="pp-meta">
          {meta.owner && <>Owner {meta.owner}</>}
          {created && <> · erstellt {created}</>}
          {adoptedAt && <> · übernommen {adoptedAt}</>}
          {rejectedAt && <> · abgelehnt {rejectedAt}</>}
          {meta.reason && <> — Grund: {meta.reason}</>}
        </div>
        {adoptedNote && (
          <div class="mt-3 rounded bg-green-900/30 px-3 py-2 text-xs text-green-200" data-testid="pp-adopted-note">
            Persona angelegt. Infrastruktur (Bot/Container) folgt separat.
          </div>
        )}
      </div>

      <section class="rounded-xl border border-white/10 bg-white/5 px-5 py-4">
        <h3 class="mb-2 text-sm font-semibold text-white/80">Stellenbeschreibung</h3>
        <MarkdownText source={detail.stellenbeschreibung_md ?? ''} testId="pp-md" />
      </section>

      <section class="grid gap-3 rounded-xl border border-white/10 bg-white/5 px-5 py-4 md:grid-cols-2">
        <label class="block text-xs text-white/60">
          Anzeigename
          <input class={INPUT} value={displayName} disabled={!editable || busy !== null}
            onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)} />
        </label>
        <label class="block text-xs text-white/60">
          Wertstrom
          <input class={INPUT} value={wertstrom} disabled={!editable || busy !== null}
            onInput={(e) => setWertstrom((e.target as HTMLInputElement).value)} />
        </label>
        <label class="block text-xs text-white/60">
          Stream-Lead
          <input class={INPUT} value={streamLead} disabled={!editable || busy !== null}
            onInput={(e) => setStreamLead((e.target as HTMLInputElement).value)} />
        </label>
        <label class="block text-xs text-white/60">
          Skills (kommagetrennt)
          <input class={INPUT} value={skills} disabled={!editable || busy !== null}
            onInput={(e) => setSkills((e.target as HTMLInputElement).value)} />
          <span class="mt-1 flex flex-wrap gap-1">
            {parseSkills(skills).map((s, i) => (
              <span key={i} class="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white/70">
                {s}
              </span>
            ))}
          </span>
        </label>
        <label class="block text-xs text-white/60 md:col-span-2">
          Identität (identity_prose)
          <textarea class={INPUT} rows={8} value={identity} disabled={!editable || busy !== null}
            onInput={(e) => setIdentity((e.target as HTMLTextAreaElement).value)} />
        </label>
        {draft.rationale && (
          <div class="text-xs text-white/50 md:col-span-2" data-testid="pp-rationale">
            Begründung der Persona: {draft.rationale}
          </div>
        )}
      </section>

      {editable && (
        <section class="grid gap-4 md:grid-cols-2">
          <div class="rounded-xl border border-green-700/30 bg-green-900/10 p-4" data-testid="pp-adopt-section">
            <h3 class="text-sm font-semibold text-green-200">Übernehmen</h3>
            <p class="mt-1 text-xs text-white/50">Legt die Persona mit den oben stehenden Feldern an.</p>
            {!confirming && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={busy !== null}
                class="mt-3 rounded-lg bg-[#E96C00] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#E96C00]/90 disabled:opacity-40"
              >
                Übernehmen
              </button>
            )}
            {confirming && (
              <div role="alertdialog" aria-label="Übernahme bestätigen" data-testid="pp-confirm"
                class="mt-3 rounded-lg bg-amber-900/30 p-3 text-xs text-amber-100">
                <div>
                  Persona <b class="font-mono">{detail.key}</b> jetzt mit den angezeigten Feldern anlegen?
                </div>
                <div class="mt-2 flex gap-2">
                  <button type="button" onClick={doAdopt} disabled={busy !== null}
                    class="rounded-lg bg-[#E96C00] px-3 py-1 font-semibold text-white disabled:opacity-40">
                    {busy === 'adopt' ? 'Übernehme …' : 'Ja, übernehmen'}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} disabled={busy !== null}
                    class="rounded-lg bg-white/10 px-3 py-1 text-white/80 hover:bg-white/20">
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
            <ErrorBox error={adoptError} testId="pp-adopt-error" />
          </div>

          <div class="rounded-xl border border-red-700/30 bg-red-900/10 p-4" data-testid="pp-reject-section">
            <h3 class="text-sm font-semibold text-red-200">Ablehnen</h3>
            <textarea
              value={reason}
              onInput={(e) => setReason((e.target as HTMLTextAreaElement).value)}
              rows={3}
              placeholder="Grund der Ablehnung …"
              aria-label="Grund der Ablehnung"
              class="mt-2 w-full rounded-md border border-white/10 bg-black/30 p-2 text-xs text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
              disabled={busy !== null}
            />
            <button
              type="button"
              onClick={doReject}
              disabled={busy !== null || !reason.trim()}
              class="mt-2 rounded-lg bg-red-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === 'reject' ? 'Lehne ab …' : 'Ablehnen'}
            </button>
            <ErrorBox error={rejectError} testId="pp-reject-error" />
          </div>
        </section>
      )}
    </div>
  );
}
