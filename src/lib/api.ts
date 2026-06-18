import type { AuditReport, AvatarParams } from './wizard-state';
import { GATEWAY_BASE, authHeader } from './gateway-auth';

const API_BASE =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_POMMER_API_URL) ||
  'http://localhost:32050';

export interface TenantCreated {
  id: string;
  bearer_token: string;
  name: string;
  branche: string;
  created_at: string;
}

export interface UploadResponse {
  upload_id: string;
  filename: string;
  size_bytes: number;
  sha256: string;
  qdrant_indexed: boolean;
}

export interface AvatarResponse {
  avatar_url: string;
  parameters: Record<string, unknown>;
  seed_used: number | null;
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function createTenant(name: string, branche: string): Promise<TenantCreated> {
  const res = await fetch(`${API_BASE}/tenants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, branche }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Tenant-Erstellung fehlgeschlagen (${res.status}): ${detail}`);
  }
  return res.json() as Promise<TenantCreated>;
}

export async function uploadFile(
  tenantId: string,
  token: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/tenants/${tenantId}/uploads`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadResponse);
        } catch {
          reject(new Error('Ungültige JSON-Antwort vom Server'));
        }
      } else {
        reject(new Error(`Upload fehlgeschlagen (${xhr.status}): ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Netzwerkfehler beim Upload'));
    xhr.send(formData);
  });
}

export async function deleteUpload(tenantId: string, token: string, uploadId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/tenants/${tenantId}/uploads/${uploadId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Löschen fehlgeschlagen (${res.status})`);
  }
}

export async function runAudit(tenantId: string, token: string): Promise<AuditReport> {
  const res = await fetch(`${API_BASE}/tenants/${tenantId}/audit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Audit fehlgeschlagen (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as { report: AuditReport };
  return data.report;
}

export async function generateAvatar(
  tenantId: string,
  token: string,
  personaKey: string,
  params: AvatarParams,
): Promise<AvatarResponse> {
  const res = await fetch(`${API_BASE}/tenants/${tenantId}/personas/${personaKey}/avatar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Avatar-Generierung fehlgeschlagen (${res.status}): ${detail}`);
  }
  return res.json() as Promise<AvatarResponse>;
}

// --- Activation (P27, Klaus 2026-05-19) ---------------------------------

export interface ActivationRequest {
  persona_keys: string[];
  persona_voice_map?: Record<string, string>;
  upload_count: number;
  mcp_count: number;
  audit_score?: number | null;
}

export interface ActivationResponse {
  activation_id: string;
  tenant_id: string;
  requested_at: string;
  notification_status: 'sent' | 'queued' | 'failed';
  notification_detail?: string | null;
}

export async function requestActivation(
  tenantId: string,
  token: string,
  body: ActivationRequest,
): Promise<ActivationResponse> {
  const res = await fetch(`${API_BASE}/tenants/${tenantId}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Aktivierung fehlgeschlagen (${res.status}): ${detail}`);
  }
  return res.json() as Promise<ActivationResponse>;
}

// --- MCP-Registry (P26a) -------------------------------------------------

export interface McpServer {
  id: string;
  name: string;
  url: string;
  persona_keys: string[] | null;
  created_at: string;
  has_auth: boolean;
}

export interface McpProbeResult {
  ok: boolean;
  tools?: Array<{ name: string; description?: string }>;
  error?: string;
  elapsed_ms?: number;
}

export async function listMcps(tenantId: string, token: string): Promise<McpServer[]> {
  const res = await fetch(`${API_BASE}/tenants/${tenantId}/mcps`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`MCP-Liste fehlgeschlagen (${res.status})`);
  return res.json() as Promise<McpServer[]>;
}

