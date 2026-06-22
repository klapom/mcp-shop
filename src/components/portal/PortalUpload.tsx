import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { isAuthenticated, startLogin } from '../../lib/gateway-auth';
import { GatewayAuthError } from '../../lib/api';
import {
  getUpload,
  uploadArtifact,
  type UploadRecord,
  type UploadStatus,
} from '../../lib/portal-api';

/**
 * Wissensportal — Upload + Verifikation (Portal P1, Testpunkt 1: Report).
 *
 * Lädt ein OT-Export (.xoo/.xop/.7z/.zip) zur tenant-isolierten Ingestion hoch
 * und zeigt den Ingestion-Report (Counts), sobald der Job fertig ist. Die Datei
 * geht direkt an die BFF (nie durch den Shop-Prozess); der Tenant kommt aus dem
 * verifizierten Gateway-JWT. Styling: Shop-CI (petrol/grau/anthrazit, hell).
 */

const ACCEPT = '.xoo,.xop,.7z,.zip';
const POLL_MS = 2000;
const TERMINAL: UploadStatus[] = ['ready', 'failed'];

const STATUS_LABEL: Record<UploadStatus, string> = {
  queued: 'In Warteschlange …',
  running: 'Wird verarbeitet …',
  ready: 'Fertig',
  failed: 'Fehlgeschlagen',
};

export default function PortalUpload() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [record, setRecord] = useState<UploadRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setAuthed(isAuthenticated());
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const reLogin = useCallback(() => startLogin('/portal'), []);

  const poll = useCallback(
    (uploadId: string) => {
      getUpload(uploadId)
        .then((rec) => {
          setRecord(rec);
          if (!TERMINAL.includes(rec.status)) {
            pollRef.current = setTimeout(() => poll(uploadId), POLL_MS);
          }
        })
        .catch((e) => {
          if (e instanceof GatewayAuthError) reLogin();
          else setError(String(e?.message ?? e));
        });
    },
    [reLogin],
  );

  const onFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      setError(null);
      setRecord(null);
      setProgress(0);
      setBusy(true);
      uploadArtifact(file, setProgress)
        .then((created) => {
          setProgress(null);
          setRecord({
            upload_id: created.upload_id,
            tenant_id: '',
            filename: created.filename,
            status: created.status,
            report: null,
            error: null,
            created_at: '',
          });
          poll(created.upload_id);
        })
        .catch((e) => {
          setProgress(null);
          if (e instanceof GatewayAuthError) reLogin();
          else setError(String(e?.message ?? e));
        })
        .finally(() => setBusy(false));
    },
    [poll, reLogin],
  );

  if (authed === null) {
    return <div class="text-sm text-grau animate-pulse">lädt …</div>;
  }

  if (!authed) {
    return (
      <div class="rounded-xl border border-[#E5E5EF] bg-white p-8 text-center">
        <p class="mb-4 text-sm text-grau">
          Bitte melde dich an, um deine Konfiguration hochzuladen.
        </p>
        <button
          onClick={reLogin}
          class="inline-flex items-center rounded-md bg-petrol px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-petrol-dark"
        >
          Anmelden
        </button>
      </div>
    );
  }

  return (
    <div class="space-y-6">
      <DropZone disabled={busy} onFile={onFile} />

      {progress !== null && (
        <div>
          <div class="mb-1 text-xs text-grau">Hochladen … {progress}%</div>
          <div class="h-2 w-full overflow-hidden rounded bg-neutral">
            <div class="h-full bg-petrol transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {error && (
        <div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {record && <StatusPanel record={record} />}
    </div>
  );
}

function DropZone({ disabled, onFile }: { disabled: boolean; onFile: (f: File | null) => void }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) onFile(e.dataTransfer?.files?.[0] ?? null);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      class={`cursor-pointer rounded-xl border-2 border-dashed bg-white p-8 text-center transition-colors ${
        over ? 'border-petrol bg-petrol/5' : 'border-[#D8D8E4] hover:border-petrol'
      } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      <p class="text-sm text-anthrazit">
        OT-Export hierher ziehen oder <span class="font-medium text-petrol underline">auswählen</span>
      </p>
      <p class="mt-1 text-xs text-grau">Unterstützt: .xoo · .xop · .7z · .zip</p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        class="hidden"
        onChange={(e) => onFile((e.currentTarget as HTMLInputElement).files?.[0] ?? null)}
      />
    </div>
  );
}

function StatusPanel({ record }: { record: UploadRecord }) {
  const spinning = record.status === 'queued' || record.status === 'running';
  const statusColor =
    record.status === 'ready'
      ? 'text-emerald-700'
      : record.status === 'failed'
        ? 'text-red-700'
        : 'text-grau';
  return (
    <div class="rounded-xl border border-[#E5E5EF] bg-white p-4">
      <div class="flex items-center justify-between">
        <div class="font-mono text-sm text-anthrazit">{record.filename}</div>
        <span class={`text-xs ${statusColor} ${spinning ? 'animate-pulse' : ''}`}>
          {STATUS_LABEL[record.status]}
        </span>
      </div>

      {record.status === 'failed' && record.error && (
        <p class="mt-3 text-sm text-red-700">{record.error}</p>
      )}

      {record.status === 'ready' && record.report && (
        <div class="mt-4">
          <div class="mb-2 text-xs uppercase tracking-wide text-grau">Ingestion-Report</div>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(record.report).map(([k, v]) => (
              <div key={k} class="rounded-lg bg-neutral px-3 py-2">
                <div class="text-lg font-semibold text-anthrazit">{v}</div>
                <div class="text-xs text-grau">{k}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
