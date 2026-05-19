import { useState, useRef } from 'preact/hooks';
import { loadState, saveState } from '../../lib/wizard-state';
import { uploadFile } from '../../lib/api';
import type { UploadRecord } from '../../lib/wizard-state';

const MAX_SIZE_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXT = new Set(['.md', '.txt', '.pdf', '.docx', '.html', '.csv', '.yaml', '.json']);

interface FileEntry {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
  record?: UploadRecord;
}

interface Props {
  onNext: () => void;
  onBack: () => void;
}

function ext(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i >= 0 ? filename.slice(i).toLowerCase() : '';
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileUpload({ onNext, onBack }: Props) {
  const state = loadState();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [done, setDone] = useState<UploadRecord[]>(state.uploads ?? []);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const valid: FileEntry[] = [];
    for (const file of Array.from(files)) {
      if (!ALLOWED_EXT.has(ext(file.name))) continue;
      if (file.size > MAX_SIZE_BYTES) continue;
      valid.push({ file, progress: 0, status: 'pending' });
    }
    setEntries((prev) => [...prev, ...valid]);
  }

  async function uploadAll() {
    const tenantId = state.tenantId!;
    const token = state.token!;
    const pending = entries.filter((e) => e.status === 'pending');
    for (const entry of pending) {
      setEntries((prev) =>
        prev.map((e) => (e.file === entry.file ? { ...e, status: 'uploading' } : e))
      );
      try {
        const res = await uploadFile(tenantId, token, entry.file, (pct) => {
          setEntries((prev) =>
            prev.map((e) => (e.file === entry.file ? { ...e, progress: pct } : e))
          );
        });
        const record: UploadRecord = {
          id: res.upload_id,
          filename: res.filename,
          size: res.size_bytes,
          sha256: res.sha256,
        };
        setEntries((prev) =>
          prev.map((e) => (e.file === entry.file ? { ...e, status: 'done', record } : e))
        );
        setDone((prev) => {
          const next = [...prev, record];
          saveState({ uploads: next });
          return next;
        });
      } catch (err: unknown) {
        setEntries((prev) =>
          prev.map((e) =>
            e.file === entry.file
              ? { ...e, status: 'error', error: err instanceof Error ? err.message : 'Upload-Fehler' }
              : e
          )
        );
      }
    }
  }

  function handleNext() {
    saveState({ uploads: done });
    onNext();
  }

  const hasPending = entries.some((e) => e.status === 'pending');
  const allDone = entries.every((e) => e.status === 'done' || e.status === 'error');

  return (
    <div>
      <h2 class="text-2xl font-bold text-white mb-2">Wissens-Dokumente hochladen</h2>
      <p class="text-gray-400 mb-6">
        Laden Sie Ihre Unternehmens-Dokumente hoch. Erlaubt: .md .txt .pdf .docx .html .csv .yaml .json (max. 15 MB/Datei)
      </p>

      {/* Drop Zone */}
      <div
        class={`rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors mb-6 ${
          dragging ? 'border-indigo-400 bg-indigo-900/20' : 'border-white/20 hover:border-indigo-500/50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer?.files ?? null);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <div class="text-4xl mb-3">📂</div>
        <p class="text-gray-300 font-medium">Dateien hierher ziehen oder klicken</p>
        <p class="text-gray-500 text-sm mt-1">Mehrere Dateien gleichzeitig möglich</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          class="hidden"
          accept=".md,.txt,.pdf,.docx,.html,.csv,.yaml,.json"
          onChange={(e) => addFiles((e.target as HTMLInputElement).files)}
        />
      </div>

      {/* File list (queue) */}
      {entries.length > 0 && (
        <div class="space-y-2 mb-4">
          {entries.map((entry) => (
            <div key={entry.file.name + entry.file.size} class="rounded-lg bg-white/5 border border-white/10 px-4 py-3">
              <div class="flex items-center justify-between gap-2">
                <span class="text-gray-200 text-sm truncate">{entry.file.name}</span>
                <span class="text-gray-500 text-xs flex-shrink-0">{fmtSize(entry.file.size)}</span>
                {entry.status === 'done' && <span class="text-green-400 text-sm flex-shrink-0">✓</span>}
                {entry.status === 'error' && <span class="text-red-400 text-sm flex-shrink-0">✗</span>}
              </div>
              {entry.status === 'uploading' && (
                <div class="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-indigo-500 transition-all"
                    style={{ width: `${entry.progress}%` }}
                  />
                </div>
              )}
              {entry.status === 'error' && (
                <p class="text-red-400 text-xs mt-1">{entry.error}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Previously uploaded */}
      {done.length > 0 && (
        <div class="mb-6">
          <p class="text-sm text-gray-400 mb-2">Erfolgreich hochgeladen ({done.length})</p>
          <div class="space-y-1.5">
            {done.map((r) => (
              <div key={r.id} class="rounded-lg bg-green-900/20 border border-green-800/40 px-3 py-2 flex items-center gap-2">
                <span class="text-green-400 text-sm">✓</span>
                <span class="text-gray-200 text-sm truncate">{r.filename}</span>
                <span class="text-gray-500 text-xs flex-shrink-0 ml-auto">{fmtSize(r.size)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onBack}
          class="rounded-lg border border-white/20 px-6 py-2.5 text-gray-300 hover:bg-white/5 transition-colors"
        >
          Zurück
        </button>

        {hasPending && (
          <button
            type="button"
            onClick={uploadAll}
            class="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 font-semibold text-white transition-colors"
          >
            {entries.filter((e) => e.status === 'pending').length} Dateien hochladen
          </button>
        )}

        <button
          type="button"
          onClick={handleNext}
          class="rounded-lg border border-indigo-500 text-indigo-300 hover:bg-indigo-900/30 px-6 py-2.5 transition-colors"
        >
          {done.length > 0 ? `Weiter zum Audit (${done.length} Dateien)` : 'Überspringen'}
        </button>
      </div>
    </div>
  );
}
