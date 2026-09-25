/**
 * skillProposalsApi.ts — typed client for the skill-proposal review API (H8.14 Variante C).
 *
 * Base: same-origin `/agentfirm-api/skill-proposals` (override the prefix with
 * PUBLIC_SHOP_API_BASE, like shopApi.ts). The CF tunnel routes /agentfirm-api/* to the
 * agentfirm shop-api (:33400).
 *
 * Auth: NONE from the frontend. Cloudflare Access (Klaus-only app on /admin + /agentfirm-api)
 * authenticates the browser via its cookie and injects `Cf-Access-Jwt-Assertion`; the API
 * verifies that JWT. No bearer token is sent or baked into the bundle.
 *
 * All draft content (SKILL.md, references/*) is UNTRUSTED persona output — render it as
 * text only, never via innerHTML.
 */

const API_BASE: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_SHOP_API_BASE) ||
  '/agentfirm-api';

const BASE = `${API_BASE}/skill-proposals`;

// ---------------------------------------------------------------------------
// Types — mirror agentfirm.shop_api.proposals_api
// ---------------------------------------------------------------------------

export type ProposalState =
  | 'new'
  | 'reported'
  | 'edited'
  | 'adopting'
  | 'merged'
  | 'rolling_out'
  | 'rolled_out'
  | 'rejected';

export const OPEN_STATES: ReadonlySet<string> = new Set(['new', 'reported', 'edited']);

export interface ScanSummary {
  scanner: 'pass' | 'fail' | 'error' | string | null;
  pii_total: number;
  pii_open: number;
  carries_code: boolean;
  symlinks: number;
  scanned_at: string | null;
}

export interface JobView {
  pid?: number;
  status: 'running' | 'done' | 'failed' | 'aborted' | string;
  kind?: 'adopt' | 'rollout' | string;
  started_at?: string;
  finished_at?: string;
  exit_code?: number;
  [k: string]: unknown;
}

export interface ProposalItem {
  persona: string;
  name: string;
  state: ProposalState | string | null;
  aborted: boolean;
  collected_at: string | null;
  reported_at: string | null;
  edited_at: string | null;
  /** who did what (H8.14e) — e-mail from the verified Access JWT or `cli:<user>`; absent on old drafts */
  edited_by?: string | null;
  rejected_at?: string | null;
  rejected_by?: string | null;
  adopted_at?: string | null;
  adopted_by?: string | null;
  rollout_at?: string | null;
  rollout_by?: string | null;
  container_changed: boolean;
  pr: string | null;
  rollout_pending: string | null;
  last_error: string | null;
  reason: string | null;
  /** only set when the name is on the reject list; how often the persona re-proposed it */
  repeats: number | null;
  scan: ScanSummary | null;
  /** Skilli's structured verdict (_review.json), shape not frozen yet */
  review: Record<string, unknown> | null;
  job: JobView | null;
}

export interface RejectedEntry {
  reason: string;
  at: string;
  /** who rejected (H8.14e); missing on entries written before */
  by?: string | null;
  sha256?: string;
  repeats: number;
  reported: number;
  last_seen?: string;
}

export interface ProposalList {
  proposals: ProposalItem[];
  rejected: Record<string, RejectedEntry>;
  repo_index: unknown[];
}

export interface PiiHit {
  id: string;
  kind: string;
  file: string;
  line: number;
  match: string;
}

export interface ScanDetail {
  scanned_at?: string;
  tree_sha256?: string;
  scanner?: { status?: string; rejection_reason?: string | null; error?: string | null; [k: string]: unknown };
  pii?: PiiHit[];
  carries_code?: boolean;
  symlinks?: string[];
  [k: string]: unknown;
}

export interface DraftFile {
  path: string;
  size?: number;
  control?: boolean;
  editable?: boolean;
  content?: string | null;
  too_large?: boolean;
  binary?: boolean;
  symlink?: boolean;
  target?: string;
}

