/**
 * shopApi.ts — typed client for the Shop-Config-API (H3.3)
 *
 * Base URL: PUBLIC_SHOP_API_BASE (build-time env var, default `/agentfirm-api`).
 *   Default is the SAME-ORIGIN path mount: the CF tunnel routes
 *   shop.pommerconsulting.de/agentfirm-api/* → the agentfirm shop-api (:33400),
 *   so the editor shares the shop's CF-Access perimeter (no public API, no CORS).
 *   Override with a full URL for local dev (e.g. http://localhost:33400/agentfirm-api).
 * Auth: Bearer token from PUBLIC_SHOP_API_TOKEN (eval-only — see NOTE below).
 *   With the same-origin Access-gated deploy the token is OFF on the API; CF
 *   Access on /admin/* + /agentfirm-api/* is the write-gate.
 *
 * ⚠️  AUTH NOTE (eval-only caveat):
 *   PUBLIC_SHOP_API_TOKEN is a build-time env var — any value set here is
 *   baked into the static bundle and visible to anyone who can read the JS.
 *   This is intentional for local eval and staging smoke tests ONLY.
 *   Before any production use this must be replaced with one of:
 *   (a) a server-side proxy that injects the token on the CF-Access-gated edge,
 *   (b) a short-lived JWT issued after CF-Access identity verification, or
 *   (c) a CF-Worker that acts as a BFF (same model as the gateway BFF for P86).
 *   CF Access is the real perimeter gate for /admin/* — the token is a
 *   second factor for the hermes-rest admin API, not a substitute for CF Access.
 */

const SHOP_API_BASE: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_SHOP_API_BASE) ||
  '/agentfirm-api';

const SHOP_API_TOKEN: string | null =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_SHOP_API_TOKEN) || null;

// ---------------------------------------------------------------------------
// Types — mirror the H3.3 PersonaSpec shape
// ---------------------------------------------------------------------------

export interface ApprovalPolicy {
  /** 'always:allow' | 'always:require_approval' | 'always:deny' */
  always?: string;
  match_arg?: string | null;
  trusted_patterns?: string[];
  on_mismatch?: 'deny' | 'require_approval';
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
  baseline_ref: string;
  model: string;
  reasoning: string | null;
  track_sovereign: boolean;
  track_microsoft: boolean;
  skills: string[];
  mcps: string[];
  /** null means "use defaults from catalog" */
  tools: string[] | null;
  wertstrom: string;
  stream_lead: boolean;
  routing_keywords: string[];
  footer_signature: string;
  approval_policies: Record<string, ApprovalPolicy>;
  version: string;
  knowledge: KnowledgeDoc[];
  change_note?: string;
}

export interface CatalogResponse {
  skills: string[];
  mcps: string[];
  tools: string[];
}

export interface CoPersonasResponse {
  co_personas: string[];
}

export interface VersionEntry {
  version: string;
  change_note: string | null;
  created_at: string;
  snapshot: PersonaSpec;
}

export interface VersionsResponse {
  versions: VersionEntry[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (SHOP_API_TOKEN) {
    headers['Authorization'] = `Bearer ${SHOP_API_TOKEN}`;
  }
  return headers;
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${SHOP_API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...buildHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new ShopApiError(res.status, detail || res.statusText);
  }
  return res.json() as Promise<T>;
}

export class ShopApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`ShopAPI ${status}: ${message}`);
    this.name = 'ShopApiError';
  }
}

// ---------------------------------------------------------------------------
// Public API calls
// ---------------------------------------------------------------------------

/** List all persona keys. */
export async function listPersonas(): Promise<{ keys: string[] }> {
  return apiFetch('/personas');
}

/** Fetch the full spec for one persona. */
export async function getPersona(key: string): Promise<PersonaSpec> {
  return apiFetch(`/personas/${encodeURIComponent(key)}`);
}

/**
 * Upsert a persona spec. Pass `change_note` inside the body.
 * Returns the re-read persona after the write.
 */
export async function putPersona(key: string, spec: Partial<PersonaSpec> & { change_note?: string }): Promise<PersonaSpec> {
  return apiFetch(`/personas/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  });
}

/** Delete a persona. */
export async function deletePersona(key: string): Promise<{ deleted: string }> {
  return apiFetch(`/personas/${encodeURIComponent(key)}`, { method: 'DELETE' });
}

/** Stream co-personas (derived, read-only). */
export async function getCoPersonas(key: string): Promise<CoPersonasResponse> {
  return apiFetch(`/personas/${encodeURIComponent(key)}/co-personas`);
}

/** Version history for a persona. */
export async function getVersions(key: string): Promise<VersionsResponse> {
  return apiFetch(`/personas/${encodeURIComponent(key)}/versions`);
}

/** Available options for skills / mcps / tools toggles. */
export async function getCatalog(): Promise<CatalogResponse> {
  return apiFetch('/catalog');
}

// ---------------------------------------------------------------------------
// Avatar / Teams-package (Phase 1+2)
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
  return apiFetch(`/personas/${encodeURIComponent(key)}/avatar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

/** Direct URL to the persona avatar image (for <img src>). `bust` cache-busts after regen. */
export function avatarUrl(key: string, bust?: number): string {
  const q = bust ? `?v=${bust}` : '';
  return `${SHOP_API_BASE}/personas/${encodeURIComponent(key)}/avatar${q}`;
}

/** Direct download URL for the ready-to-sideload Teams app package. */
export function teamsPackageUrl(key: string): string {
  return `${SHOP_API_BASE}/personas/${encodeURIComponent(key)}/teams-package.zip`;
}
