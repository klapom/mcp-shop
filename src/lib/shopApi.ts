/**
 * shopApi.ts — typed client for the agentfirm Shop-API (Persona-Editor).
 *
 * Base URL: PUBLIC_SHOP_API_BASE (build-time env var, default `/agentfirm-api`).
 *   Default is the SAME-ORIGIN path mount: the CF tunnel routes
 *   shop.pommerconsulting.de/agentfirm-api/* → the agentfirm shop-api (:33400).
 *   Override with a full URL for local dev (e.g. http://localhost:33400/agentfirm-api).
 *
 * Auth: NONE from the frontend. Cloudflare Access (login with an allow-listed e-mail)
 * protects /admin/* and /agentfirm-api/* and injects `Cf-Access-Jwt-Assertion`; the API
 * verifies that JWT (no JWT → 401, other e-mail → 403). No token is sent or baked into
 * the bundle.
 *
 * What takes effect when (agent-firm-V1 deploy/persona_rollout.py):
 *   - Freigaben (approval_policies): the gate re-reads them from Neo4j — ≤5 min.
 *   - Everything else (identity, model, thinking, tool groups, Tier-A knowledge) is written
 *     into the gateway profile at container start → needs „Ausrollen" (rollout job).
 *   - Tier-B knowledge text is read live → immediately.
 */

import { parseErrorDetail } from './skillProposalsApi';

const SHOP_API_BASE: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_SHOP_API_BASE) ||
  '/agentfirm-api';

// ---------------------------------------------------------------------------
// Types — mirror agentfirm PersonaSpec after the schema cleanup (agent-firm-V1 #60)
// ---------------------------------------------------------------------------

export type PolicyAlways = 'allow' | 'deny' | 'require_approval' | 'log_only';
export type PolicyMismatch = 'deny' | 'require_approval' | 'log_only';

/**
 * Either `{always}` or the recipient check `{match_arg, trusted_patterns, on_mismatch}`.
 * A recipient check without `match_arg` is rejected by the API (422).
 */
export interface ApprovalPolicy {
  always?: PolicyAlways;
  match_arg?: string | null;
  trusted_patterns?: string[];
  on_mismatch?: PolicyMismatch;
}

export interface KnowledgeDoc {
  /** stable slug (filename stem), e.g. 'omnitracker-fundamentals' */
  name: string;
  title: string;
  /** index line shown in the SOUL.md; server defaults to title if left empty */
  description: string;
  /** full markdown body */
  body: string;
  tags: string[];
  /** 'A' = inline in SOUL.md (always-on), 'B' = on-demand via read_knowledge tool */
  tier: 'A' | 'B';
}

export interface PersonaSpec {
  key: string;
  display_name: string;
  identity_prose: string;
  model: string;
  /** thinking on = any string (the UI sends "medium"), off = null */
  reasoning: string | null;
  /** tool groups (names from tool_groups.yaml) */
  skills: string[];
  wertstrom: string | null;
  stream_lead: boolean;
  approval_policies: Record<string, ApprovalPolicy>;
  version: string | null;
  knowledge: KnowledgeDoc[];
}

/** The only fields a PUT body carries — the removed ones and `key` are never sent. */
export const PERSONA_FIELDS = [
  'display_name',
  'identity_prose',
  'model',
  'reasoning',
  'skills',
  'wertstrom',
  'stream_lead',
  'approval_policies',
  'version',
  'knowledge',
] as const;

export interface ToolGroup {
  name: string;
  namespace: string | null;
  tools: string[];
  /** `tools: "*"` in the yaml → the whole namespace */
  whole_namespace: boolean;
  opt_in: boolean;
  /** known but NOT granted (reason) — derive_allowed_tools skips held groups */
  hold: string | null;
  source: string | null;
  plugin_tools: string[];
}

export interface ModelOption {
  id: string;
  label: string;
  endpoint: string;
  default: boolean;
}

export interface CatalogResponse {
  groups: ToolGroup[];
  models: ModelOption[];
  /** the 19 tools with a built-in default (chat: ask, cron: deny) */
  gated_tools: string[];
}

export interface CoPersonasResponse {
  co_personas: string[];
}

export interface VersionEntry {
  version: string | null;
  change_note: string | null;
  created_at: string;
  snapshot: unknown;
}

export interface VersionsResponse {
  versions: VersionEntry[];
}

export type RuntimeStatus = 'running' | 'stopped' | 'frozen';
export type RolloutState = 'rolling_out' | 'rolled_out' | 'rollout_pending' | 'failed';

export interface RolloutJob {
  pid?: number;
  status: 'running' | 'done' | 'failed' | 'aborted' | string;
  kind?: string;
  by?: string;
  started_at?: string;
  finished_at?: string;
  exit_code?: number;
}

export interface RuntimeItem {
  key: string;
  display_name: string | null;
  status: RuntimeStatus;
  /** Neo4j changed after the last container start (only when running) */
  pending: boolean;
  updated_at: string | null;
  container: { name: string; state: string; started_at: string } | null;
  /** has a Teams manifest in the repo — false = judge */
  teams_app: boolean;
  rollout_state?: RolloutState | null;
  job_status?: string | null;
}

export interface RolloutView {
  state: RolloutState | null;
  job: RolloutJob | null;
  rollout_pending: string | null;
  last_error: string | null;
  rolled_out_at: string | null;
  log_tail?: string;
}

