/**
 * Client for the Pommer Knowledge Portal BFF (Portal P1).
 *
 * The portal UI lives in the shop but its DATA path is separate: uploads go
 * straight from the browser to the BFF (a distinct service behind the CF tunnel)
 * — never through the Astro process. Auth reuses the gateway PKCE JWT
 * (gateway-auth.ts); the BFF verifies it and derives the tenant from the
 * tenant_id claim, so no tenant id is ever sent from the client.
 */

import { authHeader, getToken } from './gateway-auth';
import { GatewayAuthError } from './api';

const BFF_BASE: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_PORTAL_BFF_URL) ||
  'http://localhost:33340';

export type UploadStatus = 'queued' | 'running' | 'ready' | 'failed';

export interface UploadCreated {
  upload_id: string;
  status: UploadStatus;
  filename: string;
}

export interface IngestReport {
  [key: string]: number;
}

export interface UploadRecord {
  upload_id: string;
  tenant_id: string;
  filename: string;
  status: UploadStatus;
  report: IngestReport | null;
  error: string | null;
  created_at: string;
}

export interface PortalIdentity {
  tenant_id: string;
  user_id: string;
}

function throwOnAuth(status: number): void {
  if (status === 401 || status === 403) throw new GatewayAuthError();
}

/** Verified identity (tenant) — lets the UI confirm the session + scope. */
export async function getMe(): Promise<PortalIdentity> {
  const res = await fetch(`${BFF_BASE}/portal/me`, { headers: authHeader() });
  throwOnAuth(res.status);
  if (!res.ok) throw new Error(`me failed (${res.status})`);
  return res.json() as Promise<PortalIdentity>;
}

/** Upload one XOO/XOP/archive. XHR for upload-progress; Bearer from the JWT. */
export function uploadArtifact(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadCreated> {
  return new Promise((resolve, reject) => {
    const token = getToken();
    if (!token) {
      reject(new GatewayAuthError());
      return;
    }
    const form = new FormData();
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BFF_BASE}/portal/uploads`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }
    xhr.onload = () => {
      if (xhr.status === 401 || xhr.status === 403) {
        reject(new GatewayAuthError());
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as UploadCreated);
      } else {
        reject(new Error(`Upload fehlgeschlagen (${xhr.status}): ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload fehlgeschlagen (Netzwerk).'));
    xhr.send(form);
  });
}

/** Poll one upload's status + ingestion report. */
export async function getUpload(uploadId: string): Promise<UploadRecord> {
  const res = await fetch(`${BFF_BASE}/portal/uploads/${encodeURIComponent(uploadId)}`, {
    headers: authHeader(),
  });
  throwOnAuth(res.status);
  if (!res.ok) throw new Error(`Status-Abruf fehlgeschlagen (${res.status})`);
  return res.json() as Promise<UploadRecord>;
}
