/**
 * SkillProposalsDetail — H8.14 Variante C: review one skill draft (?p=<persona>&s=<skill>).
 *
 * Shows SKILL.md + every file (references/* included) as plain text, lets Klaus edit/delete
 * editable files, acknowledge PII hits, reject (reason required) or adopt (then polls the
 * job log until the job ends), and start a pending rollout.
 *
 * SECURITY: draft content is untrusted persona output. It is only ever rendered as a Preact
 * text child inside <pre>/<textarea> (auto-escaped) — never via innerHTML.
 */

import { useEffect, useState, useCallback, useRef } from 'preact/hooks';
import {
  getProposal,
  getJob,
  putFile,
  deleteFile,
  ackPii,
  rejectProposal,
  adoptProposal,
  startRollout,
  ProposalApiError,
  OPEN_STATES,
  type ProposalDetail,
  type DraftFile,
  type JobStatus,
} from '../../lib/skillProposalsApi';
import { StateBadge, ScanLights, ItemHints, ReviewBox } from './SkillProposalsList';

const POLL_MS = 1500;

interface ErrorInfo {
  message: string;
  problems: string[];
}

function toErrorInfo(e: unknown): ErrorInfo {
  if (e instanceof ProposalApiError) {
    return { message: e.status ? `${e.message} (HTTP ${e.status})` : e.message, problems: e.problems };
  }
  return { message: e instanceof Error ? e.message : String(e), problems: [] };
}

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