export interface PersonaRuntime extends RuntimeItem {
  rollout: RolloutView;
}

// ---------------------------------------------------------------------------
// Errors + fetch
// ---------------------------------------------------------------------------

export class ShopApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly problems: string[] = [],
  ) {
    super(message);
    this.name = 'ShopApiError';
  }
}

async function rawFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${SHOP_API_BASE}${path}`, { credentials: 'same-origin', ...init });
  } catch (e) {
    // A lapsed CF-Access session answers with a cross-origin redirect to the login,
    // which fetch reports as a network error.
    throw new ShopApiError(
      0,
      `Keine Verbindung zur API (${e instanceof Error ? e.message : String(e)}). ` +
        'Ist die Cloudflare-Access-Sitzung abgelaufen? Seite neu laden.',
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const { message, problems } = parseErrorDetail(res.status, text);
    // pydantic 422: [{msg: "Value error, Freigabe für 'x': …"}] → just the German reason
    throw new ShopApiError(
      res.status,
      problems.length ? 'Nicht gespeichert' : message,
      problems.map((p) => p.replace(/^Value error, /, '')),
    );
  }
  return res;
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await rawFetch(path, init)).json() as Promise<T>;
}

const enc = encodeURIComponent;

// ---------------------------------------------------------------------------
// Public API calls
// ---------------------------------------------------------------------------

/** List all persona keys (fallback when /runtime is unavailable). */
export async function listPersonas(): Promise<{ keys: string[] }> {
  return apiFetch('/personas');
}

/** Runtime status of all personas (running / stopped / frozen + pending). */
export async function listRuntime(): Promise<{ personas: RuntimeItem[] }> {
  return apiFetch('/runtime');
}

/** Runtime status + rollout job (incl. log tail) of one persona. */
export async function getRuntime(key: string): Promise<PersonaRuntime> {
  return apiFetch(`/personas/${enc(key)}/runtime`);
}

/** Start the rollout job (202; 409 when frozen/stopped/already running). */
export async function startRollout(key: string): Promise<{ state: RolloutState; job: RolloutJob | null }> {
  return apiFetch(`/personas/${enc(key)}/rollout`, { method: 'POST' });
}

/** Fetch the full spec for one persona. */
export async function getPersona(key: string): Promise<PersonaSpec> {
  return apiFetch(`/personas/${enc(key)}`);
}

/** PUT body: only PERSONA_FIELDS (+ change_note). */
export function toPutBody(spec: PersonaSpec, changeNote?: string): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of PERSONA_FIELDS) body[f] = spec[f];
  if (changeNote) body.change_note = changeNote;
  return body;
}

/** Full replace of a persona spec. Returns the re-read persona. */
export async function putPersona(spec: PersonaSpec, changeNote?: string): Promise<PersonaSpec> {
  return apiFetch(`/personas/${enc(spec.key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toPutBody(spec, changeNote)),
  });
}

/** Personas in the same Wertstrom (roster info, read-only). */
export async function getCoPersonas(key: string): Promise<CoPersonasResponse> {
  return apiFetch(`/personas/${enc(key)}/co-personas`);
}

/** Version history (newest first; identify entries by created_at, not version). */
export async function getVersions(key: string): Promise<VersionsResponse> {
  return apiFetch(`/personas/${enc(key)}/versions`);
}

/** Tool groups, models and the 19 gated tools. */
export async function getCatalog(): Promise<CatalogResponse> {
  return apiFetch('/catalog');
}

// ---------------------------------------------------------------------------
// Avatar / Teams-package
// ---------------------------------------------------------------------------

export interface AvatarParams {
  gender: string;
  age: string;
  look: string;
  style: string;
  background: string;
  extra?: string | null;
  watermark?: boolean;
}

export interface AvatarResult {
  key: string;
  avatar_url: string;
  seed_used: number;
}

/**
 * Generate (FLUX) + store the persona avatar. Returns the avatar URL + seed.
 * Slow — FLUX takes a few seconds.
 */
export async function generateAvatar(key: string, params: AvatarParams): Promise<AvatarResult> {
  return apiFetch(`/personas/${enc(key)}/avatar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

/** Direct URL to the persona avatar image (for <img src>). `bust` cache-busts after regen. */
export function avatarUrl(key: string, bust?: number): string {
  const q = bust ? `?v=${bust}` : '';
  return `${SHOP_API_BASE}/personas/${enc(key)}/avatar${q}`;
}

/**
 * Build the Teams app package. Every call assigns a NEW package version (only inside the
 * ZIP, never in the repo manifest) — returned via the `X-Teams-Package-Version` header.
 */
export async function fetchTeamsPackage(key: string): Promise<{ blob: Blob; version: string | null }> {
  const res = await rawFetch(`/personas/${enc(key)}/teams-package.zip`);
  return { blob: await res.blob(), version: res.headers.get('X-Teams-Package-Version') };
}

/** Human-readable text of any error (for the red boxes). */
export function errorText(e: unknown): { message: string; problems: string[] } {
  if (e instanceof ShopApiError) {
    return {
      message: e.status ? `${e.message} (HTTP ${e.status})` : e.message,
      problems: e.problems,
    };
  }
  return { message: e instanceof Error ? e.message : String(e), problems: [] };
}
