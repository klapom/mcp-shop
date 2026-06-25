/**
 * StandortIQ backend client (browser). Calls the Starlette API on the DGX
 * Spark directly, attaching the gateway JWT (from gateway-auth.ts) as Bearer.
 * The backend verifies the JWT via JWKS and enforces the per-tenant free-run
 * quota — a 402 means the 3 free runs are used up.
 *
 * Endpoint contract: HOGA_V2/docs/SHOP_INTEGRATION_PLAN.md.
 */
import { authHeader } from './gateway-auth';

export const STANDORTIQ_API: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_STANDORTIQ_API_URL) ||
  'https://api-standortiq.pommerconsulting.de';

/**
 * LOCAL DEV ONLY. If PUBLIC_STANDORTIQ_DEV_TOKEN is set (the backend API_TOKEN),
 * the tool calls the backend with it directly and skips the gateway login.
 * NEVER set this in CI/production — it would ship the token to every browser.
 * In dev-bypass mode the per-tenant free-run quota is NOT exercised (the shared
 * token is treated as the internal/unlimited caller by the backend).
 */
export const DEV_TOKEN: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_STANDORTIQ_DEV_TOKEN) || '';

// ── Types ──────────────────────────────────────────────────────────────────

export interface Competitor {
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  rating_count: number | null;
  subcat: string;
  source: string;
}

export type CompetitorGroups = Record<string, Competitor[]>;

export interface PreparedSite {
  session_id: string;
  lat: number;
  lng: number;
  address: string;
  gemeinde_name: string;
  rs_key: string;
  ags: string;
  nuts3: string;
  category: string;
  competitors: CompetitorGroups;
  competitor_counts: Record<string, number>;
}

export interface GenerateResult {
  report_path: string;
  category: string;
  profile_label: string;
  download_url?: string;
  judged_download_url?: string;
}

export interface ReportSection {
  slot: string;
  label: string;
}

export interface ReportSections {
  category: string;
  label: string;
  sections: ReportSection[];
  competitor_types: string[];
  has_fvs: boolean;
  demand_beherbergung: boolean;
  demand_gastronomie: boolean;
}

export interface JobProgressStep {
  t: number;
  msg: string;
}

export interface JobProgress {
  pct: number;
  stage: string;
  label: string;
  detail: string;
  steps: JobProgressStep[];
}

export interface JobStatus {
  job_id: string;
  status: 'running' | 'completed' | 'failed';
  result: GenerateResult | null;
  error: string | null;
  elapsed_seconds?: number;
  progress?: JobProgress;
}

// ── Errors ───────────────────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor() {
    super('auth_required');
    this.name = 'AuthError';
  }
}

/** Thrown on 402 — free runs exhausted, payment required. */
export class QuotaExceededError extends Error {
  constructor(
    public readonly freeRuns: number,
    public readonly runsUsed: number,
  ) {
    super('payment_required');
    this.name = 'QuotaExceededError';
  }
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

function headers(): Record<string, string> {
  const h = DEV_TOKEN ? { Authorization: `Bearer ${DEV_TOKEN}` } : authHeader();
  if (!h.Authorization) throw new AuthError();
  return { 'Content-Type': 'application/json', ...h };
}

async function post(tool: string, body: unknown): Promise<any> {
  const res = await fetch(`${STANDORTIQ_API}/api/v2/${tool}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new AuthError();
  const json = await res.json().catch(() => null);
  if (res.status === 402) {
    throw new QuotaExceededError(json?.free_runs ?? 3, json?.runs_used ?? 0);
  }
  if (!res.ok) throw new Error(json?.error ?? `Fehler ${res.status}`);
  return json;
}

// ── Flow ─────────────────────────────────────────────────────────────────────

export async function getReportSections(category: string): Promise<ReportSections> {
  const wrapped = await post('get_report_sections', { category });
  const d = wrapped.data;
  if (!d || d.error) throw new Error(d?.error ?? 'Abschnitte konnten nicht geladen werden');
  return d as ReportSections;
}

export async function prepareSite(address: string, category: string): Promise<PreparedSite> {
  const wrapped = await post('prepare_site', { address, category });
  const data = wrapped.data;
  if (!data || data.error) throw new Error(data?.error ?? 'Standort konnte nicht aufbereitet werden');
  return data as PreparedSite;
}

export async function saveSelection(
  sessionId: string,
  selected: Record<string, string[]>,
  meetingNotes: string,
): Promise<void> {
  await post('save_selection', {
    session_id: sessionId,
    selected,
    meeting_notes: meetingNotes,
  });
}

export async function startGeneration(input: {
  lat: number;
  lng: number;
  category: string;
  address: string;
  session_id: string;
  gemeinde_name: string;
  rs_key: string;
  ags: string;
  nuts3: string;
  meeting_notes: string;
}): Promise<string> {
  const res = await post('generate_analysis', { ...input, async: true });
  if (!res.job_id) throw new Error('Kein Job gestartet');
  return res.job_id as string;
}

export async function pollJob(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${STANDORTIQ_API}/api/v2/jobs/${jobId}`, { headers: headers() });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) throw new Error(`Status-Abfrage fehlgeschlagen (${res.status})`);
  return (await res.json()) as JobStatus;
}