export interface ProposalDetail extends ProposalItem {
  meta: Record<string, unknown> & { pii_ack?: string[] };
  scan_detail: ScanDetail | null;
  scan_current: boolean;
  files: DraftFile[];
  rejected_entry: RejectedEntry | null;
}

export interface JobStatus {
  state: string | null;
  job: JobView | null;
  rollout_pending: string | null;
  last_error: string | null;
  pr: string | null;
  log_tail: string;
}

// ---------------------------------------------------------------------------
// Errors — FastAPI `detail` is a string, an object {message, problems}, or a list
// ---------------------------------------------------------------------------

export class ProposalApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly problems: string[] = [],
  ) {
    super(message);
    this.name = 'ProposalApiError';
  }
}

/** Turn a FastAPI error body into {message, problems}. Exported for tests/readability. */
export function parseErrorDetail(status: number, bodyText: string): { message: string; problems: string[] } {
  let detail: unknown = bodyText;
  try {
    const parsed = JSON.parse(bodyText);
    detail = parsed && typeof parsed === 'object' && 'detail' in parsed ? parsed.detail : parsed;
  } catch {
    /* plain text body */
  }
  if (typeof detail === 'string') {
    return { message: detail || `HTTP ${status}`, problems: [] };
  }
  if (Array.isArray(detail)) {
    // pydantic validation errors
    return {
      message: `HTTP ${status}`,
      problems: detail.map((d) => (d && typeof d === 'object' && 'msg' in d ? String((d as any).msg) : JSON.stringify(d))),
    };
  }
  if (detail && typeof detail === 'object') {
    const d = detail as Record<string, unknown>;
    const problems = Array.isArray(d.problems) ? d.problems.map(String) : [];
    if (Array.isArray(d.ids)) problems.push(...d.ids.map(String));
    return { message: typeof d.message === 'string' ? d.message : `HTTP ${status}`, problems };
  }
  return { message: `HTTP ${status}`, problems: [] };
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { credentials: 'same-origin', ...init });
  } catch (e) {
    // A lapsed CF-Access session answers with a cross-origin redirect to the login,
    // which fetch reports as a network error.
    throw new ProposalApiError(
      0,
      `Keine Verbindung zur API (${e instanceof Error ? e.message : String(e)}). ` +
        'Ist die Cloudflare-Access-Sitzung abgelaufen? Seite neu laden.',
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const { message, problems } = parseErrorDetail(res.status, text);
    throw new ProposalApiError(res.status, message, problems);
  }
  return res.json() as Promise<T>;
}

function seg(s: string): string {
  return encodeURIComponent(s);
}

function draftPath(persona: string, name: string): string {
  return `/${seg(persona)}/${seg(name)}`;
}

/** Encode a draft-relative file path segment by segment (keeps the `/` separators). */
function filePath(rel: string): string {
  return rel.split('/').map(seg).join('/');
}