export async function registerMcp(
  tenantId: string,
  token: string,
  body: { name: string; url: string; auth_token?: string; persona_keys?: string[] | null },
): Promise<McpServer> {
  const res = await fetch(`${API_BASE}/tenants/${tenantId}/mcps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`MCP-Anlage fehlgeschlagen (${res.status}): ${detail}`);
  }
  return res.json() as Promise<McpServer>;
}

export async function deleteMcp(tenantId: string, token: string, mcpId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/tenants/${tenantId}/mcps/${mcpId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok && res.status !== 404) throw new Error(`MCP-Löschen fehlgeschlagen (${res.status})`);
}

export async function probeMcp(
  tenantId: string,
  token: string,
  mcpId: string,
): Promise<McpProbeResult> {
  const res = await fetch(`${API_BASE}/tenants/${tenantId}/mcps/${mcpId}/probe`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`MCP-Probe fehlgeschlagen (${res.status}): ${detail}`);
  }
  return res.json() as Promise<McpProbeResult>;
}

export function avatarUrl(tenantId: string, personaKey: string, bust?: number): string {
  const ts = bust ?? Date.now();
  return `${API_BASE}/tenants/${tenantId}/personas/${personaKey}/avatar.webp?t=${ts}`;
}

// --- Persona-Approval-Management (P86) -----------------------------------
//
// Calls the gateway approvals BFF (GATEWAY_BASE/approvals/...). Auth is the
// gateway JWT from the in-browser OAuth-PKCE login (gateway-auth.ts); the JWT
// carries tenant_id, from which the gateway derives X-Pommer-Tenant-Id and
// proxies to hermes-rest /admin with the server-side admin token. SSoT for
// policy is the hermes bundle — we just read/write.

export type ApprovalMode = 'allow' | 'ask' | 'deny' | 'recipient';

export interface ApprovalTool {
  tool: string;
  mode: ApprovalMode;
  always: string | null;
  match_arg: string | null;
  trusted_patterns: string[];
  on_mismatch: string | null;
  /** 'bundle' = explicitly set policy · 'default' = fail-closed 19-tool default. */
  source: 'bundle' | 'default';
}

export interface ApprovalMatrix {
  persona: string;
  tools: ApprovalTool[];
}

export interface ApprovalUpdate {
  mode: ApprovalMode;
  /** recipient-mode only — forwarded verbatim to hermes. */
  trusted_patterns?: string[];
  match_arg?: string;
  on_mismatch?: 'deny' | 'require_approval';
}

export interface ApprovalHistoryEntry {
  /** 'gate_decision' (a tool firing) or 'policy_change' (a PUT). Other keys passthrough. */
  kind?: string;
  tool?: string;
  decision?: string;
  at?: string;
  by?: string;
  [k: string]: unknown;
}

export interface LiveGrant {
  scope: string;
  tool: string;
  conversation_id: string | null;
  ttl_seconds: number | null;
}

export interface ApprovalHistory {
  persona: string;
  total: number;
  limit: number;
  offset: number;
  entries: ApprovalHistoryEntry[];
  audit_enabled: boolean;
  live_grants: LiveGrant[];
}

/** Thrown on a 401 from the gateway → the UI re-initiates the PKCE login. */
export class GatewayAuthError extends Error {
  constructor(message = 'not authenticated') {
    super(message);
    this.name = 'GatewayAuthError';
  }
}

export async function getApprovals(personaKey: string): Promise<ApprovalMatrix> {
  const res = await fetch(`${GATEWAY_BASE}/approvals/personas/${personaKey}`, {
    headers: authHeader(),
  });
  if (res.status === 401) throw new GatewayAuthError();
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Freigaben laden fehlgeschlagen (${res.status}): ${detail}`);
  }
  return res.json() as Promise<ApprovalMatrix>;
}

export async function setApproval(
  personaKey: string,
  tool: string,
  body: ApprovalUpdate,
): Promise<ApprovalTool> {
  const res = await fetch(`${GATEWAY_BASE}/approvals/personas/${personaKey}/tools/${tool}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new GatewayAuthError();
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Freigabe speichern fehlgeschlagen (${res.status}): ${detail}`);
  }
  return res.json() as Promise<ApprovalTool>;
}

export async function getApprovalHistory(
  personaKey: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<ApprovalHistory> {
  const params = new URLSearchParams({
    limit: String(opts.limit ?? 100),
    offset: String(opts.offset ?? 0),
  });
  const res = await fetch(
    `${GATEWAY_BASE}/approvals/personas/${personaKey}/history?${params}`,
    { headers: authHeader() },
  );
  if (res.status === 401) throw new GatewayAuthError();
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Verlauf laden fehlgeschlagen (${res.status}): ${detail}`);
  }
  return res.json() as Promise<ApprovalHistory>;
}
