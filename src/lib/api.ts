import type { AuditReport, AvatarParams } from './wizard-state';

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

export function avatarUrl(tenantId: string, personaKey: string, bust?: number): string {
  const ts = bust ?? Date.now();
  return `${API_BASE}/tenants/${tenantId}/personas/${personaKey}/avatar.webp?t=${ts}`;
}