function fileOrder(a: DraftFile, b: DraftFile): number {
  if (a.path === 'SKILL.md') return -1;
  if (b.path === 'SKILL.md') return 1;
  return a.path.localeCompare(b.path);
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function SkillProposalsDetail({ persona, name }: { persona: string; name: string }) {
  const [detail, setDetail] = useState<ProposalDetail | null>(null);
  const [loadError, setLoadError] = useState<ErrorInfo | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [polling, setPolling] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    return getProposal(persona, name)
      .then((d) => {
        setDetail(d);
        return d;
      })
      .catch((e: unknown) => {
        setLoadError(toErrorInfo(e));
        return null;
      });
  }, [persona, name]);

  // Initial load; a draft that already has a job gets its log fetched (and polled if running).
  useEffect(() => {
    load().then((d) => {
      if (d?.job) {
        getJob(persona, name)
          .then((j) => {
            setJob(j);
            if (j.job?.status === 'running') setPolling(true);
          })
          .catch(() => {});
      }
    });
  }, [load]);

  // Job polling until the job leaves "running".
  const pollRef = useRef<number | null>(null);
  useEffect(() => {
    if (!polling) return;
    let stopped = false;
    const tick = async () => {
      try {
        const j = await getJob(persona, name);
        if (stopped) return;
        setJob(j);
        if (j.job?.status !== 'running') {
          setPolling(false);
          load();
          return;
        }
      } catch {
        /* transient — keep polling */
      }
      if (!stopped) pollRef.current = window.setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      stopped = true;
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
  }, [polling, persona, name, load]);

  if (loadError) {
    return (
      <div class="rounded-xl border border-red-700/30 bg-red-900/20 p-5 text-sm text-red-200" data-testid="load-error">
        Entwurf {persona}/{name} konnte nicht geladen werden: {loadError.message}
      </div>
    );
  }
  if (!detail) {
    return <div class="text-xs text-white/40 animate-pulse">Entwurf lädt …</div>;
  }

  const state = detail.state ?? '';
  const isOpen = OPEN_STATES.has(state);
  const canDecide = !polling && (isOpen || (state === 'adopting' && detail.aborted));
  const canRollout = !polling && (state === 'merged' || (state === 'rolling_out' && detail.aborted));
  const files = detail.files.filter((f) => !f.control).sort(fileOrder);

  function onJobStarted() {
    setJob(null);
    setPolling(true);
    load();
  }

  return (
    <div class="space-y-5">
      {/* Header */}
      <div class="rounded-xl border border-white/10 bg-white/5 px-5 py-4">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="font-mono text-lg font-semibold" data-testid="detail-title">
            {detail.persona}/{detail.name}
          </h2>
          <StateBadge state={detail.state} />
          <ScanLights scan={detail.scan} />
        </div>
        <div class="mt-1 text-[11px] text-white/40">
          gesammelt {detail.collected_at ?? '—'}
          {detail.reported_at && <> · gemeldet {detail.reported_at}</>}
          {detail.edited_at && <> · bearbeitet {detail.edited_at}</>}
        </div>
        <div class="mt-3 space-y-1">
          <ReviewBox review={detail.review} />
          <ItemHints item={detail} />
          {detail.rejected_entry && state !== 'rejected' && (
            <div class="text-xs text-amber-300/80">
              Dieser Name steht auf der Ablehnungsliste: {detail.rejected_entry.reason}
            </div>
          )}
        </div>
      </div>

      <ScanSection detail={detail} />
      <PiiSection detail={detail} canAck={isOpen} onChanged={load} />

      {/* Files */}
      <section class="space-y-3">
        <h3 class="text-sm font-semibold text-white/80">Dateien ({files.length})</h3>
        {files.map((f) => (
          <FileCard
            key={f.path}
            persona={persona}
            name={name}
            file={f}
            canEdit={isOpen && !polling}
            onChanged={load}
          />
        ))}
      </section>

      {canDecide && <DecisionSection detail={detail} onRejected={load} onAdoptStarted={onJobStarted} />}
      {canRollout && <RolloutSection detail={detail} onStarted={onJobStarted} />}

      {(polling || job) && <JobLog job={job} polling={polling} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scanner + PII
// ---------------------------------------------------------------------------

function ScanSection({ detail }: { detail: ProposalDetail }) {
  const sc = detail.scan_detail?.scanner;
  if (!detail.scan_detail) {
    return <div class="text-xs text-white/40">Noch kein Scan vorhanden.</div>;
  }
  return (
    <section class="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-xs" data-testid="scan-section">
      <div>
        <span class="text-white/50">Scanner:</span> <b>{sc?.status ?? '—'}</b>
        {sc?.rejection_reason && <span class="text-red-300"> — {sc.rejection_reason}</span>}
        {sc?.error && <span class="text-amber-300"> — {sc.error}</span>}
      </div>
      {!detail.scan_current && (
        <div class="mt-1 text-amber-300/80">
          Scan ist nicht mehr aktuell (Dateien seitdem geändert) — die Übernahme scannt neu.
        </div>
      )}
      {detail.scan_detail.symlinks && detail.scan_detail.symlinks.length > 0 && (
        <div class="mt-1 text-red-300">Symlinks: {detail.scan_detail.symlinks.join(', ')}</div>
      )}
    </section>
  );
}

function PiiSection({ detail, canAck, onChanged }: { detail: ProposalDetail; canAck: boolean; onChanged: () => void }) {
  const hits = detail.scan_detail?.pii ?? [];
  const acked = new Set(detail.meta?.pii_ack ?? []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);

  if (hits.length === 0) return null;

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await ackPii(detail.persona, detail.name, [...selected]);
      setSelected(new Set());
      onChanged();
    } catch (e) {
      setError(toErrorInfo(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="rounded-xl border border-red-700/30 bg-red-900/10 px-5 py-3" data-testid="pii-section">
      <h3 class="text-sm font-semibold text-red-200">PII-Treffer ({hits.length})</h3>
      <p class="mt-1 text-xs text-white/50">
        Jeder offene Treffer blockt die Übernahme. Entweder die Stelle unten korrigieren oder bewusst als
        „kein PII" bestätigen.
      </p>
      <ul class="mt-2 space-y-1 text-xs">
        {hits.map((h) => {
          const isAcked = acked.has(h.id);
          return (
            <li key={h.id} class="flex items-start gap-2">
              <input
                type="checkbox"
                class="mt-0.5"
                aria-label={`PII ${h.file}:${h.line} als kein PII bestätigen`}
                checked={isAcked || selected.has(h.id)}
                disabled={isAcked || !canAck || busy}
                onChange={() => toggle(h.id)}
              />
              <span>
                <span class="font-mono text-white/80">
                  {h.file}:{h.line}
                </span>{' '}
                <span class="text-white/50">({h.kind})</span>{' '}
                <code class="rounded bg-black/30 px-1 text-red-200">{h.match}</code>
                {isAcked && <span class="ml-1 text-green-300">bestätigt</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {canAck && (
        <button
          type="button"
          onClick={submit}
          disabled={busy || selected.size === 0}
          class="mt-2 rounded-lg bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20 disabled:opacity-40"
        >
          {busy ? 'Bestätige …' : `Ausgewählte als „kein PII" bestätigen (${selected.size})`}
        </button>
      )}
      <ErrorBox error={error} testId="pii-error" />
    </section>
  );
}

// ---------------------------------------------------------------------------
// One file: read (as text), edit, delete
// ---------------------------------------------------------------------------

interface FileCardProps {
  persona: string;
  name: string;
  file: DraftFile;
  canEdit: boolean;
  onChanged: () => void;
}

function FileCard({ persona, name, file, canEdit, onChanged }: FileCardProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(file.content ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!editing) setText(file.content ?? '');
  }, [file.content]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await putFile(persona, name, file.path, text);
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(toErrorInfo(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteFile(persona, name, file.path);
      setConfirmDelete(false);
      onChanged();
    } catch (e) {
      setError(toErrorInfo(e));
    } finally {
      setBusy(false);
    }
  }

  const editable = canEdit && !!file.editable && file.content != null;
  const deletable = canEdit && !!file.editable && file.path !== 'SKILL.md';

  return (
    <div class="rounded-xl border border-white/10 bg-white/5" data-testid={`file-${file.path}`}>
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2">
        <div class="text-xs">
          <span class="font-mono text-white">{file.path}</span>
          {file.size != null && <span class="ml-2 text-white/40">{file.size} B</span>}
          {file.symlink && <span class="ml-2 text-red-300">Symlink → {file.target}</span>}
          {!file.symlink && !file.editable && <span class="ml-2 text-white/40">nicht editierbar</span>}
        </div>
        <div class="flex gap-2">
          {editable && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              class="rounded-lg bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
            >
              Bearbeiten
            </button>
          )}
          {deletable && !editing && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              class="rounded-lg border border-red-700/30 px-3 py-1 text-xs text-red-400 hover:bg-red-900/20"
            >
              Löschen
            </button>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div class="flex flex-wrap items-center gap-2 bg-red-900/20 px-4 py-2 text-xs text-red-200" data-testid="confirm-delete">
          <span>
            <b>{file.path}</b> wirklich aus dem Entwurf löschen?
          </span>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            class="rounded-lg bg-red-700 px-3 py-1 font-medium text-white hover:bg-red-600 disabled:opacity-50"
          >
            {busy ? 'Löschen …' : 'Ja, löschen'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            disabled={busy}
            class="rounded-lg px-3 py-1 text-white/70 hover:text-white"
          >
            Abbrechen
          </button>
        </div>
      )}

      <div class="p-4">
        {editing ? (
          <>
            <textarea
              value={text}
              onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
              rows={Math.min(40, Math.max(8, text.split('\n').length + 2))}
              class="w-full rounded-md border border-white/10 bg-black/30 p-3 font-mono text-xs text-white focus:border-white/30 focus:outline-none"
              aria-label={`Inhalt von ${file.path}`}
              disabled={busy}
            />
            <div class="mt-2 flex gap-2">
              <button
                type="button"
                onClick={save}
                disabled={busy || text === (file.content ?? '')}
                class="rounded-lg bg-[#E96C00] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#E96C00]/90 disabled:opacity-40"
              >
                {busy ? 'Speichern …' : 'Speichern'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setText(file.content ?? '');
                }}
                disabled={busy}
                class="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20"
              >
                Abbrechen
              </button>
            </div>
          </>
        ) : file.symlink ? (
          <div class="text-xs text-red-300">Symlinks werden nicht gelesen und blockieren die Übernahme.</div>
        ) : file.too_large ? (
          <div class="text-xs text-white/50">Datei zu groß für die Anzeige.</div>
        ) : file.binary ? (
          <div class="text-xs text-white/50">Binärdatei — keine Textanzeige.</div>
        ) : (
          <pre class="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-white/80" data-testid="file-content">
            {file.content ?? ''}
          </pre>
        )}
        <ErrorBox error={error} testId="file-error" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Decisions: reject / adopt / rollout
// ---------------------------------------------------------------------------

function DecisionSection({
  detail,
  onRejected,
  onAdoptStarted,
}: {
  detail: ProposalDetail;
  onRejected: () => void;
  onAdoptStarted: () => void;
}) {
  const [reason, setReason] = useState('');
  const [acceptCode, setAcceptCode] = useState(false);
  const [rollout, setRollout] = useState(true);
  const [busy, setBusy] = useState<'reject' | 'adopt' | null>(null);
  const [rejectError, setRejectError] = useState<ErrorInfo | null>(null);
  const [adoptError, setAdoptError] = useState<ErrorInfo | null>(null);
  const carriesCode = !!detail.scan?.carries_code;

  async function doReject() {
    setBusy('reject');
    setRejectError(null);
    try {
      await rejectProposal(detail.persona, detail.name, reason.trim());
      onRejected();
    } catch (e) {
      setRejectError(toErrorInfo(e));
    } finally {
      setBusy(null);
    }
  }

  async function doAdopt() {
    setBusy('adopt');
    setAdoptError(null);
    try {
      await adoptProposal(detail.persona, detail.name, { accept_code: carriesCode && acceptCode, rollout });
      onAdoptStarted();
    } catch (e) {
      setAdoptError(toErrorInfo(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section class="grid gap-4 md:grid-cols-2">
      <div class="rounded-xl border border-green-700/30 bg-green-900/10 p-4" data-testid="adopt-section">
        <h3 class="text-sm font-semibold text-green-200">Übernehmen</h3>
        <p class="mt-1 text-xs text-white/50">
          Scannt neu, merged den Entwurf per PR nach agent-firm-V1 und rollt ihn (optional) aus.
        </p>
        {carriesCode && (
          <label class="mt-2 flex items-center gap-2 text-xs text-amber-200">
            <input
              type="checkbox"
              checked={acceptCode}
              onChange={(e) => setAcceptCode((e.target as HTMLInputElement).checked)}
              disabled={busy !== null}
            />
            Code akzeptieren (der Entwurf enthält ausführbare Dateien)
          </label>
        )}
        <label class="mt-2 flex items-center gap-2 text-xs text-white/70">
          <input
            type="checkbox"
            checked={rollout}
            onChange={(e) => setRollout((e.target as HTMLInputElement).checked)}
            disabled={busy !== null}
          />
          danach sofort ausrollen
        </label>
        <button
          type="button"
          onClick={doAdopt}
          disabled={busy !== null}
          class="mt-3 rounded-lg bg-[#E96C00] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#E96C00]/90 disabled:opacity-40"
        >
          {busy === 'adopt' ? 'Starte …' : 'Übernehmen'}
        </button>
        <ErrorBox error={adoptError} testId="adopt-error" />
      </div>

      <div class="rounded-xl border border-red-700/30 bg-red-900/10 p-4" data-testid="reject-section">
        <h3 class="text-sm font-semibold text-red-200">Ablehnen</h3>
        <p class="mt-1 text-xs text-white/50">
          Archiviert den Entwurf im Container und sperrt den Namen. Grund ist Pflicht.
        </p>
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
        <ErrorBox error={rejectError} testId="reject-error" />
      </div>
    </section>
  );
}

function RolloutSection({ detail, onStarted }: { detail: ProposalDetail; onStarted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await startRollout(detail.persona, detail.name);
      onStarted();
    } catch (e) {
      setError(toErrorInfo(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="rounded-xl border border-emerald-700/30 bg-emerald-900/10 p-4" data-testid="rollout-section">
      <h3 class="text-sm font-semibold text-emerald-200">Rollout</h3>
      <p class="mt-1 text-xs text-white/50">
        Der Skill ist gemergt, aber noch nicht bei der Persona ausgerollt.
      </p>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        class="mt-2 rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
      >
        {busy ? 'Starte …' : 'Rollout starten'}
      </button>
      <ErrorBox error={error} testId="rollout-error" />
    </section>
  );
}

function JobLog({ job, polling }: { job: JobStatus | null; polling: boolean }) {
  const status = job?.job?.status;
  return (
    <section class="rounded-xl border border-white/10 bg-black/40 p-4" data-testid="job-log">
      <div class="mb-2 flex items-center gap-2 text-xs">
        <span class="font-semibold text-white/80">Job-Log</span>
        {job?.job?.kind && <span class="text-white/50">({job.job.kind === 'rollout' ? 'Rollout' : 'Übernahme'})</span>}
        {polling ? (
          <span class="animate-pulse text-amber-300" data-testid="job-status">läuft …</span>
        ) : (
          <span
            data-testid="job-status"
            class={status === 'done' ? 'text-green-300' : status ? 'text-red-300' : 'text-white/50'}
          >
            {status === 'done' ? 'fertig' : status === 'failed' ? 'fehlgeschlagen' : status === 'aborted' ? 'abgebrochen' : status ?? '—'}
            {job?.job?.exit_code != null && ` (Exit ${job.job.exit_code})`}
          </span>
        )}
      </div>
      <pre class="max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-white/70" data-testid="job-log-text">
        {job?.log_tail || (polling ? 'warte auf Ausgabe …' : '(leer)')}
      </pre>
      {job?.last_error && <div class="mt-2 text-xs text-red-300">Fehler: {job.last_error}</div>}
    </section>
  );
}