function jsonBody(body: unknown): RequestInit {
  return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export function listProposals(): Promise<ProposalList> {
  return apiFetch('');
}

export function getProposal(persona: string, name: string): Promise<ProposalDetail> {
  return apiFetch(draftPath(persona, name));
}

export function getJob(persona: string, name: string): Promise<JobStatus> {
  return apiFetch(`${draftPath(persona, name)}/job`);
}

export function putFile(persona: string, name: string, rel: string, content: string): Promise<unknown> {
  return apiFetch(`${draftPath(persona, name)}/files/${filePath(rel)}`, { method: 'PUT', ...jsonBody({ content }) });
}

export function deleteFile(persona: string, name: string, rel: string): Promise<unknown> {
  return apiFetch(`${draftPath(persona, name)}/files/${filePath(rel)}`, { method: 'DELETE' });
}

export function ackPii(persona: string, name: string, ids: string[]): Promise<unknown> {
  return apiFetch(`${draftPath(persona, name)}/pii-ack`, { method: 'POST', ...jsonBody({ ids }) });
}

export function rejectProposal(persona: string, name: string, reason: string): Promise<unknown> {
  return apiFetch(`${draftPath(persona, name)}/reject`, { method: 'POST', ...jsonBody({ reason }) });
}

export function adoptProposal(
  persona: string,
  name: string,
  opts: { accept_code: boolean; rollout: boolean },
): Promise<{ state: string; job: JobView | null }> {
  return apiFetch(`${draftPath(persona, name)}/adopt`, { method: 'POST', ...jsonBody(opts) });
}

export function startRollout(persona: string, name: string): Promise<{ state: string; job: JobView | null }> {
  return apiFetch(`${draftPath(persona, name)}/rollout`, { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Shared helpers for the UI
// ---------------------------------------------------------------------------

export const STATE_LABELS: Record<string, string> = {
  new: 'neu',
  reported: 'gemeldet',
  edited: 'bearbeitet',
  adopting: 'Übernahme läuft',
  merged: 'gemergt',
  rolling_out: 'Rollout läuft',
  rolled_out: 'ausgerollt',
  rejected: 'abgelehnt',
};

/** Deep-link format used by the Teams ping: /admin/skills/?p=<persona>&s=<skill> */
export function detailHref(persona: string, name: string): string {
  return `/admin/skills/?p=${encodeURIComponent(persona)}&s=${encodeURIComponent(name)}`;
}

export const PERSONA_RE = /^[a-z0-9-]+$/;
export const SKILL_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Only http(s) links to GitHub are rendered as <a href> (no javascript:/data: URLs). */
export function safePrUrl(pr: string | null | undefined): string | null {
  return pr && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(pr) ? pr : null;
}

// ---------------------------------------------------------------------------
// Timestamps + actors (H8.14e)
// ---------------------------------------------------------------------------

/** All times are shown in this zone, German format ("25.09.2026, 07:21"). */
export const DISPLAY_TZ = 'Europe/Berlin';

/**
 * Legacy timestamps WITHOUT zone (written before H8.14e) are read per field, because the
 * writer determines the zone (measured 2026-09-25):
 *  - `reported_at`, `reviewed_at`: written inside Skilli's container, whose system TZ is UTC
 *    → read as UTC.
 *  - everything else (`collected_at`, `rejected_at`, `_rejected.json` `at`, `edited_at`, job
 *    times, …): written on the Spark host (Europe/Berlin) → read as Berlin wall-clock time.
 * New values carry a zone (`…+00:00`) and are converted exactly. Legacy files are NOT
 * migrated; the tooltip of a legacy value says how it was read.
 */
export const NAIVE_UTC_FIELDS: ReadonlySet<string> = new Set(['reported_at', 'reviewed_at']);

const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;
const NAIVE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

const FMT = new Intl.DateTimeFormat('de-DE', {
  timeZone: DISPLAY_TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export interface Stamp {
  text: string;
  /** set for legacy values without zone: how they were interpreted */
  title?: string;
}

/** Format an ISO timestamp for display in Europe/Berlin. `field` decides legacy handling. */
export function formatStamp(value: string | null | undefined, field = ''): Stamp | null {
  if (!value) return null;
  const v = value.trim();
  if (HAS_ZONE.test(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? { text: v } : { text: FMT.format(d) };
  }
  const m = NAIVE.exec(v);
  if (!m) return { text: v };
  if (NAIVE_UTC_FIELDS.has(field)) {
    const d = new Date(`${v}Z`);
    return Number.isNaN(d.getTime())
      ? { text: v }
      : { text: FMT.format(d), title: 'Altwert ohne Zeitzone — als UTC gelesen (im Container geschrieben)' };
  }
  const [, y, mo, da, h, mi] = m;
  return {
    text: `${da}.${mo}.${y}, ${h}:${mi}`,
    title: 'Altwert ohne Zeitzone — als Ortszeit Europe/Berlin gelesen (auf dem Host geschrieben)',
  };
}

/** `cli:admin` → `admin (CLI)`; e-mails unchanged. */
export function formatActor(by: string | null | undefined): string | null {
  if (!by) return null;
  return by.startsWith('cli:') ? `${by.slice(4) || 'unbekannt'} (CLI)` : by;
}
